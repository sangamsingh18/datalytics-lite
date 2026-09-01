"""
Pydantic schemas for the ml-service /train and /predict endpoints.

The request fields for preprocessing/training/prediction are moved
unchanged from the original app/models/schemas.py (PreprocessRequest,
ClusterRequest, PredictRequest). TrainRequest adds a `data` field
(the raw dataset as JSON records) since this service is now
self-contained and no longer shares a session store with the rest of
the old monolithic FastAPI app — Node.js will be the one holding the
dataset going forward and will pass it in on each call.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ManualEncodingRule(BaseModel):
    method: str  # "Label Encoding" | "One-Hot Encoding"
    columns: List[str]


class TrainRequest(BaseModel):
    data: List[Dict[str, Any]]            # dataset rows, e.g. df.to_dict(orient="records")
    target_col: str
    task_type: str                        # "Classification" | "Regression"
    missing_strategy: Optional[str] = None
    encode_method: Optional[str] = None   # "Label Encoding" | "One-Hot Encoding" | "Auto" | "Manual"
    manual_encoding_rules: Optional[List[ManualEncodingRule]] = []
    scaling_method: str = "None"          # "None" | "StandardScaler" | "MinMaxScaler"
    test_size: float = 0.2
    random_state: int = 42


class ClusterRequest(BaseModel):
    data: List[Dict[str, Any]]
    n_clusters: int = 3
    eps: float = 0.5
    min_samples: int = 5


class PredictRequest(BaseModel):
    model_id: str                          # id returned by POST /train
    feature_values: Dict[str, Any]        # { feature_name: value }
