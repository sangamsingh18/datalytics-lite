// Yeh statsUtils.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Statistics helpers shared by exploration/preparation/visualization —
 * ported from pandas semantics (df.describe(), quantile, value_counts)
 * used throughout eda_service.py / ml_service.py.
 */
const { inferDtype } = require('./dataUtils');

function numericValues(rows, col) {
  const out = [];
  for (const row of rows) {
    const v = row[col];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Linear-interpolation percentile, matching pandas' default quantile(). */
function percentile(sortedValues, q) {
  if (!sortedValues.length) return null;
  const idx = q * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const frac = idx - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * frac;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values, m) {
  if (values.length < 2) return null;
  const mu = m !== undefined ? m : mean(values);
  const variance = values.reduce((acc, v) => acc + (v - mu) ** 2, 0) / (values.length - 1); // ddof=1, pandas default
  return Math.sqrt(variance);
}

/** Mirrors value_counts(): frequency map sorted descending. */
function valueCounts(rows, col) {
  const counts = new Map();
  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined || v === '') continue;
    const key = String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}

/**
 * Mirrors df.describe(include="all").T: for numeric columns, returns
 * count/mean/std/min/25%/50%/75%/max; for others, count/unique/top/freq.
 * Missing fields are '' (matching .fillna("")).
 */
function describeAll(rows, columns) {
  return columns.map((col) => {
    const dtype = inferDtype(rows, col);
    const isNumeric = dtype === 'int64' || dtype === 'float64';

    if (isNumeric) {
      const values = numericValues(rows, col).sort((a, b) => a - b);
      const m = mean(values);
      return {
        column: col,
        count: values.length,
        mean: m !== null ? round2(m) : '',
        std: values.length > 1 ? round2(std(values, m)) : '',
        min: values.length ? round2(values[0]) : '',
        '25%': values.length ? round2(percentile(values, 0.25)) : '',
        '50%': values.length ? round2(percentile(values, 0.5)) : '',
        '75%': values.length ? round2(percentile(values, 0.75)) : '',
        max: values.length ? round2(values[values.length - 1]) : '',
        unique: '',
        top: '',
        freq: '',
      };
    }

    const counts = valueCounts(rows, col);
    const nonNull = rows.filter((r) => r[col] !== null && r[col] !== undefined && r[col] !== '').length;
    return {
      column: col,
      count: nonNull,
      mean: '',
      std: '',
      min: '',
      '25%': '',
      '50%': '',
      '75%': '',
      max: '',
      unique: counts.length,
      top: counts.length ? counts[0].value : '',
      freq: counts.length ? counts[0].count : '',
    };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { numericValues, percentile, mean, std, valueCounts, describeAll, round2 };
