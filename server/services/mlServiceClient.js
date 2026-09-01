
// mlServiceClient.js
// Handles HTTP communication between Node.js and the FastAPI ML microservice.


// Yeh mlServiceClient.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * HTTP client for the standalone ml-service (server/ml-service/, FastAPI +
 * scikit-learn) described in server/ml-service/app/main.py:
 *
 *   Node.js Backend
 *         |
 *         v
 *   POST /train   -> real preprocessing + scikit-learn training -> model_id + metrics
 *   POST /predict -> real prediction using that model_id
 *         |
 *         v
 *   Node.js Backend -> React
 *
 * `prediction.service.js` has a pure-JS fallback (fabricated/simulated
 * metrics) that runs when this service isn't reachable, so local dev works
 * with zero setup. Start the real service for genuine trained-model results:
 *
 *   cd server/ml-service
 *   pip install -r requirements.txt
 *   uvicorn app.main:app --reload --port 8001
 */
const fetch = require('node-fetch');
const env = require('../config/environment');

const REQUEST_TIMEOUT_MS = 60_000;

let cachedAvailability = null; // { ok: boolean, checkedAt: number }
const AVAILABILITY_CACHE_MS = 15_000;

/** Cheap reachability check so callers can fail fast instead of waiting
 * out a full timeout on every request when the service isn't running. */
async function isAvailable() {
  const now = Date.now();
  if (cachedAvailability && now - cachedAvailability.checkedAt < AVAILABILITY_CACHE_MS) {
    return cachedAvailability.ok;
  }
  let ok = false;
  try {
    const res = await fetch(`${env.mlServiceUrl}/health`, { timeout: 2_000 });
    ok = res.ok;
  } catch {
    ok = false;
  }
  cachedAvailability = { ok, checkedAt: now };
  return ok;
}

async function postJson(path, body) {
  const res = await fetch(`${env.mlServiceUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeout: REQUEST_TIMEOUT_MS,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail || res.statusText;
    throw new Error(`ml-service ${path} failed (${res.status}): ${detail}`);
  }
  return data;
}

/**
 * Trains a real scikit-learn model via the ml-service.
 * `session` must already have `rows` + `dataset_columns`; `options` mirrors
 * the fields prediction.service.js's preprocessDataset() accepts.
 */
async function trainViaMlService(session, options = {}) {
  const meta = session.preprocess_meta || {};
  const body = {
    data: session.rows,
    target_col: options.target_col || meta.target_col,
    task_type: options.task_type || meta.task_type,
    missing_strategy: options.missing_strategy || 'Fill with mode (all)',
    encode_method: options.encode_method || 'Auto',
    manual_encoding_rules: options.manual_encoding_rules || [],
    scaling_method: options.scaling_method || meta.scaling_method || 'StandardScaler',
    test_size: options.test_size && options.test_size > 1 ? options.test_size / 100 : (options.test_size || 0.2),
    random_state: options.random_state ?? 42,
  };
  if (!body.target_col) {
    throw new Error('target_col is required to train via ml-service');
  }
  return postJson('/train', body);
}

/** Predicts using a model_id previously returned by trainViaMlService(). */
async function predictViaMlService(modelId, featureValues) {
  return postJson('/predict', { model_id: modelId, feature_values: featureValues || {} });
}

module.exports = { isAvailable, trainViaMlService, predictViaMlService };




        //       Node.js Backend
        //             │
        //             ▼
        // ┌──────────────────────┐
        // │ prediction.service.js│
        // │                      │
        // │ Business Logic       │
        // │ Prediction Workflow  │
        // └──────────┬───────────┘
        //            │
        //            ▼
        // ┌──────────────────────┐
        // │  mlServiceClient.js  │
        // │                      │
        // │ HTTP Communication   │
        // │ /train               │
        // │ /predict             │
        // └──────────┬───────────┘
        //            │
        //          HTTP
        //            │
        //            ▼
        // ┌──────────────────────┐
        // │ FastAPI ML Service   │
        // │       :8001          │
        // └──────────────────────┘