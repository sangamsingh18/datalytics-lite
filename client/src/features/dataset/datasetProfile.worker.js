// Yeh datasetProfile.worker.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/

function inferColumnTypes(rows, columns) {
  const types = {}
  columns.forEach((column) => {
    let numeric = 0
    let dateLike = 0
    let total = 0
    rows.forEach((row) => {
      const value = row?.[column]
      if (value === '' || value == null) return
      total += 1
      const stringValue = String(value).trim()
      if (NUMBER_RE.test(stringValue)) numeric += 1
      const parsed = Date.parse(stringValue)
      if (!Number.isNaN(parsed)) dateLike += 1
    })
    if (total === 0) {
      types[column] = 'string'
    } else if (numeric / total > 0.7) {
      types[column] = 'number'
    } else if (dateLike / total > 0.7) {
      types[column] = 'date'
    } else {
      types[column] = 'string'
    }
  })
  return types
}

function computeMissingByColumn(rows, columns) {
  const missing = {}
  columns.forEach((column) => {
    missing[column] = 0
  })
  rows.forEach((row) => {
    columns.forEach((column) => {
      const value = row?.[column]
      if (value == null || value === '') {
        missing[column] += 1
      }
    })
  })
  return missing
}

self.onmessage = (event) => {
  const rows = Array.isArray(event.data?.rows) ? event.data.rows : []
  const columns = Array.isArray(event.data?.columns) ? event.data.columns : []
  self.postMessage({
    types: inferColumnTypes(rows, columns),
    nullCounts: computeMissingByColumn(rows, columns),
  })
}
