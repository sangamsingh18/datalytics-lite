"""
ml-service — standalone FastAPI microservice for model training and
prediction only.

Run from server/ml-service/ directory:
    uvicorn app.main:app --reload --port 8001

This service does not talk to Mongo, does not handle auth/payment/
chatbot/reports/EDA/visualization — that logic still lives in the
existing server/app/ (Python) codebase for now, and will move to the
Node.js server/ separately. This service is only reachable from the
Node.js backend, never directly from the React client.
"""
from __future__ import annotations

import logging
import warnings

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import model_routes

warnings.filterwarnings("ignore")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

app = FastAPI(
    title="Datalytics ML Service",
    description="Standalone FastAPI service for model training and prediction only.",
    version="1.0.0",
)

# CORS is scoped for local dev where the Node.js backend calls this
# service directly (server-to-server). Tighten allow_origins once the
# Node.js backend's URL is known.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(model_routes.router, tags=["Model"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-service"}
