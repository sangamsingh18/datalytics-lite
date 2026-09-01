import { useEffect, useState } from 'react'
import { useToast } from '../../hooks/useToast.jsx'
import client from '../../services/apiClient.js'
import { saveIndustryPdf } from '../../utils/industryPdf.js'
import { syncInsightsDataset, generateRecommendationInsights } from '../prediction/predictionApi.js'


const STORAGE_KEY = 'datalytics_ai_report'
const COMPANY_NAME = 'DATALYTICS'

const AI_REPORT_PROMPT = `You are an AI Reporting Engine, an expert data scientist and business analyst.

Your task is to generate a COMPLETE, DEEP, END-TO-END REPORT based on the user's dataset and all pipeline steps performed.

The report must include EVERYTHING the user has done in the platform, written with real depth — not a surface-level summary. Each section below must be 4-8 full sentences of substantive analysis (not single bullet fragments), referencing actual numbers, column names, and statistics from the dataset context you're given. Where relevant data isn't available, say so explicitly rather than skipping the section.

========================
GOAL
====

Generate a PROFESSIONAL, IN-DEPTH REPORT that explains:
👉 What was done, in detail
👉 What was found, with specific evidence (numbers, feature names, distributions)
👉 What decisions should be taken, and why, with expected impact

========================
OUTPUT FORMAT (STRICT UI FORMAT)
================================

=== 📊 DATASET OVERVIEW ===
* Total rows, columns, data types
* Key variables and what they represent
* Overall data quality assessment

=== 🔍 DATA EXPLORATION (EDA) ===
* Key patterns discovered, referencing specific columns and their statistics
* Distribution insights (skew, spread, outliers) using the real feature stats provided
* Correlations and relationships between features
* Notable or surprising observations

=== 📐 STATISTICAL DEEP-DIVE ===
* Walk through the most important numeric features individually: their mean, spread, and range, and what that implies for the business
* Call out any features with unusual distributions or high variance
* Explain what the categorical feature breakdown suggests about the population

=== 🧹 DATA CLEANING SUMMARY ===
* Missing values handled (how?)
* Duplicate rows removed
* Outliers treated
* Columns removed (if any)

=== 🔧 DATA TRANSFORMATIONS ===
* Encoding applied
* Scaling applied
* Data type fixes

=== 📈 VISUAL INSIGHTS ===
* Important trends observed in charts
* Comparisons and patterns

=== 🤖 MODEL / PREDICTION (IF AVAILABLE) ===
* Model used and why it was selected as best
* Key results and metrics, with the actual metric values from the context
* What the feature importances (if provided) reveal about what drives predictions
* Accuracy / performance interpreted in plain business terms, not just numbers

=== 💡 RECOMMENDATIONS ===
* Key actionable suggestions generated, each tied to a specific finding above

=== 🚀 DECISION SUMMARY ===
* What should be done next (top decisions), ranked by priority and expected impact

=== ⚠️ RISKS & LIMITATIONS ===
* Data issues
* Limitations (small dataset, missing data, class imbalance, etc.)

=== 📈 FINAL BUSINESS / PERFORMANCE IMPACT ===
* Expected improvements, quantified where possible
* Benefits of actions taken

=== 🧠 CONCLUSION ===
* Final summary in 4-6 sentences tying the whole analysis together

========================
STRICT RULES
============
* Cover ALL pipeline steps
* Go deep: use specific numbers, column names, and statistics from the context — avoid generic filler sentences that could apply to any dataset
* No repetition across sections
* Make it structured and clean
* If any step not available → mention "Not performed" and explain briefly why

========================
TONE & LANGUAGE
================
* Write in a formal, executive business-report register — the tone of a McKinsey/BCG consulting deliverable or a corporate quarterly report, not a casual chatbot reply
* Use precise, confident, third-person analytical language ("The dataset exhibits...", "Analysis indicates...", "It is recommended that...") — avoid first-person ("I found", "I think"), avoid conversational filler ("Let's dive in", "Great news!", "As you can see"), and avoid exclamation marks
* Prefer industry-standard business/data-science terminology (e.g. "variance", "class imbalance", "predictive signal", "actionable insight") used correctly and in context — do not use jargon merely for effect
* Every claim should read as evidence-backed, not speculative — replace hedging phrases like "might", "could possibly" with direct, decisive statements grounded in the data provided
* No emojis inside the body text of a section (emojis are only used in the "=== SECTION ===" markers above, never inside the analysis paragraphs themselves)
* Vary sentence structure and length for a natural, polished reading experience — avoid repeating the same sentence opener across sections

========================
FINAL INSTRUCTION
=================
Act like you are writing an in-depth, board-ready report for stakeholders who will make real decisions based on it. Depth, specificity, and a polished professional tone matter more than brevity.
`

function readDecisionInsights() {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('datalytics_decision_making_json')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function normalizeReportPayload(response) {
  let content = response?.generated_response?.content || response?.content || response?.answer || response?.generated_response?.answer || ''
  if (!content) return { sections: [] }
  
  // Clean up potential markdown blocks if AI wrapped the whole thing
  content = content.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '')
  
  const sections = []
  const parts = content.split(/===\s*(.*?)\s*===/)
  
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim()
    let text = (parts[i+1] || '').replace(/={10,}/g, '').trim()
    
    // Clean up bold/italic markdown for cleaner UI display
    text = text.replace(/\*\*(.*?)\*\*/g, '$1')
    text = text.replace(/\*(.*?)\*/g, '$1')
    text = text.replace(/__(.*?)__/g, '$1')
    text = text.replace(/_(.*?)_/g, '$1')
    text = text.replace(/^#+\s+/gm, '') // Remove headers
    
    sections.push({ title, text })
  }
  
  if (sections.length === 0) {
    // If no section markers found, try to clean up the raw text
    let cleanRaw = content.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
    sections.push({ title: "Professional Report", text: cleanRaw })
  }
  
  return { sections, rawText: content }
}

export default function ReportStep({
  dataset,
  datasetProfile,
  predictionStatus,
  vizConfig,
  savedCharts,
  onComplete,
  onBeforeGenerate,
  onJumpToUpload,
}) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        setReportData(JSON.parse(raw))
      }
    } catch {}
  }, [])

  if (!dataset || !datasetProfile) {
    return (
      <div className="empty-state">
        <h2>Upload a dataset to generate reports</h2>
        <p>Reports include charts, insights, and model performance.</p>
        <button className="btn btn-primary" type="button" onClick={onJumpToUpload}>Go to Upload</button>
      </div>
    )
  }

  const handleGenerateAIReport = async () => {
    if (loading) return
    const charged = await onBeforeGenerate?.()
    if (charged === false) return

    setLoading(true)
    try {
      await syncInsightsDataset(dataset)

      // Collect Context
      const decisionData = readDecisionInsights()
      const missingPct = (((datasetProfile.missingTotal ?? 0) / Math.max(1, (datasetProfile.rowCount ?? 0) * (datasetProfile.columnCount ?? 0))) * 100).toFixed(1)

      const contextStr = `
DATASET CONTEXT:
Rows: ${datasetProfile.rowCount}, Columns: ${datasetProfile.columnCount}
Missing Data %: ${missingPct}
Numeric Cols: ${datasetProfile.numericColumns?.join(', ')}
Categorical Cols: ${datasetProfile.categoricalColumns?.join(', ')}

PREDICTION CONTEXT:
Task: ${predictionStatus?.preprocess_data?.task_type || 'None'}
Best Model: ${predictionStatus?.best_model_name || 'None'}

DECISION CONTEXT:
${decisionData ? 'Decisions applied and evaluated by AI.' : 'No decisions evaluated.'}
${decisionData?.top_decisions?.map(d => d.decision).join(', ')}

Please generate the report based on this exact context combined with the raw dataset distribution.
`
      const fullPrompt = AI_REPORT_PROMPT + "\n\n" + contextStr

      const res = await generateRecommendationInsights(fullPrompt, 'recommendation_insights')
      const parsed = normalizeReportPayload(res)
      
      if (parsed?.sections?.length > 0) {
        setReportData(parsed)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        addToast('AI Report generated successfully.', null, 'success')
        onComplete('reports')
        // Log to MongoDB (best-effort, never blocks the report flow)
        client.post('/user-activities/log', {
          action: 'Report',
          category: 'reports',
          details: dataset?.name || 'Pipeline Report',
          metadata: { sections: parsed.sections.length },
        }).catch(() => {})
      } else {
        throw new Error("Failed to parse report")
      }
    } catch (err) {
      console.error(err)
      addToast(err.message || 'Failed to generate AI Report', null, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!reportData) {
      addToast("Generate the report first!", null, "warning")
      return
    }
    
    setIsGeneratingPdf(true)
    try {
      generateFrontendPdf()
    } catch (error) {
      console.error('Frontend PDF generation failed:', error)
    } finally {
      setIsGeneratingPdf(false)
      onComplete('reports')
    }
  }
  
  function generateFrontendPdf() {
    saveIndustryPdf({
      title: 'End-to-End Analytics Report',
      subtitle: 'Complete stakeholder-ready report across upload, EDA, preparation, modeling, insights, and decisions.',
      datasetName: dataset?.name,
      filePrefix: `${COMPANY_NAME}_Analytics_Report`,
      metrics: [
        { label: 'Rows', value: (datasetProfile?.totalRowCount || datasetProfile?.rowCount || 0).toLocaleString() },
        { label: 'Columns', value: String(datasetProfile?.totalColumnCount || datasetProfile?.columnCount || 0) },
        { label: 'Missing Cells', value: String(datasetProfile?.missingTotal || 0) },
        { label: 'Sections', value: String(reportData.sections?.length || 0) },
        { label: 'Numeric Columns', value: String(datasetProfile?.numericColumns?.length || 0) },
        { label: 'Saved Charts', value: String(savedCharts?.length || 0) },
      ],
      sections: reportData.sections?.map((section) => ({
        title: section.title,
        body: section.text || 'Not performed.',
      })),
    })
  }

  return (
    <div className="report-container">
      <div className="report-header">
        <div>
          <h2 className="report-title">End-to-End Reporting</h2>
          <p className="report-subtitle">Generate a comprehensive AI report synthesizing all pipeline activities.</p>
        </div>
        <div className="report-download-group">
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={handleGenerateAIReport}
            disabled={loading}
          >
            {loading ? 'AI Generating...' : reportData ? 'Regenerate Report' : 'Generate AI Report'}
          </button>
          {reportData && (
            <>
              <button type="button" className="btn btn-primary" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? 'Building PDF...' : 'Download PDF'}
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-8 gap-3 text-slate-400" style={{ margin: '30px auto' }}>
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Synthesizing report...</span>
        </div>
      )}

      {reportData && !loading && (
        <div className="insight-grid" style={{ marginTop: '2rem' }}>
          {reportData.sections.map((sec, idx) => (
             <div key={`rep-${idx}`} className="insight-card intelligence-card">
               <div className="intelligence-card-head">
                 <span className="intelligence-chip is-info">{sec.title}</span>
               </div>
               <div className="insight-body" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', marginTop: '0.5rem' }}>
                 {sec.text}
               </div>
             </div>
          ))}
        </div>
      )}
      
      {!reportData && !loading && (
         <div className="insight-card" style={{ marginTop: '2rem', textAlign: 'center', padding: '3rem' }}>
           <p className="text-muted">Click "Generate AI Report" to synthesize your end-to-end dataset journey.</p>
         </div>
      )}
    </div>
  )
}
