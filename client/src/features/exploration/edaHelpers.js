// Yeh edaHelpers.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
export const SCOPE_ALL = '__all__'
export const SCOPE_NUMERIC = '__numeric__'
export const SCOPE_CATEGORICAL = '__categorical__'
export const SCOPE_DATETIME = '__datetime__'

export const SECTION_ITEMS = [
  { key: 'preview', label: 'Dataset Preview',     description: 'Head & Tail raw rows' },
  { key: 'info',    label: 'Dataset Info',        description: 'Dimensions, types & schema' },
  { key: 'missing', label: 'Missing Values',      description: 'Null counts by column' },
  { key: 'stats',   label: 'Statistical Summary', description: 'Count, mean, std, min, max' },
]

export function resolveScopedColumns(scope, summary, fallbackKind = 'all') {
  const columns = summary?.available_columns || {}
  if (scope === SCOPE_ALL) return columns.all || []
  if (scope === SCOPE_NUMERIC) return columns.numeric || []
  if (scope === SCOPE_CATEGORICAL) return columns.categorical || []
  if (scope === SCOPE_DATETIME) return columns.datetime || []
  if (scope) return [scope]
  return columns[fallbackKind] || columns.all || []
}

export function buildScopedOptions(summary, kind = 'all') {
  const columns = summary?.available_columns || {}
  const options = []

  if (kind === 'all') {
    options.push({ value: SCOPE_ALL, label: 'All Columns' })
    if (columns.numeric?.length) options.push({ value: SCOPE_NUMERIC, label: 'All Numeric Columns' })
    if (columns.categorical?.length) options.push({ value: SCOPE_CATEGORICAL, label: 'All Text / Categorical Columns' })
    if (columns.datetime?.length) options.push({ value: SCOPE_DATETIME, label: 'All Datetime Columns' })
    ;(columns.all || []).forEach((column) => options.push({ value: column, label: column }))
    return options
  }

  const selected = columns[kind] || []
  const scopedValue =
    kind === 'numeric' ? SCOPE_NUMERIC :
      kind === 'categorical' ? SCOPE_CATEGORICAL :
        kind === 'datetime' ? SCOPE_DATETIME : SCOPE_ALL

  if (selected.length > 1) {
    const label =
      kind === 'numeric' ? 'All Numeric Columns' :
        kind === 'categorical' ? 'All Text / Categorical Columns' :
          kind === 'datetime' ? 'All Datetime Columns' : 'All Columns'
    options.push({ value: scopedValue, label })
  }

  selected.forEach((column) => options.push({ value: column, label: column }))
  return options
}

export function formatMetric(value) {
  if (value == null || Number.isNaN(value)) return '0'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  if (Math.abs(numeric) >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`
  if (Math.abs(numeric) >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`
  if (Number.isInteger(numeric)) return numeric.toLocaleString()
  return numeric.toFixed(3)
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
