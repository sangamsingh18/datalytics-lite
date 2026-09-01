import DataTable from '../dataset/DatasetTable.jsx'
import { formatMetric } from './edaHelpers.js'

function MetricTile({ label, value, caption }) {
  return (
    <div className="eda-metric-tile">
      <span className="eda-metric-label">{label}</span>
      <strong className="eda-metric-value">{value}</strong>
      {caption && <span className="eda-metric-caption">{caption}</span>}
    </div>
  )
}

function SectionCard({ title, copy, actions, children }) {
  return (
    <section className="eda-card">
      <div className="eda-card-header">
        <div>
          <h3 className="eda-card-title">{title}</h3>
          {copy && <p className="eda-card-copy">{copy}</p>}
        </div>
        {actions && <div className="eda-card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function EdaInfoSection({ summary }) {
  const shape = summary?.overview?.shape || {}
  const columns = summary?.overview?.columns || []
  const numCols = summary?.available_columns?.numeric || []
  const catCols = summary?.available_columns?.categorical || []

  return (
    <div className="eda-section-stack">
      <div className="eda-metric-grid">
        <MetricTile label="Total Rows" value={formatMetric(shape.rows)} caption="Total record count" />
        <MetricTile label="Total Columns" value={formatMetric(shape.columns)} caption="All features in dataset" />
        <MetricTile label="Numerical Columns" value={formatMetric(numCols.length || shape.numeric_columns)} caption="Continuous / Discrete" />
        <MetricTile label="Categorical Columns" value={formatMetric(catCols.length || shape.categorical_columns)} caption="Text / Category values" />
      </div>

      <SectionCard title="Dataset Schema & Types" copy="Column names, inferred data types, non-null counts, and uniqueness.">
        <DataTable
          rows={columns}
          columns={['column', 'dtype', 'non_null', 'missing', 'unique']}
          pageSize={12}
          sortable
        />
      </SectionCard>
    </div>
  )
}

export function EdaPreviewSection({ summary, previewMode, setPreviewMode }) {
  const previewRows = previewMode === 'tail' ? summary?.overview?.tail : summary?.overview?.head
  const previewLabel = previewMode === 'tail' ? 'Tail (Bottom Rows)' : 'Head (Top Rows)'

  return (
    <div className="eda-section-stack">
      <SectionCard
        title={previewLabel}
        copy="Inspect raw sample rows of the loaded dataset."
        actions={
          <div className="eda-inline-tabs">
            <button
              type="button"
              className={`eda-tab-btn${previewMode === 'head' ? ' is-active' : ''}`}
              onClick={() => setPreviewMode('head')}
            >
              Head (First 10)
            </button>
            <button
              type="button"
              className={`eda-tab-btn${previewMode === 'tail' ? ' is-active' : ''}`}
              onClick={() => setPreviewMode('tail')}
            >
              Tail (Last 10)
            </button>
          </div>
        }
      >
        <DataTable rows={previewRows || []} pageSize={10} sortable highlightNulls />
      </SectionCard>
    </div>
  )
}

export function EdaStatsSection({ summary }) {
  const statistics = summary?.statistics || {}
  const numericRows = (statistics.numeric || []).map((item) => ({
    column: item.column,
    count: formatMetric(item.count || summary?.overview?.shape?.rows),
    mean: formatMetric(item.mean),
    std: formatMetric(item.std),
    min: formatMetric(item.min),
    max: formatMetric(item.max),
    median: formatMetric(item.median),
    q25: formatMetric(item.q25),
    q75: formatMetric(item.q75),
  }))

  return (
    <div className="eda-section-stack">
      <SectionCard title="Statistical Summary" copy="Descriptive statistics (count, mean, standard deviation, min, max, quartiles) for numerical features.">
        <DataTable rows={numericRows} pageSize={10} sortable />
      </SectionCard>
    </div>
  )
}

export function EdaMissingSection({ summary }) {
  const quality = summary?.quality || {}

  return (
    <div className="eda-section-stack">
      <div className="eda-metric-grid">
        <MetricTile label="Missing Cells" value={formatMetric(quality.missing_total)} caption="Total nulls across dataset" />
        <MetricTile label="Duplicate Rows" value={formatMetric(quality.duplicate_rows)} caption={`${quality.duplicate_pct || 0}% of dataset`} />
      </div>

      <SectionCard title="Missing Values by Column" copy="Missing value counts and percentages across all dataset attributes.">
        <DataTable
          rows={quality.missing_by_column || []}
          columns={['column', 'missing', 'missing_pct']}
          pageSize={10}
          sortable
        />
      </SectionCard>
    </div>
  )
}
