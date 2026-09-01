"""
ML model service — moved unchanged from the original
server/services/ml_service.py (and server/app/services/ml_service.py).

Handles: supervised model training + model selection, unsupervised
clustering, prediction, feature-importance/summary reporting, and the
JSON-safe serialization helpers used by the /train and /predict routes.
"""
from __future__ import annotations

import gc
import json
import math
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from sklearn.base import clone
from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans, MiniBatchKMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LinearRegression, LogisticRegression, SGDClassifier, SGDRegressor
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    davies_bouldin_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    silhouette_score,
)
from sklearn.mixture import GaussianMixture
from sklearn.model_selection import RandomizedSearchCV, cross_val_score, learning_curve
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

try:
    from xgboost import XGBClassifier, XGBRegressor

    XGBOOST_AVAILABLE = True
    XGBOOST_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - depends on local env
    XGBClassifier = None
    XGBRegressor = None
    XGBOOST_AVAILABLE = False
    XGBOOST_IMPORT_ERROR = str(exc)

try:
    from catboost import CatBoostClassifier, CatBoostRegressor

    CATBOOST_AVAILABLE = True
    CATBOOST_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - depends on local env
    CatBoostClassifier = None
    CatBoostRegressor = None
    CATBOOST_AVAILABLE = False
    CATBOOST_IMPORT_ERROR = str(exc)

warnings.filterwarnings("ignore")

from app.utils.preprocessing import _sample_frame, _is_large_dataset  # noqa: E402


def sanitize_for_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: sanitize_for_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(item) for item in value]
    if isinstance(value, np.ndarray):
        return [sanitize_for_json(item) for item in value.tolist()]
    if isinstance(value, (pd.Series, pd.Index)):
        return [sanitize_for_json(item) for item in value.tolist()]
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, pd.Timedelta):
        return str(value)
    if isinstance(value, np.datetime64):
        try:
            return pd.Timestamp(value).isoformat()
        except Exception:
            return str(value)
    if isinstance(value, (np.floating, float)):
        numeric = float(value)
        if math.isnan(numeric) or math.isinf(numeric):
            return None
        return numeric
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value

def figure_to_json(fig: Any) -> dict:
    return sanitize_for_json(json.loads(fig.to_json()))

def serialize_dataframe(df: pd.DataFrame, limit: Optional[int] = None) -> list[dict[str, Any]]:
    data = df.head(limit).copy() if limit else df.copy()
    for col in data.select_dtypes(include="category").columns:
        data[col] = data[col].astype(str)
    data = data.replace([np.inf, -np.inf], np.nan)
    data = data.where(pd.notnull(data), None)
    return sanitize_for_json(data.to_dict(orient="records"))

def _train_single(args: tuple) -> tuple:
    name, model, X_tr, y_tr, X_te, y_te, task, n_cv = args
    try:
        tuned = isinstance(model, RandomizedSearchCV)
        tuning_score = None
        best_params = None

        if tuned:
            tuning_sample_size = _get_tuning_sample_size(len(X_tr))
            X_tune, y_tune = _sample_training_arrays(X_tr, y_tr, task, tuning_sample_size)
            model.fit(X_tune, y_tune)
            model_for_eval = clone(model.estimator).set_params(**model.best_params_)
            model_for_eval.fit(X_tr, y_tr)
            tuning_score = round(float(model.best_score_), 4)
            best_params = json.dumps(sanitize_for_json(model.best_params_), sort_keys=True)
        else:
            model.fit(X_tr, y_tr)
            model_for_eval = model

        y_pred = model_for_eval.predict(X_te)
        if task == "Classification":
            acc = accuracy_score(y_te, y_pred)
            prec = precision_score(y_te, y_pred, average="weighted", zero_division=0)
            rec = recall_score(y_te, y_pred, average="weighted", zero_division=0)
            f1 = f1_score(y_te, y_pred, average="weighted", zero_division=0)
            roc_auc = _compute_roc_auc(model_for_eval, X_te, y_te)
            if tuned:
                cv_mean, cv_std = tuning_score, None
            elif n_cv is None:
                cv_mean, cv_std = None, None
            else:
                try:
                    cv_s = cross_val_score(model_for_eval, X_tr, y_tr, cv=n_cv, scoring="accuracy")
                    cv_mean, cv_std = round(float(cv_s.mean()), 4), round(float(cv_s.std()), 4)
                except Exception:
                    cv_mean, cv_std = None, None
            metrics = {
                "Model": name,
                "Accuracy": round(acc, 4),
                "Precision": round(prec, 4),
                "Recall": round(rec, 4),
                "F1 Score": round(f1, 4),
                "ROC-AUC": roc_auc,
                "CV Mean": cv_mean,
                "CV Std": cv_std,
                "Tuned": "Yes" if tuned else "No",
                "Tuning Score": tuning_score,
                "Best Params": best_params,
            }
        else:
            mae = mean_absolute_error(y_te, y_pred)
            mse = mean_squared_error(y_te, y_pred)
            rmse = math.sqrt(max(float(mse), 0.0))
            r2 = r2_score(y_te, y_pred)
            if tuned:
                cv_mean, cv_std = tuning_score, None
            elif n_cv is None:
                cv_mean, cv_std = None, None
            else:
                try:
                    cv_s = cross_val_score(model_for_eval, X_tr, y_tr, cv=n_cv, scoring="r2")
                    cv_mean, cv_std = round(float(cv_s.mean()), 4), round(float(cv_s.std()), 4)
                except Exception:
                    cv_mean, cv_std = None, None
            metrics = {
                "Model": name,
                "MAE": round(mae, 4),
                "MSE": round(mse, 4),
                "RMSE": round(rmse, 4),
                "R2 Score": round(r2, 4),
                "CV Mean R2": cv_mean,
                "CV Std": cv_std,
                "Tuned": "Yes" if tuned else "No",
                "Tuning Score": tuning_score,
                "Best Params": best_params,
            }
        return name, model_for_eval, metrics, None
    except Exception as e:
        return name, None, None, str(e)

def _is_large_scale_training(X_train: pd.DataFrame) -> bool:
    return len(X_train) >= 35_000 or X_train.shape[1] >= 150

def _should_run_cv(X_train: pd.DataFrame) -> bool:
    return len(X_train) <= 20_000 and X_train.shape[1] <= 120

def _is_imbalanced_classification(y_train: pd.Series) -> bool:
    distribution = y_train.value_counts(normalize=True)
    if distribution.empty:
        return False
    return float(distribution.min()) < 0.15

def _get_tuning_sample_size(n_rows: int) -> int:
    if n_rows <= 12_000:
        return n_rows
    if n_rows <= 30_000:
        return 15_000
    return 12_000

def _get_tuning_cv_folds(task_type: str, y_values: np.ndarray, large_scale: bool) -> Optional[int]:
    target_folds = 3 if large_scale or len(y_values) > 12_000 else 5
    if task_type != "Classification":
        return target_folds

    distribution = pd.Series(y_values).value_counts()
    if distribution.empty:
        return None

    min_class_size = int(distribution.min())
    if min_class_size < 2:
        return None
    return max(2, min(target_folds, min_class_size))

def _compute_roc_auc(model: Any, X_te: np.ndarray, y_te: np.ndarray) -> Optional[float]:
    try:
        if hasattr(model, "predict_proba"):
            scores = model.predict_proba(X_te)
            if getattr(scores, "ndim", 1) == 2 and scores.shape[1] == 2:
                return round(float(roc_auc_score(y_te, scores[:, 1])), 4)
            return round(float(roc_auc_score(y_te, scores, multi_class="ovr", average="weighted")), 4)

        if hasattr(model, "decision_function"):
            scores = model.decision_function(X_te)
            if getattr(scores, "ndim", 1) == 1:
                return round(float(roc_auc_score(y_te, scores)), 4)
            return round(float(roc_auc_score(y_te, scores, multi_class="ovr", average="weighted")), 4)
    except Exception:
        return None

    return None

def _build_tuned_searches(
    task_type: str,
    y_values: np.ndarray,
    large_scale: bool,
) -> tuple[dict[str, RandomizedSearchCV], list[str]]:
    searches: dict[str, RandomizedSearchCV] = {}
    errors: list[str] = []
    scoring = "accuracy" if task_type == "Classification" else "r2"
    cv_folds = _get_tuning_cv_folds(task_type, y_values, large_scale)
    n_iter = 8 if large_scale else 12

    if cv_folds is None:
        errors.append("Tuned boosting models skipped: not enough target diversity for cross-validation.")
        return searches, errors

    if XGBOOST_AVAILABLE:
        if task_type == "Classification":
            class_count = int(pd.Series(y_values).nunique())
            if class_count > 2:
                xgb_estimator = XGBClassifier(
                    objective="multi:softprob",
                    num_class=class_count,
                    eval_metric="mlogloss",
                    random_state=42,
                    n_jobs=1,
                    tree_method="hist",
                    verbosity=0,
                )
            else:
                xgb_estimator = XGBClassifier(
                    objective="binary:logistic",
                    eval_metric="logloss",
                    random_state=42,
                    n_jobs=1,
                    tree_method="hist",
                    verbosity=0,
                )
        else:
            xgb_estimator = XGBRegressor(
                objective="reg:squarederror",
                eval_metric="rmse",
                random_state=42,
                n_jobs=1,
                tree_method="hist",
                verbosity=0,
            )

        xgb_params = {
            "n_estimators": [100, 200, 300, 500],
            "max_depth": [3, 5, 7, 10],
            "learning_rate": [0.01, 0.05, 0.1, 0.2],
            "subsample": [0.6, 0.8, 1.0],
            "colsample_bytree": [0.6, 0.8, 1.0],
        }
        searches["Tuned XGBoost"] = RandomizedSearchCV(
            estimator=xgb_estimator,
            param_distributions=xgb_params,
            n_iter=n_iter,
            scoring=scoring,
            cv=cv_folds,
            random_state=42,
            n_jobs=-1,
            refit=True,
            error_score="raise",
        )
    else:
        errors.append(f"Tuned XGBoost unavailable: {XGBOOST_IMPORT_ERROR}")

    if CATBOOST_AVAILABLE:
        if task_type == "Classification":
            class_count = int(pd.Series(y_values).nunique())
            cat_estimator = CatBoostClassifier(
                loss_function="MultiClass" if class_count > 2 else "Logloss",
                random_seed=42,
                verbose=0,
                allow_writing_files=False,
                thread_count=1,
            )
        else:
            cat_estimator = CatBoostRegressor(
                loss_function="RMSE",
                random_seed=42,
                verbose=0,
                allow_writing_files=False,
                thread_count=1,
            )

        cat_params = {
            "iterations": [100, 200, 300, 500],
            "depth": [4, 6, 8, 10],
            "learning_rate": [0.01, 0.05, 0.1],
            "l2_leaf_reg": [1, 3, 5, 7],
        }
        searches["Tuned CatBoost"] = RandomizedSearchCV(
            estimator=cat_estimator,
            param_distributions=cat_params,
            n_iter=n_iter,
            scoring=scoring,
            cv=cv_folds,
            random_state=42,
            n_jobs=-1,
            refit=True,
            error_score="raise",
        )
    else:
        errors.append(f"Tuned CatBoost unavailable: {CATBOOST_IMPORT_ERROR}")

    return searches, errors

def train_supervised(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    task_type: str,
) -> dict:
    """Train all models in parallel, return results + trained model objects."""
    large_scale = _is_large_scale_training(X_train)
    if task_type == "Classification":
        use_balanced = _is_imbalanced_classification(y_train)
        class_weight = "balanced" if use_balanced else None
        models = {
            "Logistic Regression": LogisticRegression(
                max_iter=500 if large_scale else 1000,
                solver="saga" if large_scale else "lbfgs",
                class_weight=class_weight,
                random_state=42,
            ),
            "Decision Tree": DecisionTreeClassifier(
                random_state=42,
                max_depth=18 if large_scale else None,
                class_weight=class_weight,
            ),
            "Random Forest": RandomForestClassifier(
                n_estimators=60 if large_scale else 100,
                max_depth=18 if large_scale else None,
                max_samples=0.35 if large_scale else None,
                class_weight=class_weight,
                random_state=42,
                n_jobs=-1,
            ),
            "Naive Bayes": GaussianNB(),
        }
        if not large_scale:
            models["KNN"] = KNeighborsClassifier(n_jobs=-1)
            models["SVM"] = SVC(probability=True, random_state=42, class_weight=class_weight)
            models["Gradient Boosting"] = GradientBoostingClassifier(n_estimators=100, random_state=42)
        else:
            models["SGD Classifier"] = SGDClassifier(
                loss="log_loss",
                alpha=1e-4,
                max_iter=2000,
                early_stopping=True,
                class_weight=class_weight,
                random_state=42,
            )
            models["Hist Gradient Boosting"] = HistGradientBoostingClassifier(
                learning_rate=0.08,
                max_iter=160,
                max_depth=10,
                random_state=42,
            )
        min_class_size = int(y_train.value_counts().min()) if not y_train.empty else 2
        n_cv = max(2, min(5, min_class_size)) if _should_run_cv(X_train) else None
    else:
        models = {
            "Linear Regression": LinearRegression(n_jobs=-1),
            "Decision Tree": DecisionTreeRegressor(
                random_state=42,
                max_depth=18 if large_scale else None,
            ),
            "Random Forest": RandomForestRegressor(
                n_estimators=60 if large_scale else 100,
                max_depth=18 if large_scale else None,
                max_samples=0.35 if large_scale else None,
                random_state=42,
                n_jobs=-1,
            ),
        }
        if not large_scale:
            models["KNN"] = KNeighborsRegressor(n_jobs=-1)
            models["SVM"] = SVR()
            models["Gradient Boosting"] = GradientBoostingRegressor(n_estimators=100, random_state=42)
        else:
            models["SGD Regressor"] = SGDRegressor(
                alpha=1e-4,
                max_iter=2000,
                early_stopping=True,
                random_state=42,
            )
            models["Hist Gradient Boosting"] = HistGradientBoostingRegressor(
                learning_rate=0.08,
                max_iter=160,
                max_depth=10,
                random_state=42,
            )
        n_cv = 5 if _should_run_cv(X_train) else None

    X_tr_np = X_train.to_numpy(dtype=np.float32, copy=False)
    y_tr_np = y_train.values
    X_te_np = X_test.to_numpy(dtype=np.float32, copy=False)
    y_te_np = y_test.values

    tuned_searches, tuning_errors = _build_tuned_searches(task_type, y_tr_np, large_scale)
    models.update(tuned_searches)

    train_args = [
        (name, model, X_tr_np, y_tr_np, X_te_np, y_te_np, task_type, n_cv)
        for name, model in models.items()
    ]

    results = []
    trained = {}
    errors = list(tuning_errors)

    has_tuned_models = bool(tuned_searches)
    if has_tuned_models:
        for args in train_args:
            m_name, m_obj, m_metrics, m_err = _train_single(args)
            if m_err:
                errors.append(f"{m_name}: {m_err}")
            else:
                results.append(m_metrics)
                trained[m_name] = m_obj
    else:
        max_workers = 2 if large_scale else min(4, len(models))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_train_single, args): args[0] for args in train_args}
            for future in as_completed(futures):
                m_name, m_obj, m_metrics, m_err = future.result()
                if m_err:
                    errors.append(f"{m_name}: {m_err}")
                else:
                    results.append(m_metrics)
                    trained[m_name] = m_obj

    gc.collect()

    if not results:
        raise RuntimeError(f"All models failed to train. Errors: {errors}")

    results_df = pd.DataFrame(results)

    if task_type == "Classification":
        best_idx = results_df["Accuracy"].idxmax()
        primary_metric = "Accuracy"
    else:
        best_idx = results_df["R2 Score"].idxmax()
        primary_metric = "R2 Score"

    best_name = results_df.loc[best_idx, "Model"]
    best_metrics = results_df.loc[best_idx].to_dict()

    return {
        "results": results,
        "trained_models": trained,
        "model_results": results_df,
        "best_model_name": best_name,
        "best_model": trained[best_name],
        "best_metrics": best_metrics,
        "primary_metric": primary_metric,
        "errors": errors,
        "large_dataset_mode": large_scale,
        "cv_enabled": n_cv is not None,
        "train_rows_used": len(X_train),
        "test_rows_used": len(X_test),
        "models_considered": list(models.keys()),
    }

def _sample_numpy_with_labels(
    X: np.ndarray,
    labels: np.ndarray,
    max_rows: int,
) -> tuple[np.ndarray, np.ndarray]:
    if len(X) <= max_rows:
        return X, labels
    rng = np.random.default_rng(42)
    indices = rng.choice(len(X), size=max_rows, replace=False)
    return X[indices], labels[indices]

def _compute_cluster_metrics(
    X: np.ndarray,
    labels: np.ndarray,
    metric_max_rows: int,
) -> tuple[float, float]:
    unique_labels = np.unique(labels)
    if len(unique_labels) < 2 or len(unique_labels) >= len(labels):
        return -1.0, -1.0

    X_metric, labels_metric = _sample_numpy_with_labels(X, labels, metric_max_rows)
    if len(np.unique(labels_metric)) < 2 or len(labels_metric) < 3:
        return -1.0, -1.0

    silhouette = silhouette_score(X_metric, labels_metric)
    davies_bouldin = davies_bouldin_score(X_metric, labels_metric)
    return float(silhouette), float(davies_bouldin)

def _build_cluster_plot(
    name: str,
    X: np.ndarray,
    labels: np.ndarray,
    plot_max_rows: int,
) -> Optional[dict[str, Any]]:
    if X.shape[1] < 2 or len(X) < 2:
        return None

    X_plot, labels_plot = _sample_numpy_with_labels(X, labels, plot_max_rows)

    try:
        pca = PCA(n_components=2)
        X_pca = pca.fit_transform(X_plot)
        scatter_df = pd.DataFrame({
            "PC1": X_pca[:, 0],
            "PC2": X_pca[:, 1],
            "Cluster": pd.Series(labels_plot).astype(str),
        })
        figure = px.scatter(
            scatter_df,
            x="PC1",
            y="PC2",
            color="Cluster",
            title=name,
            color_discrete_sequence=px.colors.qualitative.Set2,
        )
        figure.update_layout(template="plotly_dark", height=420)
        return {
            "name": name,
            "figure": figure_to_json(figure),
        }
    except Exception:
        return None

def train_clustering(
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    n_clusters: int = 3,
    eps: float = 0.5,
    min_samples: int = 5,
) -> dict:
    """Train clustering models using bounded samples so large datasets remain stable."""
    X_full = pd.concat([X_train, X_test], ignore_index=True)
    large_dataset_mode = _is_large_dataset(len(X_full), X_full.shape[1])
    cluster_rows_limit = 15_000 if large_dataset_mode else 35_000
    metric_rows_limit = 3_000 if large_dataset_mode else 6_000
    plot_rows_limit = 4_000 if large_dataset_mode else 8_000

    X_cluster = _sample_frame(X_full, cluster_rows_limit)
    sampled_cluster = len(X_full) > cluster_rows_limit
    X_cluster_np = X_cluster.to_numpy(dtype=np.float32, copy=False)

    cluster_results = []
    pca_plots = []
    errors = []

    def record_cluster_result(name: str, X_used: np.ndarray, labels: np.ndarray, cluster_count: int) -> None:
        silhouette, davies_bouldin = _compute_cluster_metrics(X_used, labels, metric_rows_limit)
        cluster_results.append({
            "Model": name,
            "Silhouette": round(silhouette, 4),
            "Davies-Bouldin": round(davies_bouldin, 4),
            "Clusters": int(cluster_count),
        })
        plot = _build_cluster_plot(name, X_used, labels, plot_rows_limit)
        if plot is not None:
            pca_plots.append(plot)

    km_name = "MiniBatch K-Means" if large_dataset_mode else "K-Means"
    try:
        if large_dataset_mode:
            km = MiniBatchKMeans(
                n_clusters=n_clusters,
                random_state=42,
                batch_size=2048,
                n_init=10,
            )
        else:
            km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        km_labels = km.fit_predict(X_cluster_np)
        record_cluster_result(km_name, X_cluster_np, km_labels, n_clusters)
    except Exception as e:
        errors.append(f"{km_name}: {e}")

    hierarchical_rows = 3_500 if large_dataset_mode else min(len(X_cluster_np), 8_000)
    try:
        if len(X_cluster_np) <= hierarchical_rows:
            X_hier = X_cluster_np
        else:
            X_hier = _sample_frame(X_cluster, hierarchical_rows).to_numpy(dtype=np.float32, copy=False)
        hc = AgglomerativeClustering(n_clusters=n_clusters)
        hc_labels = hc.fit_predict(X_hier)
        record_cluster_result("Hierarchical", X_hier, hc_labels, n_clusters)
    except Exception as e:
        errors.append(f"Hierarchical: {e}")

    dbscan_rows = 4_000 if large_dataset_mode else min(len(X_cluster_np), 10_000)
    try:
        if len(X_cluster_np) <= dbscan_rows:
            X_dbscan = X_cluster_np
        else:
            X_dbscan = _sample_frame(X_cluster, dbscan_rows).to_numpy(dtype=np.float32, copy=False)
        dbs = DBSCAN(eps=eps, min_samples=min_samples)
        dbs_labels = dbs.fit_predict(X_dbscan)
        valid_mask = dbs_labels != -1
        clusters_found = len(set(dbs_labels[valid_mask]))
        if valid_mask.sum() > 2 and clusters_found >= 2:
            record_cluster_result("DBSCAN", X_dbscan[valid_mask], dbs_labels[valid_mask], clusters_found)
        else:
            cluster_results.append({
                "Model": "DBSCAN",
                "Silhouette": -1.0,
                "Davies-Bouldin": -1.0,
                "Clusters": int(clusters_found),
            })
    except Exception as e:
        errors.append(f"DBSCAN: {e}")

    gmm_rows = 5_000 if large_dataset_mode else min(len(X_cluster_np), 10_000)
    try:
        if len(X_cluster_np) <= gmm_rows:
            X_gmm = X_cluster_np
        else:
            X_gmm = _sample_frame(X_cluster, gmm_rows).to_numpy(dtype=np.float32, copy=False)
        gmm = GaussianMixture(n_components=n_clusters, random_state=42)
        gmm_labels = gmm.fit_predict(X_gmm)
        record_cluster_result("Gaussian Mixture", X_gmm, gmm_labels, n_clusters)
    except Exception as e:
        errors.append(f"Gaussian Mixture: {e}")

    return {
        "cluster_results": cluster_results,
        "pca_data": {"plots": pca_plots},
        "sampled_cluster": sampled_cluster,
        "errors": errors,
        "large_dataset_mode": large_dataset_mode,
        "cluster_rows_used": len(X_cluster),
    }

def predict(
    model: Any,
    feature_values: dict,
    feature_columns: list,
    scaler: Any,
    label_encoders: dict,
    target_col: str,
    task_type: str,
) -> Any:
    """Assemble input DataFrame, apply scaler, predict, decode output."""
    def to_numeric_value(value: Any) -> float:
        if value is None or value == "":
            return 0.0
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return 0.0
        if np.isnan(numeric) or np.isinf(numeric):
            return 0.0
        return numeric

    # Build input row in correct column order
    row = [to_numeric_value(feature_values.get(f, 0)) for f in feature_columns]
    input_df = pd.DataFrame([row], columns=feature_columns)

    if scaler is not None:
        input_df = pd.DataFrame(
            scaler.transform(input_df),
            columns=feature_columns,
        )

    prediction = model.predict(input_df)[0]

    # Decode target if it was label-encoded
    if target_col in label_encoders:
        le = label_encoders[target_col]
        try:
            prediction = le.inverse_transform([int(prediction)])[0]
        except Exception:
            pass

    return prediction

def get_feature_info(
    feature_columns: list,
    label_encoders: dict,
    raw_df: pd.DataFrame,
    X_train: pd.DataFrame,
) -> dict:
    """
    Categorise every feature so the frontend can build the correct input widget:
    - label_encoded_feats: { feat â†’ [class0, class1, ...] }
    - ohe_groups: { orig_col â†’ [val1, val2, ...] with baseline values prepended }
    - numeric_feats: [ feat, ... ]
    - feature_stats: { feat â†’ { min, max, median } }
    """
    raw_cols = set(raw_df.columns.tolist())

    def _find_ohe_origin(feat_name: str):
        for rc in raw_cols:
            if feat_name.startswith(rc + "_"):
                value = feat_name[len(rc) + 1:]
                return rc, value
        return None

    ohe_groups_raw: Dict[str, list] = {}   # orig_col â†’ [(feat_name, value)]
    label_encoded_feats: Dict[str, List[str]] = {}
    numeric_feats: List[str] = []

    for feat in feature_columns:
        if feat in label_encoders:
            label_encoded_feats[feat] = list(label_encoders[feat].classes_)
        else:
            ohe_info = _find_ohe_origin(feat)
            if ohe_info is not None:
                orig_col, val = ohe_info
                ohe_groups_raw.setdefault(orig_col, []).append((feat, val))
            else:
                numeric_feats.append(feat)

    # Build final ohe_groups: orig_col â†’ full option list (baseline first)
    ohe_groups: Dict[str, Dict] = {}
    for orig_col, feat_val_pairs in ohe_groups_raw.items():
        ohe_values = [v for _, v in feat_val_pairs]
        if orig_col in raw_df.columns:
            all_raw_vals = raw_df[orig_col].dropna().astype(str).unique().tolist()
            baselines = [v for v in all_raw_vals if v not in ohe_values]
            full_options = baselines + ohe_values
        else:
            full_options = ["(baseline / other)"] + ohe_values
        ohe_groups[orig_col] = {
            "options": full_options,
            "feat_val_pairs": [(fn, v) for fn, v in feat_val_pairs],
        }

    # Feature stats for numeric inputs
    feature_stats: Dict[str, Dict[str, float]] = {}
    for feat in numeric_feats:
        if feat in X_train.columns:
            col_data = X_train[feat].dropna()
            feature_stats[feat] = {
                "min": float(col_data.min()),
                "max": float(col_data.max()),
                "median": float(col_data.median()),
            }
        else:
            feature_stats[feat] = {"min": 0.0, "max": 1.0, "median": 0.5}

    # Default values for label-encoded feats
    le_defaults: Dict[str, str] = {}
    for feat, classes in label_encoded_feats.items():
        if feat in X_train.columns:
            try:
                mode_code = int(X_train[feat].mode()[0])
                le_defaults[feat] = label_encoders[feat].inverse_transform([mode_code])[0]
            except Exception:
                le_defaults[feat] = classes[0] if classes else ""
        else:
            le_defaults[feat] = classes[0] if classes else ""

    return {
        "feature_columns": feature_columns,
        "label_encoded_feats": label_encoded_feats,
        "le_defaults": le_defaults,
        "ohe_groups": ohe_groups,
        "numeric_feats": numeric_feats,
        "feature_stats": feature_stats,
    }

def _extract_feature_importance(model: Any, feature_columns: list[str]) -> list[dict[str, Any]]:
    if model is None or not feature_columns:
        return []

    values = None
    if hasattr(model, "feature_importances_"):
        values = model.feature_importances_
    elif hasattr(model, "coef_"):
        coef = model.coef_
        if hasattr(coef, "ndim") and coef.ndim > 1:
            values = np.mean(np.abs(coef), axis=0)
        else:
            values = np.abs(coef)

    if values is None:
        return []

    try:
        flat_values = np.array(values).flatten()
    except Exception:
        return []

    if len(flat_values) != len(feature_columns):
        return []

    pairs = list(zip(feature_columns, flat_values))
    pairs.sort(key=lambda item: item[1], reverse=True)
    return [
        {"feature": str(feature), "importance": float(score)}
        for feature, score in pairs[:12]
    ]

def build_best_model_summary(
    best_model: Any,
    best_model_name: str,
    model_results: pd.DataFrame,
    task_type: str,
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: pd.Series,
    y_test: pd.Series,
    cluster_results: Optional[list[dict[str, Any]]] = None,
) -> dict:
    if best_model is None or model_results is None or best_model_name is None:
        raise ValueError("Best model is not available.")

    best_row = model_results[model_results["Model"] == best_model_name].iloc[0].to_dict()
    X_full = pd.concat([X_train, X_test])
    y_full = pd.concat([y_train, y_test])
    max_rows = 20_000
    if len(X_full) > max_rows:
        indices = np.random.default_rng(42).choice(len(X_full), max_rows, replace=False)
        X_lc = X_full.iloc[indices]
        y_lc = y_full.iloc[indices]
    else:
        X_lc = X_full
        y_lc = y_full

    scoring = "accuracy" if task_type == "Classification" else "r2"
    if task_type == "Classification":
        min_class_size = int(y_lc.value_counts().min())
        cv_value = max(2, min(5, min_class_size))
    else:
        cv_value = 5

    learning_curve_figure = None
    try:
        train_sizes, train_scores, val_scores = learning_curve(
            best_model,
            X_lc,
            y_lc,
            cv=cv_value,
            train_sizes=np.linspace(0.1, 1.0, 10),
            scoring=scoring,
            n_jobs=-1,
        )
        learning_df = pd.DataFrame({
            "Training Size": np.tile(train_sizes, 2),
            "Score": np.concatenate([train_scores.mean(axis=1), val_scores.mean(axis=1)]),
            "Type": ["Train"] * len(train_sizes) + ["Validation"] * len(train_sizes),
        })
        figure = px.line(
            learning_df,
            x="Training Size",
            y="Score",
            color="Type",
            title=f"Learning Curve - {best_model_name}",
            color_discrete_map={"Train": "#6C63FF", "Validation": "#00D2FF"},
        )
        figure.update_layout(template="plotly_dark", height=420)
        learning_curve_figure = figure_to_json(figure)
    except Exception:
        learning_curve_figure = None

    confusion = None
    confusion_labels = None
    if task_type == "Classification":
        try:
            y_pred = best_model.predict(X_test)
            labels = np.unique(np.concatenate([np.array(y_test), np.array(y_pred)]))
            confusion = confusion_matrix(y_test, y_pred, labels=labels).tolist()
            confusion_labels = [str(label) for label in labels]
        except Exception:
            confusion = None
            confusion_labels = None

    feature_importance = _extract_feature_importance(best_model, list(X_train.columns))

    return {
        "best_model_name": best_model_name,
        "task_type": task_type,
        "best_metrics": best_row,
        "results": serialize_dataframe(model_results, limit=None),
        "learning_curve": learning_curve_figure,
        "cluster_results": cluster_results or [],
        "feature_importance": feature_importance,
        "confusion_matrix": confusion,
        "confusion_labels": confusion_labels,
    }
