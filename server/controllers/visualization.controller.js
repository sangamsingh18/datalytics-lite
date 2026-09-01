// Yeh visualization.controller.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const HttpError = require('../utils/httpError');
const { store } = require('../state/sessionStore');
const datasetService = require('../services/dataset.service');
const { getVisualizationMetadata, renderChart } = require('../services/visualization.service');

const asyncHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
};

const syncVisualization = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  const { rows, columns, name } = req.body;

  if (rows && Array.isArray(rows) && rows.length > 0) {
    const cols = columns || Object.keys(rows[0]);
    datasetService.storeDatasetInSession(session, rows, cols, name || session.dataset_name || 'dataset.csv', req.sessionId);
  }

  if (!session.rows || !session.rows.length) {
    throw new HttpError(400, 'No dataset rows found in session.');
  }

  const metadata = getVisualizationMetadata(session.rows, session.dataset_columns);
  return res.json({ metadata });
});

const getMetadata = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const metadata = getVisualizationMetadata(session.rows, session.dataset_columns);
  return res.json(metadata);
});

const createChart = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const figure = renderChart(session.rows, req.body);
  return res.json({ figure });
});

const batchCharts = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const charts = req.body.charts || [];
  const results = charts.map((cfg) => ({
    chart_key: cfg.chart_key || cfg.chart_type,
    figure: renderChart(session.rows, cfg),
  }));
  return res.json({ charts: results });
});

const geoChart = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  return res.json({ figure: { data: [], layout: { template: 'plotly_dark' } } });
});

module.exports = {
  syncVisualization,
  getMetadata,
  createChart,
  batchCharts,
  geoChart,
};
