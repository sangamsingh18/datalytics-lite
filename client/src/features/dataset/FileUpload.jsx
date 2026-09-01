import { useEffect, useRef, useState } from 'react'
import { uploadDataset } from './datasetApi.js'
import { computeMissingByColumn, inferColumnTypes } from '../../utils/dataset.js'
import DatasetPreviewTable from './DatasetPreview.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import CustomDropdown from '../../components/common/CustomDropdown.jsx'
import { SAMPLE_DATASETS } from './sampleDatasets.js'

const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

function normalizeDataset(payload, fallbackRows = [], fallbackColumns = []) {
  const rows = fallbackRows?.length
    ? fallbackRows
    : (payload?.sample_rows || payload?.rows || payload?.preview || [])
  const columns = fallbackColumns?.length
    ? fallbackColumns
    : (payload?.all_columns || payload?.columns || (rows[0] ? Object.keys(rows[0]) : []))

  return {
    name: payload?.name || 'Dataset',
    rows,
    columns,
    meta: {
      ...payload,
      rows: typeof payload?.rows === 'number' ? payload.rows : rows.length,
      cols: typeof payload?.cols === 'number' ? payload.cols : columns.length,
      all_columns: payload?.all_columns || columns,
      backend_managed: Boolean(payload?.backend_managed),
      needs_backend_sync: false,
      storage_mode: payload?.storage_mode || (payload?.backend_managed ? 'memory' : 'local'),
    },
  }
}

function profileDatasetRows(rows, columns) {
  const sample = rows.slice(0, 1000)
  return {
    types: inferColumnTypes(sample, columns),
    nullCounts: computeMissingByColumn(sample, columns),
  }
}

export default function UploadStep({ dataset, onDatasetChange, onComplete, onBeforeUpload, onReset }) {
  const { addToast } = useToast()
  const [previewMode, setPreviewMode] = useState('head')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [previewMeta, setPreviewMeta] = useState({ types: {}, nullCounts: {} })
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileRef = useRef(null)
  const workerRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return undefined
    }

    try {
      workerRef.current = new Worker(new URL('./datasetProfile.worker.js', import.meta.url), { type: 'module' })
      workerRef.current.onmessage = (event) => {
        setPreviewMeta({
          types: event.data?.types || {},
          nullCounts: event.data?.nullCounts || {},
        })
      }
    } catch {
      workerRef.current = null
    }

    return () => {
      workerRef.current?.terminate?.()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!dataset?.rows?.length) return
    const rows = dataset.rows || []
    const columns = dataset.columns || Object.keys(rows[0] || {})

    if (workerRef.current) {
      workerRef.current.postMessage({ rows: rows.slice(0, 1000), columns })
      return
    }

    setPreviewMeta(profileDatasetRows(rows, columns))
  }, [dataset])

  async function handleFile(file) {
    if (!file) return
    const name = file.name || 'Dataset'
    const extension = name.split('.').pop().toLowerCase()

    try {
      if (file.size > MAX_SIZE) {
        throw new Error('File exceeds 2GB limit.')
      }

      if (!['csv', 'xlsx', 'xls'].includes(extension)) {
        throw new Error('Please upload a CSV or Excel (.xlsx/.xls) file.')
      }

      setLoading(true)
      setError(null)
      setUploadProgress(0)

      const response = await uploadDataset(file, {
        onProgress: (value) => {
          setUploadProgress(value)
        },
      })

      const nextDataset = normalizeDataset({ ...response, name })
      const previewRows = nextDataset.rows || []
      const previewColumns = nextDataset.columns || []
      const charged = await onBeforeUpload?.()
      if (charged === false) return

      if (workerRef.current) {
        workerRef.current.postMessage({ rows: previewRows.slice(0, 1000), columns: previewColumns })
      } else {
        setPreviewMeta(profileDatasetRows(previewRows, previewColumns))
      }

      onDatasetChange(nextDataset)
      onComplete('upload')
      addToast('Dataset uploaded and processed successfully.', null, 'success')
    } catch (err) {
      const message = err.response?.data?.detail || err.message || 'Something went wrong while uploading.'
      setError(message)
      addToast(message, null, 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleLoadSample(sample) {
    try {
      setLoading(true)
      const data = sample.generate()
      const nextDataset = normalizeDataset(data, data.rows, data.columns)
      setPreviewMeta(profileDatasetRows(data.rows, data.columns))
      onDatasetChange(nextDataset)
      onComplete('upload')
      addToast(`Loaded ${sample.label} dataset with ${data.rows.length} rows!`, null, 'success')
    } catch (e) {
      addToast('Failed to load sample dataset.', null, 'error')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(event) {
    event.preventDefault()
    setDragging(false)
    const files = event.dataTransfer?.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }

  const numColumnsCount = Object.values(previewMeta.types || {}).filter((t) => t === 'number').length
  const catColumnsCount = Object.values(previewMeta.types || {}).filter((t) => t === 'string' || t === 'boolean' || t === 'categorical').length
  const totalRows = dataset?.meta?.rows || dataset?.rows?.length || 0
  const totalCols = dataset?.meta?.cols || dataset?.columns?.length || 0

  const duplicateRows = (() => {
    if (!dataset?.rows) return 0
    const seen = new Set()
    let duplicates = 0
    dataset.rows.forEach((row) => {
      const key = JSON.stringify(row)
      if (seen.has(key)) duplicates++
      else seen.add(key)
    })
    return duplicates
  })()
  const duplicatePct = totalRows > 0 ? ((duplicateRows / (dataset?.rows?.length || totalRows)) * 100).toFixed(2) : '0.00'

  const backendColsInfo = dataset?.meta?.columns_info || []
  const missingData = (dataset?.columns || []).map((col) => {
    const backendInfo = backendColsInfo.find((info) => info.column === col)
    const count = backendInfo ? backendInfo.null : (previewMeta.nullCounts[col] || 0)
    const pct = backendInfo ? backendInfo.null_pct : (totalRows > 0 ? ((count / (dataset?.rows?.length || 1)) * 100).toFixed(2) : '0.00')
    return { col, count, pct: Number(pct).toFixed(2) }
  })

  const totalMissingCount = missingData.reduce((sum, item) => sum + item.count, 0)
  const totalCells = totalRows * totalCols
  const totalMissingPct = totalCells > 0 ? ((totalMissingCount / totalCells) * 100).toFixed(2) : '0.00'
  const completenessPct = totalCells > 0 ? (100 - parseFloat(totalMissingPct)).toFixed(1) : 100

  return (
    <div style={{ padding: '0 0 32px 0', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Header */}
      <div className="step-header" style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1', display: 'inline-block', boxShadow: '0 0 8px #6366f1' }}></span>
            Step 1 • Dataset Acquisition
          </div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: '800', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            Dataset Ingestion & Profiling
          </h1>
          <p className="page-subtitle" style={{ color: 'rgba(240, 244, 255, 0.65)', fontSize: '0.925rem', margin: 0 }}>
            Upload your CSV or Excel workbook or try an instant pre-built sample to unlock the analytics suite.
          </p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '10px' }}>
          {dataset && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReset}
              style={{ borderRadius: '12px', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
              Reset Dataset
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            style={{
              borderRadius: '12px',
              padding: '10px 22px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '600'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            {loading ? 'Processing...' : 'Upload File'}
          </button>
        </div>
      </div>

      {/* Main Grid: Upload Dropzone & Live Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Left Column: Dropzone & Sample Datasets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Glass Upload Card */}
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.75) 0%, rgba(10, 15, 29, 0.9) 100%)',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.09)',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              padding: '1.75rem',
              backdropFilter: 'blur(16px)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#f1f5f9', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8' }}></span>
                File Dropzone
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: '500' }}>
                Supports CSV, XLSX, XLS
              </span>
            </div>

            {/* Interactive Drop Area */}
            <div
              onDrop={onDrop}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileRef.current?.click()}
              style={{
                position: 'relative',
                background: dragging
                  ? 'linear-gradient(145deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))'
                  : 'linear-gradient(145deg, rgba(15,23,42,0.65), rgba(8,13,24,0.85))',
                border: dragging
                  ? '2px dashed #818cf8'
                  : '1.5px dashed rgba(99, 102, 241, 0.3)',
                borderRadius: '20px',
                padding: '2.5rem 1.5rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                boxShadow: dragging ? '0 0 35px rgba(99,102,241,0.25)' : 'none',
              }}
            >
              {/* Glowing Icon */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.15))',
                  color: '#a5b4fc',
                  width: '68px',
                  height: '68px',
                  borderRadius: '20px',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(165,180,252,0.3)',
                  boxShadow: '0 8px 24px rgba(99,102,241,0.25)',
                  transform: dragging ? 'scale(1.08)' : 'scale(1)',
                  transition: 'transform 0.25s ease',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>

              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 0.35rem 0', color: '#fff', textAlign: 'center', letterSpacing: '-0.01em' }}>
                {dragging ? 'Release file to begin ingestion' : 'Drop CSV or XLSX file here'}
              </h2>
              <p style={{ color: 'rgba(240,244,255,0.6)', margin: '0 0 1.25rem 0', textAlign: 'center', fontSize: '13px', lineHeight: 1.5, maxWidth: '340px' }}>
                Drag and drop your spreadsheet, or click anywhere inside to browse local files.
              </p>

              {/* Format Badges */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>
                  📄 .CSV Format
                </span>
                <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' }}>
                  📊 Excel .XLSX / .XLS
                </span>
                <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#d8b4fe' }}>
                  ⚡ Up to 2 GB
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={(e) => {
                  e.stopPropagation()
                  fileRef.current?.click()
                }}
                style={{
                  borderRadius: '12px',
                  padding: '9px 24px',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                  boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                }}
              >
                {loading ? 'Uploading...' : 'Browse Local Files'}
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => {
                  const files = event.target.files
                  if (files && files.length > 0) handleFile(files[0])
                }}
                style={{ display: 'none' }}
              />
            </div>

            {loading && (
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(99,102,241,0.08)', borderRadius: '14px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#c7d2fe' }}>
                  <span>Ingestion & Profiling Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #a855f7)', transition: 'width 0.2s ease' }} />
                </div>
              </div>
            )}

            {error && (
              <div className="alert alert-warning" style={{ marginTop: '1rem', whiteSpace: 'pre-line', borderRadius: '14px' }}>
                {error}
              </div>
            )}
          </div>

          {/* Quick Sample Dataset Cards */}
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.6) 0%, rgba(10, 15, 29, 0.8) 100%)',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              padding: '1.25rem 1.5rem',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'rgba(240,244,255,0.85)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                ✨ Instant Demo Datasets
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Click any sample to load immediately</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' }}>
              {SAMPLE_DATASETS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleLoadSample(sample)}
                  disabled={loading}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '14px',
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(99,102,241,0.12)'
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '1.2rem' }}>{sample.icon}</span>
                    <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                      {sample.badge}
                    </span>
                  </div>
                  <strong style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: '600', marginTop: '2px' }}>
                    {sample.label}
                  </strong>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Dataset Metrics & Schema Summary */}
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.75) 0%, rgba(10, 15, 29, 0.9) 100%)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
            padding: '1.75rem',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#f1f5f9', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                Dataset Profile
              </span>
              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '8px', background: totalRows > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', color: totalRows > 0 ? '#34d399' : 'rgba(255,255,255,0.4)', fontWeight: '600' }}>
                {totalRows > 0 ? 'Active in Memory' : 'No Data Loaded'}
              </span>
            </div>

            {/* Main Stat Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '1.25rem' }}>
              
              <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '14px 16px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(240,244,255,0.5)', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                  Total Rows
                </span>
                <strong style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  {totalRows > 0 ? totalRows.toLocaleString() : '--'}
                </strong>
                <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                  Records loaded
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '14px 16px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(240,244,255,0.5)', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                  Features / Columns
                </span>
                <strong style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  {totalCols > 0 ? totalCols : '--'}
                </strong>
                <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                  Total dimensions
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '14px 16px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(240,244,255,0.5)', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                  Numeric Features
                </span>
                <strong style={{ fontSize: '1.35rem', fontWeight: '800', color: '#818cf8' }}>
                  {totalCols > 0 ? numColumnsCount : '--'}
                </strong>
                <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                  Continuous / Integer
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '14px 16px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(240,244,255,0.5)', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                  Categorical Features
                </span>
                <strong style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f472b6' }}>
                  {totalCols > 0 ? catColumnsCount : '--'}
                </strong>
                <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                  Strings / Classes
                </span>
              </div>

            </div>

            {/* Quality Breakdown */}
            <div style={{ background: 'rgba(15,23,42,0.5)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0' }}>Data Health & Integrity</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#38bdf8' }}>{completenessPct}% Complete</span>
              </div>

              <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ width: `${completenessPct}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #06b6d4)' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'rgba(240,244,255,0.55)' }}>Missing Cells</span>
                <strong style={{ color: totalMissingCount > 0 ? '#f59e0b' : '#34d399' }}>
                  {totalMissingCount.toLocaleString()} ({totalMissingPct}%)
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingTop: '6px' }}>
                <span style={{ color: 'rgba(240,244,255,0.55)' }}>Duplicate Rows</span>
                <strong style={{ color: duplicateRows > 0 ? '#f59e0b' : '#34d399' }}>
                  {duplicateRows.toLocaleString()} ({duplicatePct}%)
                </strong>
              </div>
            </div>
          </div>

          {/* Dataset Name Bar */}
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', flexShrink: 0 }}>
                📊
              </div>
              <div style={{ overflow: 'hidden' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active File</span>
                <strong style={{ fontSize: '13px', color: '#f1f5f9', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {dataset?.name || 'Waiting for dataset...'}
                </strong>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Dataset Preview Table */}
      {dataset && (
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.75) 0%, rgba(10, 15, 29, 0.9) 100%)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4)',
            padding: '1.75rem',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>
                Dataset Preview
              </h3>
              <p style={{ fontSize: '12px', color: 'rgba(240,244,255,0.55)', margin: 0 }}>
                Showing sample rows from the synchronized working dataset.
              </p>
            </div>
            <CustomDropdown
              value={previewMode}
              onChange={(val) => setPreviewMode(val)}
              style={{ width: '170px' }}
            >
              <option value="head">Head (Top 20)</option>
              <option value="tail">Tail (Bottom 20)</option>
            </CustomDropdown>
          </div>
          <DatasetPreviewTable
            rows={previewMode === 'head' ? dataset.rows.slice(0, 20) : dataset.rows.slice(-20)}
            columns={dataset.columns}
            types={previewMeta.types}
            nullCounts={previewMeta.nullCounts}
          />
        </div>
      )}
    </div>
  )
}
