// Yeh dataPreparation.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
import { quantile, toNumber } from './dataset.js'

export const TARGET_ALL_COLUMNS = '__all__'
export const TARGET_ALL_NUMERIC = '__all_numeric__'
export const TARGET_ALL_CATEGORICAL = '__all_categorical__'
export const TARGET_ALL_TEXT = '__all_text__'

function isMissing(value) {
  return value == null || value === ''
}

function cloneDataset(dataset, rows, patch = {}) {
  return {
    ...dataset,
    ...patch,
    rows,
    columns: dataset.columns || (rows[0] ? Object.keys(rows[0]) : []),
  }
}

function getTextColumns(profile) {
  return Object.entries(profile?.types || {})
    .filter(([, type]) => type !== 'number')
    .map(([column]) => column)
}

function resolveColumns(dataset, profile, target) {
  if (!dataset?.columns?.length) return []
  if (target === TARGET_ALL_COLUMNS) return dataset.columns
  if (target === TARGET_ALL_NUMERIC) return profile?.numericColumns || []
  if (target === TARGET_ALL_CATEGORICAL) return profile?.categoricalColumns || []
  if (target === TARGET_ALL_TEXT) return getTextColumns(profile)
  return dataset.columns.includes(target) ? [target] : []
}

function createMode(values) {
  const counts = new Map()
  values.forEach((value) => {
    if (isMissing(value)) return
    const key = JSON.stringify(value)
    const entry = counts.get(key) || { count: 0, value }
    entry.count += 1
    counts.set(key, entry)
  })

  let winner = null
  counts.forEach((entry) => {
    if (!winner || entry.count > winner.count) {
      winner = entry
    }
  })
  return winner?.value
}

function getNumericValues(rows, column) {
  return rows
    .map((row) => toNumber(row[column]))
    .filter((value) => Number.isFinite(value))
}

function getFillValue(rows, column, type, method, constantValue) {
  if (method === 'constant') {
    if (type === 'number') {
      const parsed = Number(constantValue)
      return Number.isFinite(parsed) ? parsed : null
    }
    return constantValue
  }

  if (method === 'mode') {
    return createMode(rows.map((row) => row[column]))
  }

  if (type !== 'number') return null

  const values = getNumericValues(rows, column)
  if (!values.length) return null

  if (method === 'mean') {
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  if (method === 'median') {
    const sorted = [...values].sort((a, b) => a - b)
    return quantile(sorted, 0.5)
  }

  return null
}

function getIqrBounds(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  return {
    lower: q1 - 1.5 * iqr,
    upper: q3 + 1.5 * iqr,
  }
}

export function countDuplicateRows(dataset) {
  if (!dataset?.rows?.length || !dataset?.columns?.length) return 0
  const seen = new Set()
  let duplicates = 0

  dataset.rows.forEach((row) => {
    const key = JSON.stringify(dataset.columns.map((column) => row[column]))
    if (seen.has(key)) {
      duplicates += 1
      return
    }
    seen.add(key)
  })

  return duplicates
}

export function removeDuplicateRows(dataset) {
  if (!dataset?.rows?.length) {
    return { dataset, changedCount: 0, message: 'No rows available to deduplicate.' }
  }

  const seen = new Set()
  const rows = []

  dataset.rows.forEach((row) => {
    const key = JSON.stringify((dataset.columns || Object.keys(row)).map((column) => row[column]))
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ ...row })
  })

  const removed = dataset.rows.length - rows.length
  return {
    dataset: removed ? cloneDataset(dataset, rows) : dataset,
    changedCount: removed,
    message: removed ? `Removed ${removed} duplicate row${removed === 1 ? '' : 's'}.` : 'No duplicate rows were found.',
  }
}

export function trimTextValues(dataset, profile, target = TARGET_ALL_TEXT) {
  const selectedColumns = resolveColumns(dataset, profile, target)
  if (!selectedColumns.length) {
    return { dataset, changedCount: 0, message: 'No text columns available to trim.' }
  }

  let changedCount = 0
  const rows = dataset.rows.map((row) => {
    let nextRow = row
    selectedColumns.forEach((column) => {
      const value = row[column]
      if (typeof value !== 'string') return
      const trimmed = value.trim()
      if (trimmed === value) return
      if (nextRow === row) nextRow = { ...row }
      nextRow[column] = trimmed
      changedCount += 1
    })
    return nextRow === row ? row : nextRow
  })

  return {
    dataset: changedCount ? cloneDataset(dataset, rows) : dataset,
    changedCount,
    message: changedCount ? `Trimmed whitespace in ${changedCount} cell${changedCount === 1 ? '' : 's'}.` : 'No extra whitespace was found.',
  }
}

export function fillMissingValues(dataset, profile, options) {
  const { target, method, constantValue = '' } = options
  const selectedColumns = resolveColumns(dataset, profile, target)

  if (!selectedColumns.length) {
    return { dataset, changedCount: 0, message: 'Select at least one column to clean missing values.' }
  }

  if (method === 'dropRows') {
    const rows = dataset.rows.filter((row) => selectedColumns.every((column) => !isMissing(row[column])))
    const removed = dataset.rows.length - rows.length
    return {
      dataset: removed ? cloneDataset(dataset, rows.map((row) => ({ ...row }))) : dataset,
      changedCount: removed,
      message: removed ? `Removed ${removed} row${removed === 1 ? '' : 's'} with missing values.` : 'No rows matched the missing-value filter.',
    }
  }

  const fillValues = new Map()
  selectedColumns.forEach((column) => {
    const fillValue = getFillValue(dataset.rows, column, profile?.types?.[column], method, constantValue)
    if (fillValue != null || method === 'constant') {
      fillValues.set(column, fillValue)
    }
  })

  if (!fillValues.size) {
    return {
      dataset,
      changedCount: 0,
      message: 'The selected method is not compatible with the chosen columns.',
    }
  }

  let changedCount = 0
  const rows = dataset.rows.map((row) => {
    let nextRow = row
    fillValues.forEach((fillValue, column) => {
      if (!isMissing(row[column])) return
      if (nextRow === row) nextRow = { ...row }
      nextRow[column] = fillValue
      changedCount += 1
    })
    return nextRow === row ? row : nextRow
  })

  return {
    dataset: changedCount ? cloneDataset(dataset, rows) : dataset,
    changedCount,
    message: changedCount ? `Filled ${changedCount} missing cell${changedCount === 1 ? '' : 's'} using ${method}.` : 'No missing cells were updated.',
  }
}

export function removeOutliersIqr(dataset, profile, options) {
  const { target = TARGET_ALL_NUMERIC, mode = 'remove' } = options
  const selectedColumns = resolveColumns(dataset, profile, target)
    .filter((column) => profile?.types?.[column] === 'number')

  if (!selectedColumns.length) {
    return { dataset, changedCount: 0, message: 'No numeric columns are available for outlier handling.' }
  }

  const bounds = new Map()
  selectedColumns.forEach((column) => {
    const columnBounds = getIqrBounds(getNumericValues(dataset.rows, column))
    if (columnBounds) bounds.set(column, columnBounds)
  })

  if (!bounds.size) {
    return { dataset, changedCount: 0, message: 'Not enough numeric data was found to calculate outliers.' }
  }

  if (mode === 'cap') {
    let changedCount = 0
    const rows = dataset.rows.map((row) => {
      let nextRow = row
      bounds.forEach((columnBounds, column) => {
        const numericValue = toNumber(row[column])
        if (!Number.isFinite(numericValue)) return
        if (numericValue >= columnBounds.lower && numericValue <= columnBounds.upper) return
        const cappedValue = Math.min(columnBounds.upper, Math.max(columnBounds.lower, numericValue))
        if (nextRow === row) nextRow = { ...row }
        nextRow[column] = cappedValue
        changedCount += 1
      })
      return nextRow === row ? row : nextRow
    })

    return {
      dataset: changedCount ? cloneDataset(dataset, rows) : dataset,
      changedCount,
      message: changedCount ? `Capped ${changedCount} outlier value${changedCount === 1 ? '' : 's'} using IQR bounds.` : 'No outlier values needed capping.',
    }
  }

  const rows = dataset.rows.filter((row) => {
    for (const [column, columnBounds] of bounds.entries()) {
      const numericValue = toNumber(row[column])
      if (!Number.isFinite(numericValue)) continue
      if (numericValue < columnBounds.lower || numericValue > columnBounds.upper) return false
    }
    return true
  })

  const removed = dataset.rows.length - rows.length
  return {
    dataset: removed ? cloneDataset(dataset, rows.map((row) => ({ ...row }))) : dataset,
    changedCount: removed,
    message: removed ? `Removed ${removed} row${removed === 1 ? '' : 's'} flagged as outliers.` : 'No outlier rows were removed.',
  }
}

export function findAndReplaceValues(dataset, profile, options) {
  const { target = TARGET_ALL_TEXT, findValue = '', replaceValue = '', mode = 'contains' } = options
  const selectedColumns = resolveColumns(dataset, profile, target)

  if (!selectedColumns.length) {
    return { dataset, changedCount: 0, message: 'Select at least one column for find and replace.' }
  }

  if (!findValue) {
    return { dataset, changedCount: 0, message: 'Enter a value to find before replacing.' }
  }

  let changedCount = 0
  const rows = dataset.rows.map((row) => {
    let nextRow = row
    selectedColumns.forEach((column) => {
      const value = row[column]
      if (isMissing(value)) return

      if (mode === 'exact') {
        if (String(value) !== findValue) return
        if (nextRow === row) nextRow = { ...row }
        nextRow[column] = replaceValue
        changedCount += 1
        return
      }

      if (typeof value !== 'string' || !value.includes(findValue)) return
      if (nextRow === row) nextRow = { ...row }
      nextRow[column] = value.split(findValue).join(replaceValue)
      changedCount += 1
    })
    return nextRow === row ? row : nextRow
  })

  return {
    dataset: changedCount ? cloneDataset(dataset, rows) : dataset,
    changedCount,
    message: changedCount ? `Updated ${changedCount} cell${changedCount === 1 ? '' : 's'} with find and replace.` : 'No matching values were found.',
  }
}
