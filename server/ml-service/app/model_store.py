"""

This stores the trained ML models in memory.



Minimal in-memory store keyed by model_id, holding everything a later
/predict (or /best-model-summary style) call needs: the trained model,
the preprocessing artifacts (scaler, label encoders, feature columns),
and the task metadata.

This intentionally replaces the old cross-router `session_store` from
the monolithic FastAPI app — this service no longer shares process
state with dataset/EDA/etc. routers, so it keeps only what ML needs.

This is a simple process-local dict. It is fine for local development
and for a single ml-service instance; if the service is ever scaled to
multiple processes/workers, this should move to a shared store (e.g.
Redis) — same as the Node.js layer will need to decide for its own
session state.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Dict, List, Optional

import pandas as pd


@dataclass
class ModelSession:
    best_model: Any
    best_model_name: str
    model_results: pd.DataFrame
    task_type: str
    target_col: str
    feature_columns: List[str]
    scaler: Any
    label_encoders: Dict[str, Any]
    X_train: pd.DataFrame
    X_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    df_processed: Optional[pd.DataFrame] = None
    cluster_results: Optional[list] = None


class ModelStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, ModelSession] = {}
        self._lock = Lock()

    def create(self, session: ModelSession) -> str:
        model_id = str(uuid.uuid4())
        with self._lock:
            self._sessions[model_id] = session
        return model_id

    def get(self, model_id: str) -> ModelSession:
        with self._lock:
            session = self._sessions.get(model_id)
        if session is None:
            raise KeyError(f"No trained model found for model_id={model_id!r}")
        return session


store = ModelStore()
