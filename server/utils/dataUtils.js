// Yeh dataUtils.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Shared dataset utilities — ported from app/services/ml_service.py
 * (sanitize_for_json, serialize_dataframe, build_dataset_snapshot,
 * get_sampling_info) and app/services/dataset_service.py constants.
 * These operate on plain JS arrays-of-row-objects instead of pandas
 * DataFrames, since Node has no DataFrame equivalent — the row-object
 * shape is what the React client already consumes (each row is a
 * plain JSON object), so this is a direct behavioral port, not a
 * reinterpretation.
 */

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.json']);

const FRONTEND_SAMPLE_ROWS = 2000;
const INTERACTIVE_SAMPLE_ROWS = 20000;
const MEMORY_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MEMORY_ROW_THRESHOLD = 50000;

/** Mirrors sanitize_for_json(): NaN/Infinity -> null, Date -> ISO string, recurse. */
function sanitizeForJson(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForJson);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = sanitizeForJson(value[key]);
    }
    return out;
  }
  return value;
}

/** Mirrors serialize_dataframe(): head(limit), inf->null, NaN/undefined->null. */
function serializeRows(rows, limit = null) {
  const sliced = limit ? rows.slice(0, limit) : rows;
  return sanitizeForJson(sliced);
}

/** Infers a pandas-like dtype label for a column from sampled values. */
function inferDtype(rows, column) {
  let sawNumber = false;
  let sawInt = true;
  let sawBool = false;
  let sawString = false;
  let any = false;

  for (const row of rows) {
    const v = row[column];
    if (v === null || v === undefined || v === '') continue;
    any = true;
    if (typeof v === 'boolean') {
      sawBool = true;
    } else if (typeof v === 'number') {
      sawNumber = true;
      if (!Number.isInteger(v)) sawInt = false;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
        sawNumber = true;
        if (!Number.isInteger(Number(trimmed))) sawInt = false;
      } else {
        sawString = true;
      }
    } else {
      sawString = true;
    }
  }

  if (!any) return 'object';
  if (sawBool && !sawNumber && !sawString) return 'bool';
  if (sawNumber && !sawString) return sawInt ? 'int64' : 'float64';
  return 'object';
}

/**
 * Mirrors build_dataset_snapshot(): computes rows/cols, per-column
 * dtype/null/unique stats, numeric_cols/categorical_cols counts,
 * preview + sample_rows, missing_total.
 */
function buildDatasetSnapshot(rows, columns, previewLimit = 20, sampleLimit = FRONTEND_SAMPLE_ROWS) {
  const nTotal = rows.length;
  const cols = columns || (rows.length ? Object.keys(rows[0]) : []);

  // Sample up to 10k rows for nunique/dtype inference on large datasets,
  // same performance tradeoff as the Python version.
  const sampleForStats = nTotal > 10000
    ? sampleRows(rows, 10000)
    : rows;

  let numericCols = 0;
  let categoricalCols = 0;
  let missingTotal = 0;

  const columnsInfo = cols.map((col) => {
    let nullCount = 0;
    const uniqueSet = new Set();
    for (const row of rows) {
      const v = row[col];
      if (v === null || v === undefined || v === '') nullCount += 1;
    }
    for (const row of sampleForStats) {
      const v = row[col];
      if (v !== null && v !== undefined && v !== '') uniqueSet.add(String(v));
    }
    const dtype = inferDtype(sampleForStats, col);
    if (dtype === 'int64' || dtype === 'float64') numericCols += 1;
    else categoricalCols += 1;
    missingTotal += nullCount;

    return {
      column: String(col),
      dtype,
      non_null: nTotal - nullCount,
      null: nullCount,
      null_pct: nTotal ? Math.round((nullCount / nTotal) * 10000) / 100 : 0,
      unique: uniqueSet.size,
    };
  });

  return sanitizeForJson({
    rows: nTotal,
    cols: cols.length,
    numeric_cols: numericCols,
    categorical_cols: categoricalCols,
    columns_info: columnsInfo,
    preview: serializeRows(rows, previewLimit),
    sample_rows: serializeRows(rows, sampleLimit),
    missing_total: missingTotal,
    sampling_info: getSamplingInfo(nTotal),
    all_columns: cols,
    backend_managed: true,
  });
}

/** Mirrors get_sampling_info() usage in ml_service.py preprocessing. */
function getSamplingInfo(nTotal) {
  return {
    total_rows: nTotal,
    is_large_dataset: nTotal > MEMORY_ROW_THRESHOLD,
  };
}

/** Deterministic-ish sample of n rows (mirrors df.sample(n, random_state=42) intent). */
function sampleRows(rows, n) {
  if (rows.length <= n) return rows;
  const step = rows.length / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(rows[Math.floor(i * step)]);
  }
  return out;
}

module.exports = {
  ALLOWED_EXTENSIONS,
  FRONTEND_SAMPLE_ROWS,
  INTERACTIVE_SAMPLE_ROWS,
  MEMORY_FILE_SIZE_BYTES,
  MEMORY_ROW_THRESHOLD,
  sanitizeForJson,
  serializeRows,
  buildDatasetSnapshot,
  getSamplingInfo,
  sampleRows,
  inferDtype,
};
