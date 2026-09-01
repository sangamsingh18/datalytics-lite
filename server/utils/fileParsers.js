// Yeh fileParsers.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * File parsing utilities — ported from app/services/dataset_service.py
 * and app/api/v1/routes/upload.py (_sniff_csv_delimiter, smart_json_to_df,
 * load_dataframe_from_path). Parses CSV/XLSX/JSON into { rows, columns }
 * (array of row objects), the Node equivalent of a DataFrame.
 */
const { parse: parseCsv } = require('csv-parse/sync');
const XLSX = require('xlsx');

const CSV_DELIMITER_CANDIDATES = [',', ';', '\t', '|'];

/** Mirrors _sniff_csv_delimiter(): counts candidate delimiters in the first lines. */
function sniffDelimiter(sampleText) {
  const lines = sampleText.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  if (!lines.length) return ',';
  const counts = {};
  for (const delim of CSV_DELIMITER_CANDIDATES) {
    counts[delim] = lines.reduce((acc, line) => acc + line.split(delim).length - 1, 0);
  }
  const best = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  return counts[best] > 0 ? best : ',';
}

/** Coerces string cell values to number/boolean where unambiguous, mirroring pandas' type inference. */
function coerceValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  const trimmed = v.trim();
  if (trimmed === '') return null;
  if (trimmed.toLowerCase() === 'true')
    return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'nan' || trimmed.toLowerCase() === 'null') return null;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(trimmed) || /^-?\d+[eE][-+]?\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  return v;
}

/** Parses a CSV buffer into { rows, columns }. Mirrors _load_csv_from_path + optimize_memory (type coercion). */
function parseCsvBuffer(buffer) {
  const text = buffer.toString('utf-8');
  const delimiter = sniffDelimiter(text.slice(0, 65536));
  const records = parseCsv(text, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });
  const rows = records.map((r) => {
    const out = {};
    for (const k of Object.keys(r)) out[k] = coerceValue(r[k]);
    return out;
  });
  const columns = rows.length ? Object.keys(rows[0]) : (records.columns || []);
  return { rows, columns };
}

/** Parses an XLSX/XLS buffer into { rows, columns }. Mirrors pd.read_excel(engine="openpyxl"). */
function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { rows, columns };
}

/**
 * Mirrors smart_json_to_df(): given parsed JSON (array or object), find
 * the tabular array to normalize into rows. Tries common wrapper keys,
 * then any array-valued key, then nested dict->array, then wraps a
 * single object as one row.
 */
function smartJsonToRows(data) {
  const commonKeys = [
    'data', 'results', 'items', 'records', 'rows', 'list',
    'content', 'payload', 'response', 'output', 'dataset',
  ];

  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error('Empty array returned');
    return normalizeRecords(data);
  }

  if (data && typeof data === 'object') {
    for (const key of commonKeys) {
      if (Array.isArray(data[key])) return normalizeRecords(data[key]);
    }
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) return normalizeRecords(data[key]);
    }
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const nestedKey of Object.keys(value)) {
          const nestedVal = value[nestedKey];
          if (Array.isArray(nestedVal) && nestedVal.length > 0) return normalizeRecords(nestedVal);
        }
      }
    }
    return normalizeRecords([data]);
  }

  throw new Error(`Unsupported JSON format: ${typeof data}`);
}

/** Flattens nested objects with '_' separator, mirroring pandas.json_normalize(sep='_'). */
function normalizeRecords(records) {
  return records.map((rec) => flattenObject(rec));
}

function flattenObject(obj, prefix = '') {
  const out = {};
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { [prefix || 'value']: obj };
  }
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenObject(value, newKey));
    } else {
      out[newKey] = value;
    }
  }
  return out;
}

/** Parses a JSON buffer into { rows, columns }. Mirrors _load_json_bytes(). */
function parseJsonBuffer(buffer) {
  const data = JSON.parse(buffer.toString('utf-8'));
  let rows = smartJsonToRows(data);
  rows = rows.map((row) => {
    const out = {};
    for (const k of Object.keys(row)) {
      out[String(k).replace(/\./g, '_').trim()] = row[k];
    }
    return out;
  });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { rows, columns };
}

/** Dispatches by extension. Mirrors load_dataframe_from_path(). */
function parseFileBuffer(buffer, ext) {
  const lower = ext.toLowerCase();
  if (lower === '.csv') return parseCsvBuffer(buffer);
  if (lower === '.xlsx' || lower === '.xls') return parseExcelBuffer(buffer);
  if (lower === '.json') return parseJsonBuffer(buffer);
  throw new Error('Unsupported dataset format.');
}

module.exports = {
  sniffDelimiter,
  parseCsvBuffer,
  parseExcelBuffer,
  parseJsonBuffer,
  parseFileBuffer,
  smartJsonToRows,
  coerceValue,
};
