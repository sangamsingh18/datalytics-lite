// Yeh visualization.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const { inferDtype, sanitizeForJson } = require('../utils/dataUtils');
const { valueCounts, numericValues } = require('../utils/statsUtils');
const {
  buildBarFigure,
  buildPieFigure,
  buildHistogramFigure,
  buildLineFigure,
  buildScatterFigure,
  buildBoxFigure,
} = require('../utils/plotlyBuilders');

function getVisualizationMetadata(rows, columns) {
  const cols = columns && columns.length ? columns : (rows && rows.length ? Object.keys(rows[0]) : []);
  const numeric = cols.filter((c) => ['int64', 'float64'].includes(inferDtype(rows || [], c)));
  const categorical = cols.filter((c) => !numeric.includes(c));

  return sanitizeForJson({
    columns: {
      all: cols,
      numeric,
      categorical,
    },
    supported_charts: [
      { id: 'bar_chart', label: 'Bar Chart', enabled: cols.length >= 2 || (categorical.length > 0 && numeric.length > 0) },
      { id: 'line_chart', label: 'Line Chart', enabled: cols.length >= 2 },
      { id: 'pie_chart', label: 'Pie Chart', enabled: categorical.length > 0 || cols.length > 0 },
      { id: 'histogram', label: 'Histogram', enabled: numeric.length > 0 },
      { id: 'scatter_plot', label: 'Scatter Plot', enabled: numeric.length >= 2 },
      { id: 'box_plot', label: 'Box Plot', enabled: numeric.length > 0 },
    ],
    defaults: {
      bar_chart: { x_column: categorical[0] || cols[0] || '', y_column: numeric[0] || cols[1] || '' },
      line_chart: { x_column: cols[0] || '', y_column: numeric[0] || cols[1] || '' },
      pie_chart: { column: categorical[0] || cols[0] || '' },
      histogram: { column: numeric[0] || cols[0] || '' },
      scatter_plot: { x_column: numeric[0] || cols[0] || '', y_column: numeric[1] || numeric[0] || cols[1] || '' },
      box_plot: { column: numeric[0] || cols[0] || '' },
    },
  });
}

function renderChart(rows, config = {}) {
  const { chart_type, column, x_column, y_column, bins } = config;
  const sample = rows.length > 10000 ? rows.slice(0, 10000) : rows;

  switch (chart_type) {
    case 'pie_chart': {
      const col = column || x_column;
      const counts = valueCounts(sample, col).slice(0, 15);
      return buildPieFigure({
        labels: counts.map((c) => c.value),
        values: counts.map((c) => c.count),
        title: `Distribution of ${col}`,
      });
    }

    case 'histogram': {
      const col = column || x_column;
      const values = numericValues(sample, col);
      return buildHistogramFigure({
        values,
        xLabel: col,
        title: `Histogram of ${col}`,
      });
    }

    case 'box_plot': {
      const col = column || y_column;
      const values = numericValues(sample, col);
      return buildBoxFigure({
        y: values,
        yLabel: col,
        title: `Box Plot of ${col}`,
      });
    }

    case 'scatter_plot': {
      const x = sample.map((r) => r[x_column]).filter((v) => v !== null && v !== undefined);
      const y = sample.map((r) => r[y_column]).filter((v) => v !== null && v !== undefined);
      return buildScatterFigure({
        x,
        y,
        xLabel: x_column,
        yLabel: y_column,
        title: `${y_column} vs ${x_column}`,
      });
    }

    case 'line_chart': {
      const x = sample.slice(0, 200).map((r) => r[x_column]);
      const y = sample.slice(0, 200).map((r) => r[y_column]);
      return buildLineFigure({
        x,
        y,
        xLabel: x_column,
        yLabel: y_column,
        title: `${y_column} Trend by ${x_column}`,
      });
    }

    case 'bar_chart':
    default: {
      const xCol = x_column || column;
      const yCol = y_column;
      if (yCol) {
        const x = sample.slice(0, 30).map((r) => r[xCol]);
        const y = sample.slice(0, 30).map((r) => Number(r[yCol]) || 0);
        return buildBarFigure({
          x,
          y,
          xLabel: xCol,
          yLabel: yCol,
          title: `${yCol} by ${xCol}`,
        });
      }
      const counts = valueCounts(sample, xCol).slice(0, 20);
      return buildBarFigure({
        x: counts.map((c) => c.value),
        y: counts.map((c) => c.count),
        xLabel: xCol,
        yLabel: 'Count',
        title: `Frequency of ${xCol}`,
      });
    }
  }
}

module.exports = {
  getVisualizationMetadata,
  renderChart,
};
