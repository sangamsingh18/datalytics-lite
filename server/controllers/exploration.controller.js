// Yeh exploration.controller.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Exploration controller — handlers for /eda/* and /explore-data
 */
const HttpError = require('../utils/httpError');
const { store } = require('../state/sessionStore');
const datasetService = require('../services/dataset.service');
const { exploreDataset, buildEdaSummary } = require('../services/exploration.service');

const asyncHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
};

/** GET /eda/summary */
const edaSummary = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset uploaded for this session.');
  }
  const summary = buildEdaSummary(session.rows, session.dataset_columns);
  return res.json(summary);
});

/** POST /eda/sync */
const edaSync = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  const { rows, columns, name } = req.body;

  if (rows && Array.isArray(rows) && rows.length > 0) {
    const cols = columns || Object.keys(rows[0]);
    datasetService.storeDatasetInSession(session, rows, cols, name || session.dataset_name || 'dataset.csv', req.sessionId);
  }

  if (!session.rows || !session.rows.length) {
    throw new HttpError(400, 'No dataset rows provided or found in session.');
  }

  const summary = buildEdaSummary(session.rows, session.dataset_columns);
  return res.json({
    dataset: session.dataset_snapshot,
    summary,
  });
});

/** POST /eda/action */
const edaAction = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const summary = buildEdaSummary(session.rows, session.dataset_columns);
  return res.json({ ok: true, summary });
});

/** POST /eda/chart */
const edaChart = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const { column, target_column } = req.body;
  const payload = exploreDataset(session.rows, session.dataset_columns, column, target_column);
  return res.json(payload);
});

/** GET /eda/report/json */
const edaReportJson = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const summary = buildEdaSummary(session.rows, session.dataset_columns);
  return res.json(summary);
});

/** GET /eda/report/html */
const edaReportHtml = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const summary = buildEdaSummary(session.rows, session.dataset_columns);
  const html = `<!DOCTYPE html><html><head><title>EDA Report</title><style>body{font-family:system-ui;background:#0b0f19;color:#fff;padding:24px;}</style></head><body><h1>Data Exploration Report</h1><pre>${JSON.stringify(summary, null, 2)}</pre></body></html>`;
  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
});

/** GET /eda/download-csv */
const edaDownloadCsv = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows || !session.rows.length) {
    throw new HttpError(404, 'No dataset loaded.');
  }
  const cols = session.dataset_columns || Object.keys(session.rows[0]);
  const header = cols.map((c) => JSON.stringify(c)).join(',');
  const lines = session.rows.map((r) =>
    cols
      .map((c) => {
        const val = r[c];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return String(val);
      })
      .join(',')
  );
  const csv = [header, ...lines].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${session.dataset_name || 'dataset'}.csv"`);
  return res.send(csv);
});

/** GET /explore-data — mirrors explore_data(). */
const exploreData = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows) {
    throw new HttpError(404, 'No dataset uploaded. Please upload a CSV first.');
  }
  const { categorical_column, target_column } = req.query;
  try {
    const payload = exploreDataset(session.rows, session.dataset_columns, categorical_column, target_column);
    return res.json(payload);
  } catch (e) {
    throw new HttpError(422, `Exploration failed: ${e.message}`);
  }
});

module.exports = {
  edaSummary,
  edaSync,
  edaAction,
  edaChart,
  edaReportJson,
  edaReportHtml,
  edaDownloadCsv,
  exploreData,
};
