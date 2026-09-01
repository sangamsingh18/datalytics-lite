// Yeh dataset.controller.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Dataset controller — ported from app/api/v1/routes/upload.py (upload
 * endpoints) and the dataset-retrieval endpoints of app/api/v1/routes/data.py
 * (get-data, dataset/page). EDA/visualization/dashboard endpoints from
 * data.py are ported separately in the exploration/visualization modules.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');
const { store } = require('../state/sessionStore');
const db = require('../config/database');
const datasetService = require('../services/dataset.service');
const datasourceService = require('../services/datasource.service');
const { buildDatasetSnapshot, sanitizeForJson } = require('../utils/dataUtils');

const asyncHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
};

/** Mirrors _persist_snapshot_to_db(): best-effort, never fails the request. */
async function persistSnapshotToDb(sessionId, filename, snapshot) {
  try {
    await db.saveDataset(sessionId, filename, snapshot.sample_rows || [], {
      rows: snapshot.rows || 0,
      cols: snapshot.cols || 0,
      columns: snapshot.all_columns || [],
      columns_info: snapshot.columns_info || [],
      filename,
      storage_mode: snapshot.storage_mode || 'memory',
    });
  } catch (e) {
    logger.error('PERSIST', 'Dataset persistence to Mongo failed (upload still succeeds)', e);
  }
}

/** POST /upload and POST /upload-dataset — mirrors upload_dataset(). */
const uploadDataset = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(422, 'file is required');
  }
  const sessionId = req.sessionId;
  const filename = req.file.originalname || 'dataset';
  const ext = path.extname(filename).toLowerCase();

  if (!datasetService.ALLOWED_EXTENSIONS.has(ext)) {
    throw new HttpError(400, 'Only CSV, Excel, or JSON files are supported.');
  }

  const targetPath = datasetService.createSessionUploadPath(sessionId, filename);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, req.file.buffer);

  const session = store.get(sessionId);
  datasetService.resetSessionDownstreamState(session);

  let snapshot;
  try {
    snapshot = datasetService.prepareUploadedDataset({
      session,
      sessionId,
      filename,
      sourcePath: targetPath,
      fileSize: req.file.buffer.length,
    });
  } catch (e) {
    logger.error('UPLOAD', 'Could not parse file', e);
    throw new HttpError(422, `Could not parse file: ${e.message}`);
  }

  await persistSnapshotToDb(sessionId, filename, snapshot);
  return res.json(snapshot);
});

/** POST /upload/init — mirrors upload_init(). */
const uploadInit = asyncHandler(async (req, res) => {
  const { filename, total_size, content_type, chunk_size } = req.body;
  try {
    const manifest = datasetService.startChunkedUpload({
      sessionId: req.sessionId,
      filename: filename || 'dataset',
      totalSize: parseInt(total_size, 10) || 0,
      contentType: content_type,
      chunkSize: parseInt(chunk_size, 10) || 5 * 1024 * 1024,
    });
    return res.json(manifest);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
});

/** POST /upload/chunk/:uploadId — mirrors upload_chunk(). */
const uploadChunk = asyncHandler(async (req, res) => {
  const { uploadId } = req.params;
  const { index, total_chunks } = req.body;
  if (!req.file) {
    throw new HttpError(422, 'chunk is required');
  }
  try {
    const payload = datasetService.appendChunk(uploadId, parseInt(index, 10), parseInt(total_chunks, 10), req.file.buffer);
    return res.json({ ...payload, session_id: req.sessionId });
  } catch (e) {
    throw new HttpError(422, `Could not store upload chunk: ${e.message}`);
  }
});

/** POST /upload/complete/:uploadId — mirrors upload_complete(). */
const uploadComplete = asyncHandler(async (req, res) => {
  const { uploadId } = req.params;
  const session = store.get(req.sessionId);
  datasetService.resetSessionDownstreamState(session);

  let sourcePath, snapshot;
  try {
    ({ sourcePath, snapshot } = datasetService.finalizeChunkedUpload(uploadId, session, req.sessionId));
  } catch (e) {
    throw new HttpError(422, `Could not finalize upload: ${e.message}`);
  }

  await persistSnapshotToDb(req.sessionId, session.dataset_name || path.basename(sourcePath), snapshot);
  return res.json(snapshot);
});

/** POST /upload/connect — mirrors upload_connect(). */
const uploadConnect = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await datasourceService.connectExternalSource(req.body);
  } catch (e) {
    logger.error('DB CONNECT', 'External source connect failed', e);
    throw new HttpError(e.status || 400, e.message);
  }

  const session = store.get(req.sessionId);
  datasetService.resetSessionDownstreamState(session);
  const snapshot = datasetService.storeDatasetInSession(session, result.rows, result.columns, result.filename, req.sessionId);

  await persistSnapshotToDb(req.sessionId, result.filename, snapshot);
  return res.json(snapshot);
});

/** GET /get-data — mirrors get_data(). */
const getData = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows && !Object.keys(session.dataset_snapshot || {}).length) {
    throw new HttpError(404, 'No dataset uploaded. Please upload a CSV first.');
  }
  const snapshot = Object.keys(session.dataset_snapshot || {}).length
    ? session.dataset_snapshot
    : buildDatasetSnapshot(session.rows, session.dataset_columns);
  return res.json(sanitizeForJson(snapshot));
});

/** GET /dataset/page — mirrors dataset_page(). */
const datasetPage = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows && !Object.keys(session.dataset_snapshot || {}).length) {
    throw new HttpError(404, 'No dataset uploaded. Please upload a dataset first.');
  }
  const { page, page_size } = req.query;
  return res.json(datasetService.pageDataset(session, page, page_size));
});

/** GET /dataset/json — returns rows array up to limit */
const datasetJson = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  if (!session.rows && !Object.keys(session.dataset_snapshot || {}).length) {
    throw new HttpError(404, 'No dataset uploaded.');
  }
  const limit = parseInt(req.query.limit, 10) || 5000;
  const rows = session.rows ? session.rows.slice(0, limit) : [];
  return res.json({
    rows: sanitizeForJson(rows),
    columns: session.dataset_columns || (rows.length ? Object.keys(rows[0]) : []),
    name: session.dataset_name || 'dataset.csv',
    meta: session.dataset_snapshot || {},
  });
});

/** POST /data/sync — syncs dataset to session */
const dataSync = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  const { rows, columns, name } = req.body;
  if (rows && Array.isArray(rows) && rows.length > 0) {
    const cols = columns || Object.keys(rows[0]);
    const snapshot = datasetService.storeDatasetInSession(session, rows, cols, name || session.dataset_name || 'dataset.csv', req.sessionId);
    await persistSnapshotToDb(req.sessionId, name || 'dataset.csv', snapshot);
    return res.json(snapshot);
  }
  if (session.dataset_snapshot) {
    return res.json(session.dataset_snapshot);
  }
  throw new HttpError(400, 'No rows provided to sync');
});

module.exports = {
  uploadDataset,
  uploadInit,
  uploadChunk,
  uploadComplete,
  uploadConnect,
  getData,
  datasetPage,
  datasetJson,
  dataSync,
};
