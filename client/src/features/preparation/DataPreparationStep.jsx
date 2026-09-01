import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import DataTable from '../dataset/DatasetTable.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { buildDatasetProfile } from '../../utils/dataset.js'
import CustomDropdown from '../../components/common/CustomDropdown.jsx'
import {
  TARGET_ALL_COLUMNS,
  TARGET_ALL_CATEGORICAL,
  TARGET_ALL_NUMERIC,
  countDuplicateRows,
  fillMissingValues,
  removeDuplicateRows,
  removeOutliersIqr,
} from '../../utils/dataPreparation.js'

const FILL_METHOD_OPTIONS = {
  numeric: [
    { value: 'mean', label: 'Fill with Mean' },
    { value: 'median', label: 'Fill with Median' },
    { value: 'mode', label: 'Fill with Mode' },
    { value: 'constant', label: 'Fill with Custom Value' },
    { value: 'dropRows', label: 'Drop Rows with Missing Values' },
  ],
  categorical: [
    { value: 'mode', label: 'Fill with Mode' },
    { value: 'constant', label: 'Fill with Custom Value' },
    { value: 'dropRows', label: 'Drop Rows with Missing Values' },
  ],
  mixed: [
    { value: 'mode', label: 'Fill with Mode' },
    { value: 'constant', label: 'Fill with Custom Value' },
    { value: 'dropRows', label: 'Drop Rows with Missing Values' },
  ],
}

function formatDelta(value, invert = false) {
  if (!value) return 'No change'
  const positive = invert ? value < 0 : value > 0
  const neutralized = Math.abs(value)
  return `${positive ? '+' : '-'}${neutralized.toLocaleString()}`
}

function getFillScope(profile, target) {
  if (target === TARGET_ALL_NUMERIC) return 'numeric'
  if (target === TARGET_ALL_CATEGORICAL) return 'categorical'
  if (target === TARGET_ALL_COLUMNS) return 'mixed'
  return profile?.types?.[target] === 'number' ? 'numeric' : 'categorical'
}

function getSelectOptions(profile, mode) {
  const options = []
  if (mode === 'fill') {
    if (profile?.numericColumns?.length) options.push({ value: TARGET_ALL_NUMERIC, label: 'All Numeric Columns' })
    if (profile?.categoricalColumns?.length) options.push({ value: TARGET_ALL_CATEGORICAL, label: 'All Categorical Columns' })
    options.push({ value: TARGET_ALL_COLUMNS, label: 'All Columns' })
  }
  if (mode === 'outliers' && profile?.numericColumns?.length) {
    options.push({ value: TARGET_ALL_NUMERIC, label: 'All Numeric Columns' })
  }
  profile?.columns?.forEach((column) => {
    if (mode === 'outliers' && profile?.types?.[column] !== 'number') return
    options.push({ value: column, label: column })
  })
  return options
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint && <div className="prep-metric-hint">{hint}</div>}
    </div>
  )
}

export default function DataPreparationStep({
  dataset,
  datasetProfile,
  onContinue,
  onJumpToUpload,
}) {
  const { addToast } = useToast()
  const [workingDataset, setWorkingDataset] = useState(dataset)
  const [history, setHistory] = useState([])
  const [dirty, setDirty] = useState(false)
  const [fillTarget, setFillTarget] = useState(TARGET_ALL_NUMERIC)
  const [fillMethod, setFillMethod] = useState('mean')
  const [fillConstant, setFillConstant] = useState('')
  const [outlierTarget, setOutlierTarget] = useState(TARGET_ALL_NUMERIC)
  const [outlierMode, setOutlierMode] = useState('remove')
  const [dtypeTarget, setDtypeTarget] = useState('')
  const [dtypeType, setDtypeType] = useState('number')

  const baseProfile = useMemo(() => datasetProfile || (dataset ? buildDatasetProfile(dataset) : null), [dataset, datasetProfile])
  const workingProfile = useMemo(() => (workingDataset ? buildDatasetProfile(workingDataset) : null), [workingDataset])
  const baseDuplicates = useMemo(() => countDuplicateRows(dataset), [dataset])
  const workingDuplicates = useMemo(() => countDuplicateRows(workingDataset), [workingDataset])

  useEffect(() => {
    setWorkingDataset(dataset)
    setHistory([])
    setDirty(false)
  }, [dataset])

  useEffect(() => {
    if (!workingProfile) return
    const fillOptions = getSelectOptions(workingProfile, 'fill')
    const outlierOptions = getSelectOptions(workingProfile, 'outliers')
    if (!fillOptions.some((option) => option.value === fillTarget)) {
      setFillTarget(fillOptions[0]?.value || TARGET_ALL_COLUMNS)
    }
    if (!outlierOptions.some((option) => option.value === outlierTarget)) {
      setOutlierTarget(outlierOptions[0]?.value || TARGET_ALL_NUMERIC)
    }
  }, [fillTarget, outlierTarget, workingProfile])

  const fillScope = getFillScope(workingProfile, fillTarget)
  const fillOptions = FILL_METHOD_OPTIONS[fillScope] || FILL_METHOD_OPTIONS.mixed

  useEffect(() => {
    if (!fillOptions.some((option) => option.value === fillMethod)) {
      setFillMethod(fillOptions[0]?.value || 'mode')
    }
  }, [fillMethod, fillOptions])

  if (!dataset || !workingDataset || !workingProfile || !baseProfile) {
    return (
      <div className="empty-state">
        <h2>Upload a dataset to prepare it</h2>
        <p>Clean missing values, handle outliers, remove duplicates, and fix data types before analysis.</p>
        <button className="btn btn-primary" type="button" onClick={onJumpToUpload}>Go to Upload</button>
      </div>
    )
  }

  function pushHistory(previousDataset) {
    setHistory((prev) => [...prev.slice(-14), previousDataset])
  }

  function applyResult(result) {
    if (!result?.changedCount) {
      addToast(result?.message || 'No changes were made.', null, 'warning')
      return
    }
    pushHistory(workingDataset)
    setWorkingDataset(result.dataset)
    setDirty(true)
    addToast(result.message, null, 'success')
  }

  function handleUndo() {
    if (!history.length) {
      addToast('There is nothing to undo yet.', null, 'warning')
      return
    }
    const previous = history[history.length - 1]
    setHistory((prev) => prev.slice(0, -1))
    setWorkingDataset(previous)
    setDirty(previous !== dataset || history.length > 1)
    addToast('Reverted the last preparation change.', null, 'success')
  }

  function handleResetWorkingCopy() {
    setWorkingDataset(dataset)
    setHistory([])
    setDirty(false)
    addToast('Reset the working copy to the original dataset.', null, 'success')
  }

  function handleContinue() {
    if (!workingDataset.rows.length) {
      addToast('The cleaned dataset has no rows left. Undo or reset before continuing.', null, 'error')
      return
    }
    onContinue(workingDataset, dirty)
    addToast(dirty ? 'Prepared dataset saved. Moving to visualization.' : 'Continuing with current dataset.', null, 'success')
  }

  function handleDownloadCSV() {
    if (!workingDataset || !workingDataset.rows.length) {
      addToast('No data to download.', null, 'warning')
      return
    }
    const csv = Papa.unparse(workingDataset.rows, { columns: workingDataset.columns })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'prepared_dataset.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    addToast('Prepared dataset downloaded as CSV.', null, 'success')
  }

  function handleDownloadXLSX() {
    if (!workingDataset || !workingDataset.rows.length) {
      addToast('No data to download.', null, 'warning')
      return
    }
    const ws = XLSX.utils.json_to_sheet(workingDataset.rows, { header: workingDataset.columns })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Prepared Data')
    XLSX.writeFile(wb, 'prepared_dataset.xlsx')
    addToast('Prepared dataset downloaded as XLSX.', null, 'success')
  }

  function coerceColumn(rows, col, toType) {
    return rows.map((row) => {
      const raw = row[col]
      if (raw === null || raw === undefined || raw === '') return { ...row, [col]: null }
      try {
        if (toType === 'number') {
          if (typeof raw === 'number') return { ...row, [col]: raw }
          const cleaned = String(raw).replace(/[^\d.-]/g, '')
          const n = Number(cleaned)
          return { ...row, [col]: isNaN(n) || cleaned === '' ? null : n }
        }
        if (toType === 'boolean') {
          const s = String(raw).trim().toLowerCase()
          return { ...row, [col]: s === 'true' || s === '1' || s === 'yes' }
        }
        if (toType === 'date') {
          const d = new Date(raw)
          return { ...row, [col]: isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
        }
        return { ...row, [col]: String(raw) }
      } catch {
        return { ...row, [col]: null }
      }
    })
  }

  function handleFixDataType() {
    if (!dtypeTarget) {
      addToast('Select a column to convert.', null, 'warning')
      return
    }
    const cols = dtypeTarget === '__all__' ? workingDataset.columns : [dtypeTarget]
    let rows = [...workingDataset.rows]
    cols.forEach((col) => {
      rows = coerceColumn(rows, col, dtypeType)
    })
    pushHistory(workingDataset)
    setWorkingDataset({ ...workingDataset, rows })
    setDirty(true)
    addToast(`Converted "${dtypeTarget === '__all__' ? 'All columns' : dtypeTarget}" to ${dtypeType}.`, null, 'success')
  }

  function handleAutoFixTypes() {
    const cols = workingDataset.columns
    let rows = [...workingDataset.rows]
    const fixed = []
    cols.forEach((col) => {
      const sample = rows.slice(0, 100).map((r) => r[col]).filter((v) => v !== null && v !== '')
      const allNumeric = sample.length > 0 && sample.every((v) => {
        if (typeof v === 'number') return true
        const cleaned = String(v).replace(/[^\d.-]/g, '')
        return cleaned !== '' && !isNaN(Number(cleaned))
      })
      if (allNumeric && workingProfile?.types?.[col] !== 'number') {
        rows = coerceColumn(rows, col, 'number')
        fixed.push(col)
      }
    })
    if (!fixed.length) {
      addToast('All columns already have correct data types.', null, 'info')
      return
    }
    pushHistory(workingDataset)
    setWorkingDataset({ ...workingDataset, rows })
    setDirty(true)
    addToast(`Auto-fixed ${fixed.length} column(s) to numeric: ${fixed.join(', ')}`, null, 'success')
  }

  const rowDelta = (workingProfile.rowCount || 0) - (baseProfile.rowCount || 0)
  const missingDelta = (workingProfile.missingTotal || 0) - (baseProfile.missingTotal || 0)
  const duplicateDelta = workingDuplicates - baseDuplicates

  return (
    <div className="prep-container">
      <div className="step-header">
        <div>
          <h1 className="page-title">Data Preparation</h1>
          <p className="page-subtitle">Clean missing values, handle outliers, remove duplicates, and fix data types before analysis.</p>
        </div>
        <div className="flex flex-1 items-center justify-end gap-4 w-full ml-auto">
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-secondary" onClick={handleUndo}>
              Undo
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleResetWorkingCopy}>
              Reset
            </button>
            <button type="button" className="btn btn-primary" onClick={handleContinue}>
              {dirty ? 'Save & Continue' : 'Continue to Visualization'}
            </button>
          </div>
          <div className="flex items-center gap-2 border-l border-white/10 pl-4">
            <button type="button" className="btn btn-secondary" onClick={handleDownloadCSV}>
              Export CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleDownloadXLSX}>
              Export XLSX
            </button>
          </div>
        </div>
      </div>

      <div className="prep-banner">
        <span className={`badge ${dirty ? 'warning' : 'success'}`}>
          {dirty ? 'Unsaved changes in working copy' : 'Working copy synced'}
        </span>
        <span className="prep-banner-copy">
          Apply any combination of cleaning operations below, preview the live table, then continue to Visualization.
        </span>
      </div>

      <div className="prep-metrics-grid">
        <MetricCard
          label="Rows"
          value={(workingProfile.rowCount ?? 0).toLocaleString()}
          hint={`Original: ${(baseProfile.rowCount ?? 0).toLocaleString()} | ${formatDelta(rowDelta)}`}
        />
        <MetricCard
          label="Missing Cells"
          value={(workingProfile.missingTotal ?? 0).toLocaleString()}
          hint={`Original: ${(baseProfile.missingTotal ?? 0).toLocaleString()} | ${formatDelta(missingDelta, true)}`}
        />
        <MetricCard
          label="Duplicate Rows"
          value={(workingDuplicates ?? 0).toLocaleString()}
          hint={`Original: ${(baseDuplicates ?? 0).toLocaleString()} | ${formatDelta(duplicateDelta, true)}`}
        />
        <MetricCard
          label="Numeric Columns"
          value={workingProfile.numericColumns?.length ?? 0}
          hint={`${workingProfile.categoricalColumns?.length ?? 0} categorical`}
        />
      </div>

      {/* 4 Core Data Preparation Cards */}
      <div className="prep-grid">
        {/* 1. Missing Value Handling */}
        <div className="card prep-card">
          <div className="prep-card-header">
            <div>
              <div className="prep-card-title">1. Missing Value Handling</div>
              <p className="prep-card-copy">Fill with mean, median, mode, constant, or drop incomplete rows.</p>
            </div>
            <span className="badge badge-orange">{workingProfile.missingTotal.toLocaleString()} missing</span>
          </div>

          <div className="prep-form-grid">
            <label className="prep-field">
              <span>Target Column</span>
              <CustomDropdown value={fillTarget} onChange={(value) => setFillTarget(value)}>
                {getSelectOptions(workingProfile, 'fill').map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </CustomDropdown>
            </label>

            <label className="prep-field">
              <span>Method</span>
              <CustomDropdown value={fillMethod} onChange={(value) => setFillMethod(value)}>
                {fillOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </CustomDropdown>
            </label>

            {fillMethod === 'constant' && (
              <label className="prep-field prep-field-full">
                <span>Custom Value</span>
                <input
                  type="text"
                  value={fillConstant}
                  onChange={(e) => setFillConstant(e.target.value)}
                  placeholder="Enter replacement value"
                />
              </label>
            )}
          </div>

          <div className="prep-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => applyResult(fillMissingValues(workingDataset, workingProfile, {
                target: fillTarget,
                method: fillMethod,
                constantValue: fillConstant,
              }))}
            >
              Apply Missing Value Fix
            </button>
          </div>
        </div>

        {/* 2. Outlier Handling */}
        <div className="card prep-card">
          <div className="prep-card-header">
            <div>
              <div className="prep-card-title">2. Outlier Handling (IQR)</div>
              <p className="prep-card-copy">Detect and remove outlier rows using standard IQR bounds (1.5 × IQR).</p>
            </div>
            <span className="badge badge-orange">{workingProfile.numericColumns.length} numeric columns</span>
          </div>

          <div className="prep-form-grid">
            <label className="prep-field">
              <span>Numeric Target</span>
              <CustomDropdown value={outlierTarget} onChange={(value) => setOutlierTarget(value)}>
                {getSelectOptions(workingProfile, 'outliers').map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </CustomDropdown>
            </label>

            <label className="prep-field">
              <span>Action</span>
              <CustomDropdown value={outlierMode} onChange={(value) => setOutlierMode(value)}>
                <option value="remove">Remove Outlier Rows</option>
                <option value="cap">Cap to IQR Bounds</option>
              </CustomDropdown>
            </label>
          </div>

          <div className="prep-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => applyResult(removeOutliersIqr(workingDataset, workingProfile, {
                target: outlierTarget,
                mode: outlierMode,
              }))}
            >
              Apply Outlier Action
            </button>
          </div>
        </div>
      </div>

      <div className="prep-grid">
        {/* 3. Remove Duplicates */}
        <div className="card prep-card">
          <div className="prep-card-header">
            <div>
              <div className="prep-card-title">3. Remove Duplicates</div>
              <p className="prep-card-copy">Scan entire dataset and remove identical duplicate rows.</p>
            </div>
            <span className={`badge ${workingDuplicates > 0 ? 'badge-orange' : 'success'}`}>
              {workingDuplicates.toLocaleString()} duplicates found
            </span>
          </div>

          <p className="text-sm text-slate-400 my-2">
            Identifies exact duplicate rows across all columns and keeps only the first occurrence.
          </p>

          <div className="prep-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={workingDuplicates === 0}
              onClick={() => applyResult(removeDuplicateRows(workingDataset))}
            >
              {workingDuplicates > 0 ? `Remove ${workingDuplicates} Duplicate Rows` : 'No Duplicates Found'}
            </button>
          </div>
        </div>

        {/* 4. Data Type Fixing */}
        <div className="card prep-card">
          <div className="prep-card-header">
            <div>
              <div className="prep-card-title">4. Data Type Fixing</div>
              <p className="prep-card-copy">Convert columns to numeric, text, boolean, or date format.</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={handleAutoFixTypes}
            >
              ⚡ Auto-Fix All Types
            </button>
          </div>

          <div className="prep-form-grid">
            <label className="prep-field">
              <span>Select Column</span>
              <CustomDropdown value={dtypeTarget} onChange={(value) => setDtypeTarget(value)}>
                <option value="">-- Choose Column --</option>
                <option value="__all__">All Columns</option>
                {workingDataset.columns.map((c) => (
                  <option key={c} value={c}>{c} ({workingProfile.types[c] || 'text'})</option>
                ))}
              </CustomDropdown>
            </label>

            <label className="prep-field">
              <span>Convert To</span>
              <CustomDropdown value={dtypeType} onChange={(value) => setDtypeType(value)}>
                <option value="number">Numeric (Number)</option>
                <option value="string">Text (String)</option>
                <option value="boolean">Boolean (True / False)</option>
                <option value="date">Date (YYYY-MM-DD)</option>
              </CustomDropdown>
            </label>
          </div>

          <div className="prep-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFixDataType}
            >
              Convert Column Type
            </button>
          </div>
        </div>
      </div>

      {/* Cleaned Dataset Preview Table */}
      <div className="card prep-table-card">
        <div className="prep-card-header">
          <div>
            <div className="prep-card-title">Cleaned Dataset Preview</div>
            <p className="prep-card-copy">Live preview reflecting all applied preprocessing operations.</p>
          </div>
          <span className="badge">
            {workingDataset.rows.length.toLocaleString()} rows × {workingDataset.columns.length} columns
          </span>
        </div>
        <DataTable rows={workingDataset.rows} pageSize={10} sortable highlightNulls />
      </div>
    </div>
  )
}
