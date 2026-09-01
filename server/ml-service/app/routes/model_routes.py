"""
Model routes — POST /train and POST /predict.

These are the only two endpoints this service exposes, per the
"FastAPI should have minimal responsibility" requirement: train a
model (running the existing preprocess() step first, since a raw
dataset is what Node.js will send) and return a model_id, then use
that model_id later to get a prediction.

Node.js Backend
      |
      v
POST /train   -> preprocess() + train_supervised()  -> model_id + metrics
POST /predict -> predict()                          -> prediction
      |
      v
Node.js Backend -> React
"""
from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.model_store import ModelSession, store
from app.models_schemas import PredictRequest, TrainRequest
from app.services.model_service import predict as run_predict
from app.services.model_service import sanitize_for_json, train_supervised
from app.utils.preprocessing import preprocess

router = APIRouter()


@router.post("/train")
async def train(body: TrainRequest):
    df = pd.DataFrame(body.data)
    if df.empty:
        raise HTTPException(status_code=422, detail="No data rows provided.")

    try:
        prep = preprocess(
            df=df,
            target_col=body.target_col,
            task_type=body.task_type,
            missing_strategy=body.missing_strategy,
            encode_method=body.encode_method,
            manual_encoding_rules=body.manual_encoding_rules,
            scaling_method=body.scaling_method,
            test_size=body.test_size,
            random_state=body.random_state,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Preprocessing failed: {e}")

    resolved_task_type = prep.get("task_type", body.task_type)

    try:
        result = train_supervised(
            X_train=prep["X_train"],
            y_train=prep["y_train"],
            X_test=prep["X_test"],
            y_test=prep["y_test"],
            task_type=resolved_task_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {e}")

    session = ModelSession(
        best_model=result["best_model"],
        best_model_name=result["best_model_name"],
        model_results=result["model_results"],
        task_type=resolved_task_type,
        target_col=prep.get("target_col", body.target_col),
        feature_columns=prep["feature_columns"],
        scaler=prep["scaler"],
        label_encoders=prep["label_encoders"],
        X_train=prep["X_train"],
        X_test=prep["X_test"],
        y_train=prep["y_train"],
        y_test=prep["y_test"],
        df_processed=prep["df_processed"],
    )
    model_id = store.create(session)

    return sanitize_for_json({
        "model_id": model_id,
        "task_type": resolved_task_type,
        "target_col": session.target_col,
        "feature_columns": session.feature_columns,
        "results": result["results"],
        "best_model_name": result["best_model_name"],
        "best_metrics": result["best_metrics"],
        "primary_metric": result["primary_metric"],
        "errors": result["errors"],
        "large_dataset_mode": result["large_dataset_mode"],
        "cv_enabled": result["cv_enabled"],
        "train_rows_used": result["train_rows_used"],
        "test_rows_used": result["test_rows_used"],
        "models_considered": result["models_considered"],
        # These were already computed by train_supervised() but never made
        # it into the HTTP response, even though the React client's
        # PredictionResult.jsx reads `feature_importance` directly.
        "feature_importance": result.get("feature_importance", []),
        "confusion_matrix": result.get("confusion_matrix"),
        "confusion_labels": result.get("confusion_labels"),
    })


@router.post("/predict")
async def predict(body: PredictRequest):
    try:
        session = store.get(body.model_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        prediction = run_predict(
            model=session.best_model,
            feature_values=body.feature_values,
            feature_columns=session.feature_columns,
            scaler=session.scaler,
            label_encoders=session.label_encoders,
            target_col=session.target_col,
            task_type=session.task_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

    return {
        "prediction": str(prediction),
        "model_used": session.best_model_name,
        "task_type": session.task_type,
    }
