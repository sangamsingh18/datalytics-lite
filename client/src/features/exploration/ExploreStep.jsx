import { useEffect, useState } from 'react'
import jsPDF from 'jspdf'
import { downloadEdaCsv, fetchEdaReportHtml, runEdaAction, syncDatasetToBackend } from './explorationApi.js'
import { useToast } from '../../hooks/useToast.jsx'
import { downloadBlob, SECTION_ITEMS } from './edaHelpers.js'
import {
  EdaInfoSection,
  EdaPreviewSection,
  EdaStatsSection,
  EdaMissingSection,
} from './EdaSections.jsx'

export default function ExploreStep({ dataset, datasetProfile, explorationReady, onComplete, onDatasetUpdate, onJumpToUpload }) {
  const { addToast } = useToast()
  const [activeSection, setActiveSection] = useState('preview')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [previewMode, setPreviewMode] = useState('head')

  useEffect(() => {
    if (!dataset) return

    let isMounted = true
    setLoading(true)
    setError(null)

    async function loadEda() {
      try {
        const res = await syncDatasetToBackend(dataset)
        if (!isMounted) return
        // syncDatasetToBackend may return { dataset, summary } (for backend-ready datasets)
        // or the summary object directly (after /eda/sync)
        const summaryData = res?.summary || res
        setSummary(summaryData)
        if (typeof onComplete === 'function') {
          onComplete('exploration')
        }
      } catch (err) {
        if (!isMounted) return
        setError(err?.response?.data?.detail || err?.message || 'Failed to generate EDA summary.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadEda()

    return () => {
      isMounted = false
    }
  }, [dataset])

  function handleDownloadPdf() {
    if (!summary) return
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 14
    const lineHeight = 6
    let y = margin

    function addLine(text, size = 9, bold = false, color = [220, 220, 220]) {
      doc.setFontSize(size)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(...color)
      const lines = doc.splitTextToSize(text, pageW - margin * 2)
      lines.forEach((line) => {
        if (y + lineHeight > pageH - 10) {
          doc.addPage()
          doc.setFillColor(10, 14, 26)
          doc.rect(0, 0, pageW, pageH, 'F')
          y = margin
        }
        doc.text(line, margin, y)
        y += lineHeight
      })
    }

    doc.setFillColor(10, 14, 26)
    doc.rect(0, 0, pageW, pageH, 'F')

    // Header banner
    doc.setFillColor(99, 102, 241)
    doc.rect(0, 0, pageW, 20, 'F')
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('DATALYTICS AI — DATA EXPLORATION REPORT', margin, 13)
    y = 28

    const shape = summary?.overview?.shape || {}
    const quality = summary?.quality || {}
    const columns = summary?.overview?.columns || []
    const numStats = summary?.statistics?.numeric || []

    addLine('DATASET OVERVIEW', 11, true, [129, 140, 248])
    addLine(`Total Rows: ${shape.rows ?? 0} | Total Columns: ${shape.columns ?? 0}`)
    addLine(`Numeric Features: ${shape.numeric_columns ?? 0} | Categorical Features: ${shape.categorical_columns ?? 0}`)
    addLine(`Missing Values: ${quality.missing_total ?? 0} | Duplicate Rows: ${quality.duplicate_rows ?? 0}`)
    addLine('')

    addLine('DATASET SCHEMA', 11, true, [129, 140, 248])
    columns.forEach((c) => {
      addLine(`- ${c.column} (${c.dtype}): non-null=${c.non_null}, missing=${c.missing}, unique=${c.unique}`)
    })
    addLine('')

    addLine('STATISTICAL SUMMARY', 11, true, [129, 140, 248])
    numStats.forEach((s) => {
      addLine(`- [${s.column}] mean=${s.mean?.toFixed(2) ?? 'N/A'}, std=${s.std?.toFixed(2) ?? 'N/A'}, min=${s.min ?? 'N/A'}, max=${s.max ?? 'N/A'}, median=${s.median?.toFixed(2) ?? 'N/A'}`)
    })

    doc.save('datalytics-data-exploration.pdf')
    addToast('Exploration report downloaded as PDF.', null, 'success')
  }

  function renderSection() {
    switch (activeSection) {
      case 'info':
        return <EdaInfoSection summary={summary} />
      case 'missing':
        return <EdaMissingSection summary={summary} />
      case 'stats':
        return <EdaStatsSection summary={summary} />
      case 'preview':
      default:
        return <EdaPreviewSection summary={summary} previewMode={previewMode} setPreviewMode={setPreviewMode} />
    }
  }

  if (!dataset) {
    return (
      <div className="empty-state">
        <h2>Upload a dataset to start exploration</h2>
        <p>Explore your dataset with instant schema inspection, statistical summaries, missing value profiles, and data preview.</p>
        <button className="btn btn-primary" type="button" onClick={onJumpToUpload}>Go to Upload</button>
      </div>
    )
  }

  return (
    <div className="eda-workspace is-dark">
      <div className="eda-shell">
        <aside className="eda-sidebar">
          <div className="eda-sidebar-head">
            <span className="eda-kicker">Data Profiling</span>
            <h2>Data Exploration</h2>
            <p>{explorationReady ? 'Dataset loaded and profiled.' : 'Analyzing dataset schema.'}</p>
          </div>

          <nav className="eda-sidebar-nav">
            {SECTION_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`eda-sidebar-link${activeSection === item.key ? ' is-active' : ''}`}
                onClick={() => setActiveSection(item.key)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="eda-main">
          <div className="eda-toolbar">
            <div>
              <h1 className="eda-title">Data Exploration</h1>
              <p className="eda-subtitle">Inspect dataset dimensions, types, missing values, statistics, and preview raw rows.</p>
            </div>
            <div className="eda-toolbar-actions">
              <button type="button" className="btn btn-primary" onClick={handleDownloadPdf} disabled={!summary}>
                Export PDF
              </button>
            </div>
          </div>

          {loading && <div className="eda-loading-panel">Profiling dataset schema and statistics...</div>}
          {error && <div className="eda-inline-error">{error}</div>}
          {!loading && !error && summary && renderSection()}
        </div>
      </div>
    </div>
  )
}
