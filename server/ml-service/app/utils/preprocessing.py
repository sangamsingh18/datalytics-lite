"""
ML preprocessing utilities — moved unchanged from the original
server/services/ml_service.py (and server/app/services/ml_service.py).

Handles: memory optimization, dataset sampling, target-column inference,
missing-value handling, encoding, scaling, and train/test splitting for the
ML training pipeline. This is the "feature preparation" step that runs
before train_supervised() / train_clustering() in model.service.py.
"""
from __future__ import annotations

import gc
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, MinMaxScaler, StandardScaler


def optimize_memory(df: pd.DataFrame) -> pd.DataFrame:
    """Downcast numerics and convert low-cardinality objects to categoricals."""
    for col in df.select_dtypes(include=["int64", "int32"]).columns:
        df[col] = pd.to_numeric(df[col], downcast="integer")
    for col in df.select_dtypes(include=["float64"]).columns:
        df[col] = pd.to_numeric(df[col], downcast="float")
    for col in df.select_dtypes(include=["object"]).columns:
        if df[col].nunique() / max(len(df), 1) < 0.5:
            df[col] = df[col].astype("category")
    return df

def get_sampling_info(n_total: int) -> dict:
    if n_total <= 100_000:
        return {"sampled": False, "sample_size": n_total, "ratio": 1.0}
    elif n_total <= 250_000:
        sample_size = min(max(30_000, n_total // 8), 40_000)
    elif n_total <= 500_000:
        sample_size = 50_000
    else:
        sample_size = 60_000
    return {"sampled": True, "sample_size": sample_size, "ratio": round(sample_size / n_total, 3)}

def _is_large_dataset(n_rows: int, n_cols: int = 0) -> bool:
    return n_rows >= 150_000 or n_cols >= 150

def _projected_ohe_feature_count(df: pd.DataFrame, columns: list[str]) -> int:
    total = 0
    for column in columns:
        unique_count = int(df[column].nunique(dropna=True))
        total += max(unique_count - 1, 1)
    return total

def _sample_frame(df: pd.DataFrame, max_rows: int) -> pd.DataFrame:
    if len(df) <= max_rows:
        return df.reset_index(drop=True)
    return df.sample(n=max_rows, random_state=42).reset_index(drop=True)

def _sample_training_arrays(
    X: np.ndarray,
    y: np.ndarray,
    task_type: str,
    max_rows: int,
) -> tuple[np.ndarray, np.ndarray]:
    if len(X) <= max_rows:
        return X, y

    if task_type == "Classification":
        try:
            X_sampled, _, y_sampled, _ = train_test_split(
                X,
                y,
                train_size=max_rows,
                stratify=y,
                random_state=42,
            )
            return X_sampled, y_sampled
        except Exception:
            pass

    rng = np.random.default_rng(42)
    indices = rng.choice(len(X), size=max_rows, replace=False)
    return X[indices], y[indices]

def _safe_random_state(random_state: int) -> int:
    try:
        return int(random_state)
    except Exception:
        return 42

def _safe_test_count(n_rows: int, test_size: float) -> int:
    if n_rows <= 1:
        return 0
    try:
        ratio = float(test_size)
    except Exception:
        ratio = 0.2
    ratio = min(max(ratio, 0.1), 0.5)
    return min(max(1, int(round(n_rows * ratio))), n_rows - 1)

def _normalise_name(name: str) -> str:
    return "".join(ch for ch in str(name).strip().lower() if ch.isalnum())

def _is_identifier_like(column_name: str, series: pd.Series) -> bool:
    normalised_name = _normalise_name(column_name)
    if any(hint in normalised_name for hint in IDENTIFIER_HINTS) or normalised_name.endswith("id"):
        return True

    non_null = series.dropna()
    if len(non_null) < 12:
        return False

    as_text = non_null.astype(str).str.strip()
    unique_ratio = float(as_text.nunique(dropna=True) / max(len(as_text), 1))
    numeric_ratio = float(pd.to_numeric(non_null, errors="coerce").notna().mean())
    return unique_ratio >= 0.98 and numeric_ratio >= 0.8

def _infer_task_type_from_target(series: pd.Series) -> str:
    non_null = series.dropna()
    if non_null.empty:
        return "Classification"

    as_text = non_null.astype(str).str.strip()
    numeric_ratio = float(pd.to_numeric(non_null, errors="coerce").notna().mean())
    unique_count = int(as_text.nunique(dropna=True))
    threshold = min(20, max(6, int(len(as_text) * 0.1)))
    return "Regression" if numeric_ratio >= 0.8 and unique_count > threshold else "Classification"

def _recommend_target_column(df: pd.DataFrame, exclude: Optional[list[str]] = None) -> Optional[str]:
    excluded = set(exclude or [])
    candidates = [str(column) for column in df.columns.tolist() if str(column) not in excluded]
    if not candidates:
        return None

    def _score(column_name: str) -> float:
        series = df[column_name]
        non_null = series.dropna()
        if non_null.empty:
            return -1_000.0

        normalised_name = _normalise_name(column_name)
        unique_count = int(non_null.astype(str).nunique(dropna=True))
        unique_ratio = float(unique_count / max(len(non_null), 1))
        numeric_ratio = float(pd.to_numeric(non_null, errors="coerce").notna().mean())
        identifier_like = _is_identifier_like(column_name, series)

        score = 0.0
        if any(hint in normalised_name for hint in TARGET_HINTS):
            score += 40.0
        if identifier_like:
            score -= 80.0
        if 2 <= unique_count <= max(12, int(len(non_null) * 0.2)):
            score += 25.0
        if numeric_ratio >= 0.8 and unique_count > min(20, max(8, int(len(non_null) * 0.1))):
            score += 12.0
        if unique_ratio >= 0.98:
            score -= 20.0
        if series.nunique(dropna=True) <= 1:
            score -= 100.0
        return score

    ranked = sorted(candidates, key=_score, reverse=True)
    if not ranked:
        return None

    best = ranked[0]
    if _score(best) > -50:
        return best

    non_identifier = [column for column in ranked if not _is_identifier_like(column, df[column])]
    return non_identifier[0] if non_identifier else best

def preprocess(
    df: pd.DataFrame,
    target_col: str,
    task_type: str,
    missing_strategy: Optional[str],
    encode_method: Optional[str],
    manual_encoding_rules: Optional[List[Any]] = None,
    scaling_method: str = "None",
    test_size: float = 0.2,
    random_state: int = 42,
) -> dict:
    """
    Full preprocessing pipeline. Returns a dict with all session-storable objects.
    Mirrors the Streamlit preprocessing section exactly.
    """
    df = df.copy()
    if df.empty:
        raise ValueError("The dataset is empty.")

    df.columns = [str(column) for column in df.columns.tolist()]

    # Convert category dtype back to object for processing
    for col in df.select_dtypes(include="category").columns:
        df[col] = df[col].astype(str)

    if target_col not in df.columns:
        fallback_target = _recommend_target_column(df)
        if not fallback_target:
            raise ValueError("No usable target column was found in the dataset.")
        target_col = fallback_target

    auto_warnings: List[str] = []
    num_cols = df.select_dtypes(include=np.number).columns.tolist()
    cat_cols = df.select_dtypes(include=["object", "category", "bool"]).columns.tolist()
    large_dataset_mode = _is_large_dataset(len(df), df.shape[1])

    # 1. Missing values
    if missing_strategy == "Drop rows with missing values":
        df = df.dropna().copy()
    elif missing_strategy == "Fill with mean (numeric)":
        for c in num_cols:
            if c in df.columns:
                df[c] = df[c].fillna(df[c].mean())
        for c in cat_cols:
            if c in df.columns:
                mode = df[c].mode(dropna=True)
                df[c] = df[c].fillna(mode.iloc[0] if not mode.empty else "Unknown")
    elif missing_strategy == "Fill with median (numeric)":
        for c in num_cols:
            if c in df.columns:
                df[c] = df[c].fillna(df[c].median())
        for c in cat_cols:
            if c in df.columns:
                mode = df[c].mode(dropna=True)
                df[c] = df[c].fillna(mode.iloc[0] if not mode.empty else "Unknown")
    elif missing_strategy == "Fill with mode (all)":
        for c in df.columns:
            mode = df[c].mode(dropna=True)
            if not mode.empty:
                df[c] = df[c].fillna(mode.iloc[0])

    df = df.replace([np.inf, -np.inf], np.nan)
    if df.empty:
        raise ValueError("No rows remained after applying the missing-value strategy.")

    if target_col not in df.columns:
        fallback_target = _recommend_target_column(df)
        if not fallback_target:
            raise ValueError("No usable target column remained after preprocessing.")
        auto_warnings.append(f"Target column was no longer available, so {fallback_target} was selected instead.")
        target_col = fallback_target

    target_series = df[target_col]
    if target_series.dropna().empty or target_series.nunique(dropna=True) <= 1:
        raise ValueError(f"The selected target column '{target_col}' does not contain enough usable values. Please choose a different column.")

    # Aggressive numeric coercion if user specifically requested Regression
    # or if the column name implies it should be numeric (e.g. price, milage)
    if str(task_type) == "Regression" and not pd.api.types.is_numeric_dtype(target_series):
        # Remove anything that isn't a digit, minus, or period
        aggressive_clean = target_series.astype(str).str.replace(r'[^\d.-]', '', regex=True)
        df[target_col] = pd.to_numeric(aggressive_clean, errors="coerce")
        target_series = df[target_col]
        auto_warnings.append(f"Target column '{target_col}' was forcefully converted to numeric for Regression. Unparseable text became missing values.")

    inferred_task = _infer_task_type_from_target(target_series)
    unique_target_values = int(target_series.astype(str).nunique(dropna=True))
    target_numeric_ratio = float(pd.to_numeric(target_series.dropna(), errors="coerce").notna().mean()) if len(target_series.dropna()) else 0.0

    # Only override task_type if not explicitly set by user
    if str(task_type or "").strip() not in {"Classification", "Regression"}:
        task_type = inferred_task

    # Hard validation: regression requires numeric target
    if task_type == "Regression" and target_numeric_ratio < 0.8:
        auto_warnings.append("Regression target was not numeric. Task switched to Classification.")
        task_type = "Classification"

    # 1.5 Auto-coerce standard numeric features heavily formatted as strings
    numeric_keywords = {"price", "milage", "mileage", "cost", "salary", "amount", "budget", "revenue", "distance", "weight"}
    for c in df.select_dtypes(include=["object", "string", "category"]).columns:
        if c == target_col: continue # already handled above
        if any(kw in c.lower() for kw in numeric_keywords):
            aggressive_clean = df[c].astype(str).str.replace(r'[^\d.-]', '', regex=True)
            if pd.to_numeric(aggressive_clean, errors="coerce").notna().mean() >= 0.7:
                df[c] = pd.to_numeric(aggressive_clean, errors="coerce")

    # 2. Encode categoricals
    label_encoders: Dict[str, LabelEncoder] = {}
    cat_cols_current = df.select_dtypes(include=["object", "category", "bool"]).columns.tolist()
    encoding_warnings: List[str] = []

    if encode_method == "Manual" and manual_encoding_rules:
        for rule in manual_encoding_rules:
            # handle both pydantic objects and dicts
            rule_method = rule.method if hasattr(rule, 'method') else rule.get('method')
            rule_cols = rule.columns if hasattr(rule, 'columns') else rule.get('columns', [])
            
            valid_cols = [c for c in rule_cols if c in df.columns]
            if not valid_cols:
                continue

            if rule_method == "Label Encoding":
                for c in valid_cols:
                    le = LabelEncoder()
                    df[c] = le.fit_transform(df[c].astype(str))
                    label_encoders[c] = le
            elif rule_method == "One-Hot Encoding":
                # Only OHE columns that are actually categorical
                ohe_cols = [c for c in valid_cols if c in cat_cols_current and c != target_col]
                if ohe_cols:
                    df = pd.get_dummies(df, columns=ohe_cols, drop_first=True, dtype=np.int8)
        
        # Finally ensure target is encoded if categorical
        if target_col in df.columns and str(df[target_col].dtype) in {"object", "bool", "category"}:
            le = LabelEncoder()
            df[target_col] = le.fit_transform(df[target_col].astype(str))
            label_encoders[target_col] = le

    elif encode_method == "Label Encoding" and cat_cols_current:
        for c in cat_cols_current:
            if c not in df.columns:
                continue
            le = LabelEncoder()
            df[c] = le.fit_transform(df[c].astype(str))
            label_encoders[c] = le

    elif encode_method == "One-Hot Encoding" and cat_cols_current:
        low_card_cols = []
        high_card_cols = []
        low_card_limit = 12 if large_dataset_mode else 20
        for c in cat_cols_current:
            if c == target_col:
                continue
            if df[c].nunique(dropna=True) > low_card_limit:
                high_card_cols.append(c)
            else:
                low_card_cols.append(c)

        projected_ohe_features = _projected_ohe_feature_count(df, low_card_cols)
        if large_dataset_mode and (len(low_card_cols) > 8 or projected_ohe_features > 60):
            encoding_warnings.append(
                "Large dataset detected. Switched categorical encoding to Label Encoding "
                "to keep memory usage stable during preprocessing and training."
            )
            for c in cat_cols_current:
                if c not in df.columns:
                    continue
                le = LabelEncoder()
                df[c] = le.fit_transform(df[c].astype(str))
                label_encoders[c] = le
            low_card_cols = []
            high_card_cols = []

        if high_card_cols:
            encoding_warnings.append(
                f"Columns {high_card_cols} have too many unique values. "
                "Applied Label Encoding instead to prevent memory crash."
            )
            for c in high_card_cols:
                if c not in df.columns:
                    continue
                le = LabelEncoder()
                df[c] = le.fit_transform(df[c].astype(str))
                label_encoders[c] = le

        if low_card_cols:
            df = pd.get_dummies(df, columns=low_card_cols, drop_first=True, dtype=np.int8)

        if target_col in df.columns and str(df[target_col].dtype) in {"object", "bool", "category"}:
            le = LabelEncoder()
            df[target_col] = le.fit_transform(df[target_col].astype(str))
            label_encoders[target_col] = le

    # 3. Split
    X = df.drop(columns=[target_col], errors="ignore")
    if X.empty:
        X = pd.DataFrame({"__row_index": np.arange(len(df), dtype=np.int32)}, index=df.index)
        auto_warnings.append("No feature columns were left after selecting the target, so a row-index feature was added automatically.")

    y = df[target_col]
    X = X.apply(pd.to_numeric, errors="coerce").fillna(0)

    if task_type == "Regression":
        numeric_target = pd.to_numeric(y, errors="coerce")
        fill_value = float(numeric_target.median()) if numeric_target.notna().any() else 0.0
        y = numeric_target.fillna(fill_value)
    else:
        y = y.astype(str).fillna("Unknown")

    if len(X) < 2:
        raise ValueError("At least two usable rows are required for preprocessing.")

    test_count = _safe_test_count(len(X), test_size)
    random_state = _safe_random_state(random_state)

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=test_count,
            random_state=random_state,
            shuffle=True,
        )
    except Exception:
        fallback_test_count = 1 if len(X) > 1 else 0
        if fallback_test_count == 0:
            raise ValueError("The dataset is too small to split into train and test sets.")
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=fallback_test_count,
            random_state=42,
            shuffle=True,
        )
        auto_warnings.append("Adjusted the train-test split automatically to keep preprocessing stable.")

    # 4. Smart sampling on training split only
    n_train = len(X_train)
    samp_info = get_sampling_info(n_train)
    sampled_flag = samp_info["sampled"]
    if sampled_flag:
        sample_n = samp_info["sample_size"]
        if task_type == "Classification":
            try:
                X_train, _, y_train, _ = train_test_split(
                    X_train,
                    y_train,
                    train_size=sample_n,
                    stratify=y_train,
                    random_state=42,
                )
            except Exception:
                X_train = X_train.sample(n=sample_n, random_state=42)
                y_train = y_train.loc[X_train.index]
        else:
            X_train = X_train.sample(n=sample_n, random_state=42)
            y_train = y_train.loc[X_train.index]
        X_train = X_train.reset_index(drop=True)
        y_train = y_train.reset_index(drop=True)

    # 5. Scaling
    scaler = None
    if scaling_method == "StandardScaler":
        scaler = StandardScaler()
        X_train = pd.DataFrame(scaler.fit_transform(X_train), columns=X.columns).astype(np.float32)
        X_test = pd.DataFrame(scaler.transform(X_test), columns=X.columns).astype(np.float32)
    elif scaling_method == "MinMaxScaler":
        scaler = MinMaxScaler()
        X_train = pd.DataFrame(scaler.fit_transform(X_train), columns=X.columns).astype(np.float32)
        X_test = pd.DataFrame(scaler.transform(X_test), columns=X.columns).astype(np.float32)
    else:
        X_train = X_train.reset_index(drop=True)
        X_test = X_test.reset_index(drop=True)

    X_train = optimize_memory(X_train.copy())
    X_test = optimize_memory(X_test.copy())
    df = optimize_memory(df.copy())
    gc.collect()

    return {
        "df_processed": df,
        "feature_columns": X.columns.tolist(),
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train.reset_index(drop=True),
        "y_test": y_test.reset_index(drop=True),
        "scaler": scaler,
        "label_encoders": label_encoders,
        "sampled": sampled_flag,
        "sample_size": samp_info["sample_size"],
        "encoding_warnings": [*auto_warnings, *encoding_warnings],
        "large_dataset_mode": large_dataset_mode,
        "target_col": target_col,
        "task_type": task_type,
    }
