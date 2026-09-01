// Yeh dataset.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Dataset service — ported from app/services/dataset_service.py and the
 * upload-handling logic in app/api/v1/routes/upload.py.
 *
 * Deviation from the original (noted, not hidden): the Python version
 * has a disk-streaming/chunked-profiling path (and an optional Dask
 * path) for very large files so it never loads the full file into
 * memory. This port parses the full file into memory for all sizes —
 * simpler, functionally equivalent for typical dataset sizes, but not
 * a byte-for-byte port of the big-data streaming optimization. Session
 * storage_mode is still tracked/reported the same way for API
 * compatibility with the client.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  ALLOWED_EXTENSIONS,
  FRONTEND_SAMPLE_ROWS,
  MEMORY_FILE_SIZE_BYTES,
  MEMORY_ROW_THRESHOLD,
  buildDatasetSnapshot,
  sanitizeForJson,
  serializeRows,
  sampleRows,
} = require('../utils/dataUtils');
const { parseFileBuffer } = require('../utils/fileParsers');

const CACHE_ROOT = path.join(__dirname, '..', '.cache');
const DATASET_ROOT = path.join(CACHE_ROOT, 'datasets');
const UPLOAD_ROOT = path.join(CACHE_ROOT, 'uploads');

function ensureDatasetDirectories() {
  fs.mkdirSync(DATASET_ROOT, { recursive: true });
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function safeName(filename) {
  const cleaned = (filename || 'dataset').replace(/[^a-zA-Z0-9\-_.]/g, '_');
  return cleaned || 'dataset';
}

function sessionDir(sessionId) {
  const p = path.join(DATASET_ROOT, sessionId);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function uploadDir(uploadId) {
  const p = path.join(UPLOAD_ROOT, uploadId);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function manifestPath(uploadId) {
  return path.join(uploadDir(uploadId), 'manifest.json');
}

function writeManifest(uploadId, payload) {
  fs.writeFileSync(manifestPath(uploadId), JSON.stringify(payload), 'utf-8');
}

function readManifest(uploadId) {
  return JSON.parse(fs.readFileSync(manifestPath(uploadId), 'utf-8'));
}

/** Mirrors create_session_upload_path(). */
function createSessionUploadPath(sessionId, filename) {
  ensureDatasetDirectories();
  const name = safeName(filename);
  return path.join(sessionDir(sessionId), `${crypto.randomUUID().replace(/-/g, '')}_${name}`);
}

/** Mirrors start_chunked_upload(). */
function startChunkedUpload({ sessionId, filename, totalSize, contentType, chunkSize }) {
  ensureDatasetDirectories();
  const uploadId = crypto.randomUUID().replace(/-/g, '');
  const ext = path.extname(filename || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const e = new Error('Only CSV, Excel, or JSON files are supported.');
    e.isValidation = true;
    throw e;
  }

  const manifest = {
    upload_id: uploadId,
    session_id: sessionId,
    filename: safeName(filename),
    total_size: totalSize || 0,
    content_type: contentType || '',
    chunk_size: chunkSize,
    uploaded_chunks: [],
  };
  writeManifest(uploadId, manifest);
  return sanitizeForJson(manifest);
}

/** Mirrors append_chunk(). */
function appendChunk(uploadId, index, totalChunks, chunkBytes) {
  const manifest = readManifest(uploadId);
  const chunkFile = path.join(uploadDir(uploadId), `chunk-${String(index).padStart(6, '0')}.part`);
  fs.writeFileSync(chunkFile, chunkBytes);

  const uploaded = new Set(manifest.uploaded_chunks || []);
  uploaded.add(Number(index));
  manifest.uploaded_chunks = Array.from(uploaded).sort((a, b) => a - b);
  manifest.total_chunks = Number(totalChunks);
  writeManifest(uploadId, manifest);

  return {
    upload_id: uploadId,
    uploaded_chunks: manifest.uploaded_chunks.length,
    total_chunks: Number(totalChunks),
    complete: manifest.uploaded_chunks.length >= Number(totalChunks),
  };
}

/** Mirrors finalize_chunked_upload(): concatenates chunk files, then parses. */
function finalizeChunkedUpload(uploadId, session, sessionId) {
  const manifest = readManifest(uploadId);
  const filename = manifest.filename;
  const targetDir = sessionDir(sessionId);
  const targetPath = path.join(targetDir, `${crypto.randomUUID().replace(/-/g, '')}_${filename}`);

  const totalChunks = Number(manifest.total_chunks || 0);
  const fd = fs.openSync(targetPath, 'w');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(uploadDir(uploadId), `chunk-${String(i).padStart(6, '0')}.part`);
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`Upload is missing chunk ${i}.`);
      }
      fs.writeSync(fd, fs.readFileSync(chunkPath));
    }
  } finally {
    fs.closeSync(fd);
  }

  const fileSize = manifest.total_size || fs.statSync(targetPath).size;
  const snapshot = prepareUploadedDataset({
    session,
    sessionId,
    filename,
    sourcePath: targetPath,
    fileSize,
  });

  fs.rmSync(uploadDir(uploadId), { recursive: true, force: true });
  return { sourcePath: targetPath, snapshot };
}

/**
 * Mirrors prepare_uploaded_dataset(): parses the file, builds a
 * snapshot, and stores the working dataset + metadata on the session.
 */
function prepareUploadedDataset({ session, sessionId, filename, sourcePath, fileSize }) {
  ensureDatasetDirectories();
  const ext = path.extname(sourcePath).toLowerCase();
  const buffer = fs.readFileSync(sourcePath);
  const { rows, columns } = parseFileBuffer(buffer, ext);

  const storageMode =
    rows.length <= MEMORY_ROW_THRESHOLD && fileSize <= MEMORY_FILE_SIZE_BYTES ? 'memory' : 'disk';

  const interactiveRows = rows.length > 20000 ? sampleRows(rows, 20000) : rows;
  const snapshot = buildDatasetSnapshot(rows, columns);
  snapshot.preview = serializeRows(interactiveRows, 20);
  snapshot.sample_rows = serializeRows(interactiveRows, FRONTEND_SAMPLE_ROWS);
  snapshot.backend_managed = true;
  snapshot.storage_mode = storageMode;

  session.dataset_name = filename || 'Dataset';
  session.dataset_path = sourcePath;
  session.dataset_format = ext.replace('.', '');
  session.dataset_storage_mode = storageMode;
  session.dataset_file_size = fileSize;
  session.dataset_row_count = rows.length;
  session.dataset_column_count = columns.length;
  session.dataset_columns = columns;
  session.dataset_snapshot = snapshot;
  session.rows = rows;
  session.rowsOriginal = rows;

  return sanitizeForJson(snapshot);
}

/** Mirrors store_dataframe_in_session(): used by /data/sync and /upload/connect paths. */
function storeDatasetInSession(session, rows, columns, name, sessionId) {
  const interactiveRows = rows.length > 20000 ? sampleRows(rows, 20000) : rows;
  const snapshot = buildDatasetSnapshot(rows, columns);
  snapshot.preview = serializeRows(interactiveRows, 20);
  snapshot.sample_rows = serializeRows(interactiveRows, FRONTEND_SAMPLE_ROWS);
  snapshot.backend_managed = true;
  snapshot.storage_mode = 'memory';

  session.dataset_name = name;
  session.dataset_path = null;
  session.dataset_format = 'memory';
  session.dataset_storage_mode = 'memory';
  session.dataset_file_size = 0;
  session.dataset_row_count = rows.length;
  session.dataset_column_count = columns.length;
  session.dataset_columns = snapshot.all_columns;
  session.dataset_snapshot = snapshot;
  session.rows = rows;
  session.rowsOriginal = rows;

  return sanitizeForJson(snapshot);
}

/** Resets all downstream-derived state. Mirrors _reset_session_state()/_reset_downstream_state(). */
function resetSessionDownstreamState(session) {
  session.rowsProcessed = null;
  session.X_train = session.X_test = null;
  session.y_train = session.y_test = null;
  session.trained_models = {};
  session.model_results = null;
  session.best_model = session.best_model_name = null;
  session.cluster_results = null;
  session.cluster_pca_data = null;
  session.feature_columns = null;
  session.scaler = null;
  session.label_encoders = {};
  session.preprocess_meta = {};
  session.training_meta = {};
  session.cluster_meta = {};
  session.dashboard_builder = {};
  session.preprocessing_done = false;
  session.supervised_done = false;
  session.unsupervised_done = false;
  session.prediction_history = [];
  session.ml_model_id = null;
}

/** Mirrors page_dataset(): simple offset/limit slice over session.rows. */
function pageDataset(session, page = 1, pageSize = 50) {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 500);
  const totalRows = session.dataset_row_count || (session.rows ? session.rows.length : 0);
  const columns = session.dataset_columns || (session.rows && session.rows.length ? Object.keys(session.rows[0]) : []);
  const offset = (p - 1) * size;
  const rows = session.rows || [];
  const pageRows = rows.slice(offset, offset + size);

  return sanitizeForJson({
    page: p,
    page_size: size,
    total_rows: totalRows,
    total_pages: totalRows ? Math.max(1, Math.ceil(totalRows / size)) : 1,
    columns,
    rows: serializeRows(pageRows, null),
    storage_mode: session.dataset_storage_mode,
  });
}

module.exports = {
  ALLOWED_EXTENSIONS,
  createSessionUploadPath,
  startChunkedUpload,
  appendChunk,
  finalizeChunkedUpload,
  prepareUploadedDataset,
  storeDatasetInSession,
  resetSessionDownstreamState,
  pageDataset,
};
