// Yeh prediction.controller.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const HttpError = require('../utils/httpError');
const { store } = require('../state/sessionStore');
const {
  preprocessDataset,
  trainSupervisedModels,
  predictOutcome,
  runClustering,
  trainWithMlServiceOrFallback,
  predictWithMlServiceOrFallback,
} = require('../services/prediction.service');

const asyncHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
};

const preprocess = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset uploaded. Please upload a dataset first.');
  }
  const result = preprocessDataset(session, req.body);
  return res.json(result);
});

const train = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  if (!session.preprocessing_done) {
    preprocessDataset(session, {});
  }
  // Prefers the real Python ml-service microservice (server/ml-service/)
  // when it's reachable; falls back to the JS simulation otherwise.
  const result = await trainWithMlServiceOrFallback(session, req.body || {});
  return res.json(result);
});

const trainResults = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.model_results) {
    throw new HttpError(404, 'No training results found.');
  }
  return res.json(session.model_results);
});

const bestModelSummary = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.model_results) {
    throw new HttpError(404, 'No trained model available.');
  }
  return res.json(session.model_results);
});

const featureInfo = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.preprocess_meta) {
    if (session.rows && session.rows.length) {
      preprocessDataset(session, {});
    } else {
      throw new HttpError(404, 'No dataset preprocessed.');
    }
  }
  const meta = session.preprocess_meta;
  return res.json({
    feature_columns: meta.feature_columns,
    numeric_feats: meta.numeric_feats,
    label_encoded_feats: meta.label_encoded_feats,
    ohe_groups: meta.ohe_groups,
    feature_stats: meta.feature_stats,
    le_defaults: meta.le_defaults,
    target_col: meta.target_col,
    task_type: meta.task_type,
  });
});

const predict = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const { feature_values } = req.body;
  // Uses the real ml-service model (via session.ml_model_id) when the
  // last training run used it; falls back to the JS heuristic otherwise.
  const result = await predictWithMlServiceOrFallback(session, feature_values || {});
  return res.json(result);
});

const cluster = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const result = runClustering(session, req.body);
  return res.json(result);
});

const clusterResults = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.cluster_results) {
    if (session.rows && session.rows.length) {
      const result = runClustering(session, {});
      return res.json(result);
    }
    throw new HttpError(404, 'No clustering results available.');
  }
  return res.json(session.cluster_results);
});

const downloadResults = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  const history = session.prediction_history || [];
  if (!history.length) {
    // Generate sample predictions from original rows if no manual predictions yet
    const sample = (session.rows || []).slice(0, 50).map((r) => ({
      ...r,
      Prediction: r[session.preprocess_meta?.target_col || 'target'] || 'Predicted',
    }));
    history.push(...sample);
  }
  const cols = Object.keys(history[0] || {});
  const header = cols.map((c) => JSON.stringify(c)).join(',');
  const lines = history.map((r) =>
    cols.map((c) => JSON.stringify(r[c] !== undefined ? r[c] : '')).join(',')
  );
  const csv = [header, ...lines].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="predictions.csv"');
  return res.send(csv);
});

module.exports = {
  preprocess,
  train,
  trainResults,
  bestModelSummary,
  featureInfo,
  predict,
  cluster,
  clusterResults,
  downloadResults,
};
