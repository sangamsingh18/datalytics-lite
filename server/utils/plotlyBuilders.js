// Yeh plotlyBuilders.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Builds Plotly figure JSON ({data, layout}) — the same shape
 * fig.to_json() produces in Python (px.bar/px.pie/px.histogram +
 * update_layout(template="plotly_dark")). The client renders these
 * directly with react-plotly.js, so matching this shape (not the
 * Python library's exact internal styling) is what preserves behavior.
 */

const DARK_LAYOUT = {
  template: 'plotly_dark',
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
};

function buildBarFigure({ x, y, xLabel, yLabel, title }) {
  return {
    data: [
      {
        type: 'bar',
        x,
        y,
        marker: { color: y, colorscale: 'Viridis' },
      },
    ],
    layout: {
      ...DARK_LAYOUT,
      title: { text: title },
      xaxis: { title: { text: xLabel } },
      yaxis: { title: { text: yLabel } },
      showlegend: false,
    },
  };
}

function buildPieFigure({ labels, values, title }) {
  return {
    data: [
      {
        type: 'pie',
        labels,
        values,
        marker: {
          colors: ['#66C2A5', '#FC8D62', '#8DA0CB', '#E78AC3', '#A6D854', '#FFD92F', '#E5C494', '#B3B3B3'],
        },
      },
    ],
    layout: {
      ...DARK_LAYOUT,
      title: { text: title },
    },
  };
}

function buildHistogramFigure({ values, xLabel, title }) {
  return {
    data: [
      {
        type: 'histogram',
        x: values,
        marker: { color: '#6C63FF' },
      },
    ],
    layout: {
      ...DARK_LAYOUT,
      title: { text: title },
      xaxis: { title: { text: xLabel } },
    },
  };
}

function buildLineFigure({ x, y, xLabel, yLabel, title }) {
  return {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x,
        y,
        line: { color: '#6366F1' },
      },
    ],
    layout: {
      ...DARK_LAYOUT,
      title: { text: title },
      xaxis: { title: { text: xLabel } },
      yaxis: { title: { text: yLabel } },
    },
  };
}

function buildScatterFigure({ x, y, xLabel, yLabel, title }) {
  return {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x,
        y,
        marker: { color: '#EC4899', size: 8, opacity: 0.8 },
      },
    ],
    layout: {
      ...DARK_LAYOUT,
      title: { text: title },
      xaxis: { title: { text: xLabel } },
      yaxis: { title: { text: yLabel } },
    },
  };
}

function buildBoxFigure({ y, yLabel, title }) {
  return {
    data: [
      {
        type: 'box',
        y,
        marker: { color: '#10B981' },
        boxpoints: 'outliers',
      },
    ],
    layout: {
      ...DARK_LAYOUT,
      title: { text: title },
      yaxis: { title: { text: yLabel } },
    },
  };
}

module.exports = {
  buildBarFigure,
  buildPieFigure,
  buildHistogramFigure,
  buildLineFigure,
  buildScatterFigure,
  buildBoxFigure,
};
