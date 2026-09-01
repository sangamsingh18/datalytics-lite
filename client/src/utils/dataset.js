// Yeh dataset.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

export function inferColumnTypes(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const types = {};
  columns.forEach((column) => {
    let numeric = 0;
    let dateLike = 0;
    let total = 0;
    safeRows.forEach((row) => {
      const value = row[column];
      if (value === "" || value == null) return;
      total += 1;
      const stringValue = String(value).trim();
      if (NUMBER_RE.test(stringValue)) numeric += 1;
      const parsed = Date.parse(stringValue);
      if (!Number.isNaN(parsed)) dateLike += 1;
    });
    if (total === 0) {
      types[column] = "string";
    } else if (numeric / total > 0.7) {
      types[column] = "number";
    } else if (dateLike / total > 0.7) {
      types[column] = "date";
    } else {
      types[column] = "string";
    }
  });
  return types;
}

export function computeMissingByColumn(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const missing = {};
  columns.forEach((col) => {
    missing[col] = 0;
  });
  safeRows.forEach((row) => {
    columns.forEach((col) => {
      const value = row[col];
      if (value == null || value === "") missing[col] += 1;
    });
  });
  return missing;
}

export function computeNumericStats(rows, numericColumns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const stats = {};
  if (!safeRows.length || !numericColumns?.length) return stats;
  numericColumns.forEach((column) => {
    const values = safeRows
      .map((row) => toNumber(row[column]))
      .filter((value) => value !== null && Number.isFinite(value));
    if (!values.length) {
      stats[column] = { mean: 0, median: 0, std: 0, min: 0, max: 0 };
      return;
    }
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      values.length;
    const std = Math.sqrt(variance);
    stats[column] = {
      count: values.length,
      mean,
      median,
      std,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
  return stats;
}

export function computeOutliers(rows, numericColumns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const outliers = {};
  numericColumns.forEach((column) => {
    const values = safeRows
      .map((row) => toNumber(row[column]))
      .filter((value) => value !== null && Number.isFinite(value));
    if (!values.length) {
      outliers[column] = 0;
      return;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    outliers[column] = values.filter((v) => v < lower || v > upper).length;
  });
  return outliers;
}

function pearsonCorrelation(xValues, yValues) {
  const n = Math.min(xValues.length, yValues.length);
  if (n === 0) return 0;
  const meanX = xValues.reduce((sum, v) => sum + v, 0) / n;
  const meanY = yValues.reduce((sum, v) => sum + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}

export function computeCorrelationMatrix(rows, numericColumns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length || !numericColumns?.length) return [];
  const matrix = numericColumns.map(() => numericColumns.map(() => 0));
  for (let i = 0; i < numericColumns.length; i += 1) {
    for (let j = 0; j < numericColumns.length; j += 1) {
      const paired = safeRows
        .map((row) => ({
          x: toNumber(row[numericColumns[i]]),
          y: toNumber(row[numericColumns[j]]),
        }))
        .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
      matrix[i][j] = pearsonCorrelation(
        paired.map((item) => item.x),
        paired.map((item) => item.y)
      );
    }
  }
  return matrix;
}

export function buildDatasetProfile(dataset) {
  const safeRows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const metaColumnsInfo = Array.isArray(dataset?.meta?.columns_info) ? dataset.meta.columns_info : [];
  const columns =
    dataset?.columns || dataset?.meta?.all_columns || metaColumnsInfo.map((item) => item.column) || (safeRows[0] ? Object.keys(safeRows[0]) : []);

  const inferredTypes = inferColumnTypes(safeRows, columns);
  const types = columns.reduce((acc, column) => {
    const metaMatch = metaColumnsInfo.find((item) => item.column === column);
    const dtype = String(metaMatch?.dtype || "").toLowerCase();
    if (dtype.includes("int") || dtype.includes("float") || dtype.includes("double") || dtype.includes("decimal")) {
      acc[column] = "number";
    } else if (dtype.includes("date") || dtype.includes("time")) {
      acc[column] = "date";
    } else {
      acc[column] = inferredTypes[column] || "string";
    }
    return acc;
  }, {});

  const numericColumns = columns.filter((col) => types[col] === "number");
  const categoricalColumns = columns.filter((col) => types[col] !== "number");
  const missingByColumn = metaColumnsInfo.length
    ? metaColumnsInfo.reduce((acc, item) => {
      acc[item.column] = Number(item.null || 0);
      return acc;
    }, {})
    : computeMissingByColumn(safeRows, columns);
  const missingTotal = Object.values(missingByColumn).reduce(
    (sum, value) => sum + value,
    0
  );
  const numericStats = computeNumericStats(safeRows, numericColumns);
  const correlation = computeCorrelationMatrix(safeRows, numericColumns);
  const outliers = computeOutliers(safeRows, numericColumns);
  const totalRowCount = Number(dataset?.meta?.rows) || safeRows.length;
  const totalColumnCount = Number(dataset?.meta?.cols) || columns.length;
  return {
    columns,
    types,
    numericColumns,
    categoricalColumns,
    rowCount: safeRows.length,
    columnCount: columns.length,
    totalRowCount,
    totalColumnCount,
    missingByColumn,
    missingTotal,
    numericStats,
    correlation,
    outliers,
  };
}

export function getUniqueValues(rows, column) {
  const set = new Set();
  rows.forEach((row) => {
    const value = row[column];
    if (value == null || value === "") return;
    set.add(String(value));
  });
  return Array.from(set);
}

export function applyFilters(rows, filters) {
  if (!filters || !filters.column || !filters.values || filters.values.length === 0) {
    return rows;
  }
  return rows.filter((row) => filters.values.includes(String(row[filters.column])));
}

export function aggregateByKey(rows, key, valueKey, agg = "sum", limit = 8) {
  const bucket = new Map();
  rows.forEach((row) => {
    const label = row[key] ?? "Unknown";
    const value = toNumber(row[valueKey]);
    if (!Number.isFinite(value)) return;
    bucket.set(label, (bucket.get(label) || 0) + value);
  });
  const data = Array.from(bucket.entries()).map(([label, value]) => ({
    label: String(label),
    value,
  }));
  data.sort((a, b) => b.value - a.value);
  return data.slice(0, limit);
}

export function buildTimeSeries(rows, key, valueKey, limit = 12) {
  const bucket = new Map();
  rows.forEach((row) => {
    const raw = row[key];
    if (!raw) return;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return;
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const value = toNumber(row[valueKey]);
    if (!Number.isFinite(value)) return;
    bucket.set(label, (bucket.get(label) || 0) + value);
  });
  const data = Array.from(bucket.entries()).map(([label, value]) => ({ label, value }));
  data.sort((a, b) => a.label.localeCompare(b.label));
  return data.slice(-limit);
}

export function computeHistogram(values, bins = 8) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const step = (max - min) / bins || 1;
  const buckets = Array.from({ length: bins }, (_, idx) => ({
    label: `${(min + idx * step).toFixed(1)}-${(min + (idx + 1) * step).toFixed(1)}`,
    value: 0,
  }));
  clean.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - min) / step));
    buckets[index].value += 1;
  });
  return buckets;
}

function boxStats(values) {
  if (!values.length) {
    return { min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
    count: sorted.length,
  };
}

export function computeBoxPlotData(rows, xColumn, yColumn, limit = 8) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!yColumn) return [];

  if (!xColumn) {
    const values = safeRows
      .map((row) => toNumber(row[yColumn]))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return [];
    const stats = boxStats(values);
    return [{ label: yColumn, ...stats }];
  }

  const grouped = new Map();
  safeRows.forEach((row) => {
    const label = row[xColumn] ?? "Unknown";
    const value = toNumber(row[yColumn]);
    if (!Number.isFinite(value)) return;
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(value);
  });

  const data = Array.from(grouped.entries()).map(([label, values]) => ({
    label: String(label),
    ...boxStats(values),
  }));

  data.sort((a, b) => b.count - a.count);
  return data.slice(0, limit);
}

export function toNumber(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  return Number(cleaned);
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(1);
}

export function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const arr = [...sorted].sort((a, b) => a - b);
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) return arr[base] + rest * (arr[base + 1] - arr[base]);
  return arr[base];
}

function computeDuplicateRowCount(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return 0;
  const seen = new Set();
  let duplicates = 0;

  safeRows.forEach((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
  });

  return duplicates;
}

function getTopCorrelationPairs(profile, limit = 4) {
  const numericColumns = profile?.numericColumns || [];
  const matrix = profile?.correlation || [];
  const pairs = [];

  for (let rowIndex = 0; rowIndex < numericColumns.length; rowIndex += 1) {
    for (let columnIndex = rowIndex + 1; columnIndex < numericColumns.length; columnIndex += 1) {
      const value = Number(matrix?.[rowIndex]?.[columnIndex]);
      if (!Number.isFinite(value)) continue;
      pairs.push({
        left: numericColumns[rowIndex],
        right: numericColumns[columnIndex],
        value,
      });
    }
  }

  return pairs
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, limit);
}

function buildTrendCandidates(rows, profile, limit = 3) {
  const dateColumns = Object.entries(profile?.types || {})
    .filter(([, type]) => type === "date")
    .map(([column]) => column)
    .slice(0, 2);
  const numericColumns = (profile?.numericColumns || []).slice(0, 4);
  const candidates = [];

  dateColumns.forEach((dateColumn) => {
    numericColumns.forEach((valueColumn) => {
      const points = buildTimeSeries(rows, dateColumn, valueColumn, 8);
      if (points.length < 2) return;

      const last = points[points.length - 1];
      const previous = points[points.length - 2];
      const delta = Number(last.value) - Number(previous.value);
      const deltaPct = Number(previous.value) === 0 ? 0 : (delta / Number(previous.value)) * 100;

      candidates.push({
        date_column: dateColumn,
        value_column: valueColumn,
        points,
        last_value: Number(last.value),
        previous_value: Number(previous.value),
        delta,
        delta_pct: deltaPct,
        direction: delta >= 0 ? "up" : "down",
      });
    });
  });

  return candidates
    .sort((left, right) => Math.abs(right.delta_pct) - Math.abs(left.delta_pct))
    .slice(0, limit);
}

function buildCategoryBreakdowns(rows, profile, limit = 3) {
  const dateColumns = new Set(
    Object.entries(profile?.types || {})
      .filter(([, type]) => type === "date")
      .map(([column]) => column)
  );
  const categoryColumns = (profile?.categoricalColumns || [])
    .filter((column) => !dateColumns.has(column))
    .slice(0, 4);
  const numericColumns = (profile?.numericColumns || []).slice(0, 4);
  const breakdowns = [];

  categoryColumns.forEach((groupColumn) => {
    numericColumns.forEach((valueColumn) => {
      const leaders = aggregateByKey(rows, groupColumn, valueColumn, "sum", 6);
      if (leaders.length < 2) return;

      const total = leaders.reduce((sum, item) => sum + Number(item.value || 0), 0);
      const leader = leaders[0];
      const runnerUp = leaders[1];
      const ratio = Number(runnerUp?.value || 0) === 0 ? null : Number(leader.value) / Number(runnerUp.value);

      breakdowns.push({
        group_column: groupColumn,
        value_column: valueColumn,
        leaders,
        total,
        leader,
        runner_up: runnerUp,
        leader_share: total > 0 ? Number(leader.value) / total : 0,
        spread_ratio: ratio,
      });
    });
  });

  return breakdowns
    .sort((left, right) => (right.spread_ratio || 0) - (left.spread_ratio || 0))
    .slice(0, limit);
}

export function buildDatasetSummary(dataset, profile) {
  if (!dataset || !profile) return {};
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  const dateColumns = Object.entries(profile.types || {})
    .filter(([, type]) => type === "date")
    .map(([column]) => column);
  const nonDateCategorical = profile.categoricalColumns.filter((column) => !dateColumns.includes(column));
  const numericSample = profile.numericColumns.slice(0, 6).reduce((acc, col) => {
    acc[col] = profile.numericStats[col] || {};
    return acc;
  }, {});
  const topCategorical = nonDateCategorical.slice(0, 6).reduce((acc, col) => {
    const counts = getUniqueValues(rows, col).slice(0, 5);
    acc[col] = counts;
    return acc;
  }, {});
  return {
    name: dataset.name,
    rows: profile.totalRowCount || profile.rowCount,
    columns: profile.totalColumnCount || profile.columnCount,
    types: profile.types,
    numeric_columns: profile.numericColumns,
    categorical_columns: nonDateCategorical,
    date_columns: dateColumns,
    missing: profile.missingByColumn,
    missing_total: profile.missingTotal,
    duplicate_rows: computeDuplicateRowCount(rows),
    numeric_stats: numericSample,
    outliers: profile.outliers || {},
    correlation_pairs: getTopCorrelationPairs(profile),
    categorical_top_values: topCategorical,
    time_series: buildTrendCandidates(rows, profile),
    category_breakdowns: buildCategoryBreakdowns(rows, profile),
    sample_rows: rows.slice(0, 8),
    external_context:
      dataset?.meta?.external_context
      || dataset?.meta?.api_context
      || dataset?.meta?.external_data
      || null,
    user_behavior:
      dataset?.meta?.user_behavior
      || dataset?.meta?.usage_context
      || null,
  };
}
