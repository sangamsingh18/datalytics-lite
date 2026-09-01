// Yeh exploration.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Exploration (EDA) service — ported from explore_dataset() in
 * app/services/ml_service.py and eda_service.py.
 */
const { buildDatasetSnapshot, sanitizeForJson, inferDtype } = require('../utils/dataUtils');
const { describeAll, valueCounts, percentile, numericValues, mean, std, round2 } = require('../utils/statsUtils');
const { buildBarFigure, buildPieFigure, buildHistogramFigure } = require('../utils/plotlyBuilders');

/** Builds complete EDA summary matching React frontend contract (ExploreStep / EdaSections). */
function buildEdaSummary(rows, columns) {
  if (!rows || !rows.length) {
    return {
      overview: {
        shape: { rows: 0, columns: 0, numeric_columns: 0, categorical_columns: 0 },
        columns: [],
        head: [],
        tail: [],
      },
      quality: {
        missing_total: 0,
        duplicate_rows: 0,
        duplicate_pct: 0,
        missing_by_column: [],
      },
      statistics: {
        numeric: [],
        categorical: [],
      },
      available_columns: {
        numeric: [],
        categorical: [],
      },
    };
  }

  const allColumns = columns && columns.length ? columns : Object.keys(rows[0]);
  const nRows = rows.length;

  // Calculate duplicates
  const rowStrings = new Set();
  let duplicateRows = 0;
  for (const row of rows) {
    const s = JSON.stringify(row);
    if (rowStrings.has(s)) {
      duplicateRows += 1;
    } else {
      rowStrings.add(s);
    }
  }
  const duplicatePct = nRows ? Math.round((duplicateRows / nRows) * 1000) / 10 : 0;

  let missingTotal = 0;
  const missingByColumn = [];
  const columnsOverview = [];
  const numericColumns = [];
  const categoricalColumns = [];
  const numericStats = [];
  const categoricalStats = [];

  for (const col of allColumns) {
    let nullCount = 0;
    const uniqueSet = new Set();

    for (const row of rows) {
      const v = row[col];
      if (v === null || v === undefined || v === '') {
        nullCount += 1;
      } else {
        uniqueSet.add(String(v));
      }
    }

    missingTotal += nullCount;
    const missingPct = nRows ? Math.round((nullCount / nRows) * 1000) / 10 : 0;
    missingByColumn.push({
      column: col,
      missing: nullCount,
      missing_pct: missingPct,
    });

    const dtype = inferDtype(rows, col);
    const isNum = dtype === 'int64' || dtype === 'float64';

    columnsOverview.push({
      column: col,
      dtype,
      non_null: nRows - nullCount,
      missing: nullCount,
      unique: uniqueSet.size,
    });

    if (isNum) {
      numericColumns.push(col);
      const numVals = numericValues(rows, col).sort((a, b) => a - b);
      if (numVals.length > 0) {
        const m = mean(numVals);
        const s = std(numVals, m);
        const minVal = numVals[0];
        const maxVal = numVals[numVals.length - 1];
        const q25Val = percentile(numVals, 0.25);
        const medVal = percentile(numVals, 0.5);
        const q75Val = percentile(numVals, 0.75);

        numericStats.push({
          column: col,
          count: numVals.length,
          mean: m !== null ? round2(m) : null,
          std: s !== null ? round2(s) : null,
          min: minVal !== undefined ? round2(minVal) : null,
          q25: q25Val !== null ? round2(q25Val) : null,
          median: medVal !== null ? round2(medVal) : null,
          q75: q75Val !== null ? round2(q75Val) : null,
          max: maxVal !== undefined ? round2(maxVal) : null,
        });
      }
    } else {
      categoricalColumns.push(col);
      const counts = valueCounts(rows, col);
      categoricalStats.push({
        column: col,
        count: nRows - nullCount,
        unique: uniqueSet.size,
        top: counts.length ? counts[0].value : '',
        freq: counts.length ? counts[0].count : 0,
      });
    }
  }

  return sanitizeForJson({
    overview: {
      shape: {
        rows: nRows,
        columns: allColumns.length,
        numeric_columns: numericColumns.length,
        categorical_columns: categoricalColumns.length,
      },
      columns: columnsOverview,
      head: rows.slice(0, 10),
      tail: rows.slice(-10),
    },
    quality: {
      missing_total: missingTotal,
      duplicate_rows: duplicateRows,
      duplicate_pct: duplicatePct,
      missing_by_column: missingByColumn,
    },
    statistics: {
      numeric: numericStats,
      categorical: categoricalStats,
    },
    available_columns: {
      numeric: numericColumns,
      categorical: categoricalColumns,
    },
  });
}

/** Mirrors explore_dataset(df, categorical_column, target_column). */
function exploreDataset(rows, columns, categoricalColumn, targetColumn) {
  if (!rows) {
    throw new Error('Dataset is not available.');
  }

  const allColumns = columns || (rows.length ? Object.keys(rows[0]) : []);
  const numericColumns = allColumns.filter((c) => ['int64', 'float64'].includes(inferDtype(rows, c)));
  const categoricalColumns = allColumns.filter((c) => !numericColumns.includes(c));

  const resolvedCategorical =
    categoricalColumn && categoricalColumns.includes(categoricalColumn)
      ? categoricalColumn
      : categoricalColumns[0] || null;
  const resolvedTarget =
    targetColumn && allColumns.includes(targetColumn) ? targetColumn : allColumns[0] || null;

  const summary = describeAll(rows, allColumns);

  // Outlier detection via IQR, sampled to 50k rows
  const sampled = rows.length > 50000 ? sampleN(rows, 50000) : rows;
  const outlierInfo = numericColumns.map((col) => {
    const values = numericValues(sampled, col).sort((a, b) => a - b);
    const q1 = percentile(values, 0.25) || 0;
    const q3 = percentile(values, 0.75) || 0;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const nOutliers = values.filter((v) => v < lower || v > upper).length;
    return {
      Column: col,
      Q1: round2(q1),
      Q3: round2(q3),
      IQR: round2(iqr),
      Lower: round2(lower),
      Upper: round2(upper),
      Outliers: nOutliers,
    };
  });

  let categoricalChart = null;
  let topCategories = [];
  if (resolvedCategorical) {
    const counts = valueCounts(rows, resolvedCategorical).slice(0, 20);
    topCategories = counts;
    categoricalChart = buildBarFigure({
      x: counts.map((c) => c.value),
      y: counts.map((c) => c.count),
      xLabel: resolvedCategorical,
      yLabel: 'Count',
      title: `Value Counts - ${resolvedCategorical}`,
    });
  }

  let targetChart = null;
  if (resolvedTarget) {
    const uniqueCount = new Set(rows.map((r) => r[resolvedTarget]).filter((v) => v !== null && v !== undefined)).size;
    if (uniqueCount <= 30) {
      const counts = valueCounts(rows, resolvedTarget);
      targetChart = buildPieFigure({
        labels: counts.map((c) => c.value),
        values: counts.map((c) => c.count),
        title: `Class Distribution - ${resolvedTarget}`,
      });
    } else {
      const sampledTarget = rows.length > 50000 ? sampleN(rows, 50000) : rows;
      targetChart = buildHistogramFigure({
        values: numericValues(sampledTarget, resolvedTarget),
        xLabel: resolvedTarget,
        title: `Distribution - ${resolvedTarget}`,
      });
    }
  }

  return sanitizeForJson({
    dataset: buildDatasetSnapshot(rows, allColumns),
    summary,
    numeric_columns: numericColumns,
    categorical_columns: categoricalColumns,
    categorical_column: resolvedCategorical,
    target_column: resolvedTarget,
    top_categories: topCategories,
    categorical_chart: categoricalChart,
    outlier_info: outlierInfo,
    target_chart: targetChart,
    used_sample_for_outliers: rows.length > 50000,
  });
}

function sampleN(rows, n) {
  if (rows.length <= n) return rows;
  const step = rows.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rows[Math.floor(i * step)]);
  return out;
}

module.exports = {
  buildEdaSummary,
  exploreDataset,
};
