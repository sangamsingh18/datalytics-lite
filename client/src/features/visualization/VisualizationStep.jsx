import { useEffect, useMemo, useRef, useState } from 'react'
import PlotFigure from './PlotFigure.jsx'
import {
  fetchVisualizationMetadata,
  renderVisualizationBatch,
  renderVisualizationChart,
  syncVisualizationDataset,
} from './visualizationApi.js'
import { useToast } from '../../hooks/useToast.jsx'
import CustomDropdown from '../../components/common/CustomDropdown.jsx'

const CHARTS = [
  { id: 'bar_chart',    label: 'Bar Chart',    description: 'Categorical comparisons and frequency distributions.', mode: 'double' },
  { id: 'line_chart',   label: 'Line Chart',   description: 'Trends and ordered metric series over time or index.',  mode: 'double' },
  { id: 'pie_chart',    label: 'Pie Chart',    description: 'Part-to-whole proportion analysis across categories.',  mode: 'single' },
  { id: 'histogram',    label: 'Histogram',    description: 'Frequency distribution and density of numeric data.',  mode: 'single' },
  { id: 'scatter_plot', label: 'Scatter Plot', description: 'Correlation and relationships between two variables.',  mode: 'double' },
  { id: 'box_plot',     label: 'Box Plot',     description: 'Quartiles, median spread, and outlier identification.', mode: 'single' },
]

function buildSupportMap(metadata) {
  return new Map((metadata?.supported_charts || []).map((item) => [item.id, item]))
}

function defaultFeaturedChart(metadata) {
  const supported = CHARTS.find((chart) => buildSupportMap(metadata).get(chart.id)?.enabled)
  return supported?.id || CHARTS[0].id
}

function chartOptions(chartId, metadata) {
  const columns = metadata?.columns || {}
  const all = columns.all || []
  const numeric = columns.numeric || []
  const categorical = columns.categorical || []

  if (['histogram', 'box_plot'].includes(chartId)) {
    return { single: numeric }
  }
  if (['pie_chart'].includes(chartId)) {
    return { single: categorical.length ? categorical : all }
  }
  if (['scatter_plot'].includes(chartId)) {
    return { x: numeric, y: numeric }
  }
  if (['bar_chart', 'line_chart'].includes(chartId)) {
    return { x: all, y: numeric, group: categorical }
  }
  return { single: all }
}

function firstValidOption(options = [], exclude = []) {
  const excluded = new Set(exclude.filter(Boolean))
  return options.find((option) => option && !excluded.has(option)) || options[0] || ''
}

function normalizeChartConfig(chartId, config = {}, metadata) {
  const options = chartOptions(chartId, metadata)
  const next = {
    chart_key: chartId,
    chart_type: chartId,
    bins: Number(config.bins) || 24,
    column: '',
    x_column: '',
    y_column: '',
    ...config,
  }

  if (['histogram', 'box_plot', 'pie_chart'].includes(chartId)) {
    next.column = options.single?.includes(config.column) ? config.column : firstValidOption(options.single)
    return next
  }

  if (chartId === 'scatter_plot') {
    next.x_column = options.x?.includes(config.x_column) ? config.x_column : firstValidOption(options.x)
    next.y_column = options.y?.includes(config.y_column) && config.y_column !== next.x_column
      ? config.y_column
      : firstValidOption(options.y, [next.x_column])
    return next
  }

  if (['bar_chart', 'line_chart'].includes(chartId)) {
    next.x_column = options.x?.includes(config.x_column) ? config.x_column : firstValidOption(options.x)
    next.y_column = options.y?.includes(config.y_column) ? config.y_column : firstValidOption(options.y)
    return next
  }

  return next
}

function canRenderChart(chart, config, metadata) {
  const support = buildSupportMap(metadata).get(chart.id)
  if (!support?.enabled) return false
  if (chart.mode === 'single') return Boolean(config.column)
  if (chart.mode === 'double') return Boolean(config.x_column && config.y_column)
  return true
}

function buildInitialConfigs(metadata) {
  const defaults = metadata?.defaults || {}
  return Object.fromEntries(
    CHARTS.map((chart) => {
      const rawConfig = {
        chart_key: chart.id,
        chart_type: chart.id,
        bins: 24,
        column: defaults[chart.id]?.column || '',
        x_column: defaults[chart.id]?.x_column || '',
        y_column: defaults[chart.id]?.y_column || '',
      }
      return [chart.id, normalizeChartConfig(chart.id, rawConfig, metadata)]
    })
  )
}

function buildPayload(chartId, config, themeMode) {
  return {
    ...config,
    chart_key: chartId,
    chart_type: chartId,
    theme: themeMode,
  }
}

function buildSummary(chart, config) {
  return {
    chartType: chart.label,
    x: config.x_column || config.column || '',
    y: config.y_column || '',
  }
}

function createUnavailableResult(chartId, message) {
  return {
    chart_key: chartId,
    chart_type: chartId,
    error: message,
  }
}

export default function VisualizationStep({
  dataset,
  datasetProfile,
  vizConfig,
  setVizConfig,
  onAddChart,
  onComplete,
  onBeforeVisualize,
  onContinueToPrediction,
  onJumpToUpload,
}) {
  const { addToast } = useToast()
  const themeMode = 'dark'
  const [metadata, setMetadata] = useState(null)
  const [chartConfigs, setChartConfigs] = useState({})
  const [chartResults, setChartResults] = useState({})
  const [chartLoading, setChartLoading] = useState({})
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const renderTimers = useRef({})

  const supportMap = useMemo(() => buildSupportMap(metadata), [metadata])

  useEffect(() => () => {
    Object.values(renderTimers.current).forEach((timer) => window.clearTimeout(timer))
  }, [])

  async function renderChartsIndividually(renderableCharts, configMap, nextTheme, nextMetadata) {
    const settled = await Promise.allSettled(
      renderableCharts.map((chart) => renderVisualizationChart(buildPayload(chart.id, configMap[chart.id], nextTheme)))
    )

    return Object.fromEntries(
      settled.map((entry, index) => {
        const chart = renderableCharts[index]
        if (entry.status === 'fulfilled') return [chart.id, entry.value]
        const message = entry.reason?.response?.data?.detail || entry.reason?.message || 'Could not render this chart.'
        return [chart.id, createUnavailableResult(chart.id, message)]
      })
    )
  }

  async function renderAllCharts(configMap, nextTheme = themeMode, nextMetadata = metadata) {
    const loadingState = Object.fromEntries(CHARTS.map((chart) => [chart.id, true]))
    const supportLookup = buildSupportMap(nextMetadata)
    const normalizedConfigs = Object.fromEntries(
      CHARTS.map((chart) => [chart.id, normalizeChartConfig(chart.id, configMap[chart.id] || {}, nextMetadata)])
    )
    const initialResults = {}
    const renderableCharts = []

    CHARTS.forEach((chart) => {
      const support = supportLookup.get(chart.id)
      if (!support?.enabled) {
        initialResults[chart.id] = createUnavailableResult(chart.id, support?.reason || 'Chart not available for this dataset.')
        return
      }
      if (!canRenderChart(chart, normalizedConfigs[chart.id], nextMetadata)) {
        initialResults[chart.id] = createUnavailableResult(chart.id, 'Configure columns to render this chart.')
        return
      }
      renderableCharts.push(chart)
    })

    setChartConfigs(normalizedConfigs)
    setChartLoading(loadingState)
    setChartResults(initialResults)

    if (!renderableCharts.length) {
      setSyncError('No compatible charts could be generated automatically.')
      setChartLoading(Object.fromEntries(CHARTS.map((chart) => [chart.id, false])))
      return
    }

    try {
      const payload = renderableCharts.map((chart) => buildPayload(chart.id, normalizedConfigs[chart.id], nextTheme))
      const response = await renderVisualizationBatch(payload)
      const mappedResults = {
        ...initialResults,
        ...Object.fromEntries((response.results || []).map((item) => [item.chart_key, item])),
      }
      setChartResults(mappedResults)
      setSyncError('')
      onComplete('visualization')
    } catch (err) {
      const fallbackResults = await renderChartsIndividually(renderableCharts, normalizedConfigs, nextTheme, nextMetadata)
      const mergedResults = { ...initialResults, ...fallbackResults }
      setChartResults(mergedResults)
      const successful = Object.values(mergedResults).filter((item) => item?.figure).length
      if (successful) onComplete('visualization')
    } finally {
      setChartLoading(Object.fromEntries(CHARTS.map((chart) => [chart.id, false])))
    }
  }

  async function renderSingleChart(chartId, nextConfig, nextTheme = themeMode, nextMetadata = metadata) {
    const chart = CHARTS.find((item) => item.id === chartId)
    const support = buildSupportMap(nextMetadata).get(chartId)
    const normalizedConfig = normalizeChartConfig(chartId, nextConfig, nextMetadata)

    if (!chart || !support?.enabled || !canRenderChart(chart, normalizedConfig, nextMetadata)) {
      setChartResults((prev) => ({
        ...prev,
        [chartId]: createUnavailableResult(chartId, support?.reason || 'Select valid columns for this chart.'),
      }))
      setChartLoading((prev) => ({ ...prev, [chartId]: false }))
      return
    }

    setChartLoading((prev) => ({ ...prev, [chartId]: true }))
    try {
      const response = await renderVisualizationChart(buildPayload(chartId, normalizedConfig, nextTheme))
      setChartResults((prev) => ({ ...prev, [chartId]: response }))
      setSyncError('')
      onComplete('visualization')
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || 'Could not render this chart.'
      setChartResults((prev) => ({ ...prev, [chartId]: createUnavailableResult(chartId, message) }))
    } finally {
      setChartLoading((prev) => ({ ...prev, [chartId]: false }))
    }
  }

  useEffect(() => {
    if (!dataset) return
    let ignore = false

    async function bootstrapWorkspace() {
      setSyncing(true)
      setSyncError('')
      try {
        const payload = await syncVisualizationDataset(dataset)
        if (ignore) return
        const nextMetadata = payload.metadata || (await fetchVisualizationMetadata())
        const nextConfigs = buildInitialConfigs(nextMetadata)
        setMetadata(nextMetadata)
        setSyncing(false)
        if (!ignore) {
          renderAllCharts(nextConfigs, themeMode, nextMetadata).catch((err) => {
            if (!ignore) setSyncError(err?.message || 'Visualization sync failed.')
          })
        }
      } catch (err) {
        if (ignore) return
        setSyncError(err?.response?.data?.detail || err?.message || 'Failed to initialize visualization workspace.')
        setSyncing(false)
      }
    }

    bootstrapWorkspace()
    return () => {
      ignore = true
    }
  }, [dataset])

  if (!dataset || !datasetProfile) {
    return (
      <div className="empty-state">
        <h2>Upload a dataset to unlock visual analytics</h2>
        <p>Explore your dataset with Bar, Line, Pie, Histogram, Scatter Plot, and Box Plot charts.</p>
        <button className="btn btn-primary" type="button" onClick={onJumpToUpload}>Go to Upload</button>
      </div>
    )
  }

  function handleFieldChange(chartId, field, value) {
    if (!metadata) return
    const nextConfig = normalizeChartConfig(
      chartId,
      {
        ...(chartConfigs[chartId] || {}),
        [field]: value,
      },
      metadata
    )
    setChartConfigs((prev) => ({ ...prev, [chartId]: nextConfig }))
    window.clearTimeout(renderTimers.current[chartId])
    const snapMeta = metadata
    const snapTheme = themeMode
    renderTimers.current[chartId] = window.setTimeout(
      () => renderSingleChart(chartId, nextConfig, snapTheme, snapMeta),
      120
    )
  }

  function handlePinChart(chart) {
    const result = chartResults[chart.id]
    if (!result?.figure) {
      addToast('Render the chart successfully before pinning it.', null, 'warning')
      return
    }
    onAddChart({
      title: chart.label,
      type: chart.id,
      figure: result.figure,
      config: chartConfigs[chart.id],
      note: result.note || result.warning || '',
    })
    onComplete('visualization')
    addToast(`${chart.label} pinned to reports.`, null, 'success')
  }

  return (
    <div className="viz-container">
      <div className="step-header">
        <div>
          <h1 className="page-title">Data Visualization</h1>
          <p className="page-subtitle">Auto-generate 6 core chart types (Bar, Line, Pie, Histogram, Scatter Plot, Box Plot) for your dataset.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-primary" onClick={onContinueToPrediction} disabled={syncing}>
            Continue to Prediction
          </button>
        </div>
      </div>

      {syncing ? (
        <div className="viz-sync-overlay">
          <div className="viz-sync-content">
            <div className="viz-sync-loader" />
            <h2 className="viz-sync-title">Rendering Visualizations</h2>
            <p className="viz-sync-subtitle">Generating interactive statistical charts for your dataset...</p>
          </div>
        </div>
      ) : syncError ? (
        <div className="alert alert-warning">
          <p>{syncError}</p>
        </div>
      ) : metadata ? (
        <div className="viz-grid">
          <main className="viz-main">
            <div className="viz-batch-head">
              <div className="section-title">Core Visualizations (6 Charts)</div>
              <p className="section-subtitle">Categorical, trend, proportion, distribution, correlation, and spread analyses.</p>
            </div>

            <div className="viz-batch-grid">
              {CHARTS.map((chart) => {
                const result = chartResults[chart.id]
                const support = supportMap.get(chart.id)
                const config = chartConfigs[chart.id] || {}
                const options = chartOptions(chart.id, metadata)
                const hasError = !result?.figure && support?.enabled

                return (
                  <div key={chart.id} className="viz-batch-card">
                    <div className="viz-card-head">
                      <div>
                        <h3>{chart.label}</h3>
                        <p style={{ fontSize: '0.8rem' }}>{chart.description}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {hasError && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            title="Retry"
                            onClick={() => renderSingleChart(chart.id, config)}
                          >
                            ↺
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handlePinChart(chart)}
                          disabled={!result?.figure}
                        >
                          Pin
                        </button>
                      </div>
                    </div>

                    <div className={`viz-card-controls-inline ${chart.mode === 'single' ? 'is-single' : ''}`}>
                      {chart.mode === 'single' && (
                        <div className="viz-field-inline">
                          <span>Select Column</span>
                          <CustomDropdown
                            value={config.column || ''}
                            onChange={(val) => handleFieldChange(chart.id, 'column', val)}
                          >
                            {(options.single || []).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </CustomDropdown>
                        </div>
                      )}
                      {chart.mode === 'double' && (
                        <>
                          <div className="viz-field-inline">
                            <span>X Axis</span>
                            <CustomDropdown
                              value={config.x_column || ''}
                              onChange={(val) => handleFieldChange(chart.id, 'x_column', val)}
                            >
                              {(options.x || []).map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </CustomDropdown>
                          </div>
                          <div className="viz-field-inline">
                            <span>Y Axis</span>
                            <CustomDropdown
                              value={config.y_column || ''}
                              onChange={(val) => handleFieldChange(chart.id, 'y_column', val)}
                            >
                              {(options.y || []).map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </CustomDropdown>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="viz-batch-preview">
                      {chartLoading[chart.id] ? (
                        <div className="viz-chart-loading">
                          <div className="viz-spinner" />
                          <span>Rendering...</span>
                        </div>
                      ) : result?.figure ? (
                        <PlotFigure
                          figure={result.figure}
                          themeMode={themeMode}
                          style={{ width: '100%', height: '100%' }}
                          lazy
                        />
                      ) : (
                        <div className="viz-chart-loading">
                          <span style={{ color: '#818cf8', fontSize: '0.8rem' }}>
                            {result?.error || 'Select compatible columns to render.'}
                          </span>
                        </div>
                      )}
                    </div>

                    {result?.warning && (
                      <div className="viz-inline-note is-warning" style={{ fontSize: '0.75rem', padding: '0.5rem' }}>
                        {result.warning}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </main>
        </div>
      ) : null}
    </div>
  )
}
