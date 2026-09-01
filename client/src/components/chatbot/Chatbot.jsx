/**
 * ChatBot — Industry-level AI chatbot with 3 modes:
 *   1. chat                     → Dataset Q&A + general assistant
 *   2. ai_insights              → Deep AI pattern analysis & predictions
 *   3. recommendation_insights  → Executive business recommendations
 *
 * Powered by the configured backend AI provider.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IoLogoSnapchat } from 'react-icons/io5'
import {
  checkChatHealth,
  clearChatHistory,
  fetchChatHistory,
  normalizeApiError,
  sendAIInsightsMessage,
  sendChatMessage,
  sendRecommendationsMessage,
} from './chatApi.js'
import client from '../../services/apiClient.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'chat',
    label: 'Chat',
    icon: '💬',
    description: 'Dataset Q&A & General Assistant',
    placeholder: 'Ask about your data, trends, averages…',
    color: '#6366f1',
    welcomeTitle: 'Dataset Assistant',
    welcomeDesc: 'ask about averages, trends, filters, or specific records.',
  },
  {
    id: 'ai_insights',
    label: 'AI Insights',
    icon: '🧠',
    description: 'Deep AI Pattern Analysis & Predictions',
    placeholder: 'Ask for patterns, anomalies, predictions, correlations…',
    color: '#8b5cf6',
    welcomeTitle: 'AI Intelligence Engine',
    welcomeDesc: 'ask about averages, trends, filters, or specific records.',
  },
  {
    id: 'recommendation_insights',
    label: 'Recommendations',
    icon: '📊',
    description: 'Executive Business Recommendations',
    placeholder: 'Ask for business recommendations, strategy, growth opportunities…',
    color: '#0ea5e9',
    welcomeTitle: 'Business Intelligence Engine',
    welcomeDesc: 'ask about averages, trends, filters, or specific records.',
  },
]

const QUICK_PROMPTS = {
  chat: [
    'What are the key columns in this dataset?',
    'How many rows does the dataset have?',
  ],
  ai_insights: [
    'Find hidden patterns and anomalies in this data.',
    'Predict future trends based on this dataset.',
    'Identify the strongest correlations between variables.',
    'Detect any seasonality or cyclical patterns.',
  ],
  recommendation_insights: [
    'Give me executive business recommendations from this data.',
    'What strategic opportunities does this data reveal?',
    'Identify key business risks and mitigation strategies.',
    'Generate an executive summary with actionable steps.',
  ],
}

const IDENTIFIER_HINTS = ['id', 'uuid', 'guid', 'index', 'serial', 'code', 'employeeid', 'empid']
const RESPONSE_CACHE_VERSION = 'strict-2026-04-18'

// ─── Utility Functions ────────────────────────────────────────────────────────

function formatTime(value) {
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(value)
}

function buildMessage(role, content, extras = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date(),
    chart: extras.chart || null,
    insights: extras.insights || null,
    details: extras.details || null,
    mode: extras.mode || null,
    source: extras.source || null,
  }
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return String(value ?? '')
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '')
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function humanizeColumnName(column) {
  return String(column ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function columnAliases(column) {
  const original = String(column ?? '').trim().toLowerCase()
  const humanized = humanizeColumnName(column)
  const normalized = normalizeText(column)
  return Array.from(new Set([original, humanized, normalized].filter(Boolean)))
}

function isIdentifierColumn(column) {
  const normalized = normalizeText(column)
  return IDENTIFIER_HINTS.some((hint) => normalized.includes(hint))
}

function matchColumns(question, columns = []) {
  const lower = String(question || '').toLowerCase()
  const tokens = new Set(lower.match(/[a-z0-9]+/g) || [])
  return columns
    .map((column) => {
      const aliases = columnAliases(column)
      let score = 0
      aliases.forEach((alias) => {
        if (!alias) return
        if (alias.includes(' ')) {
          if (new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}([^a-z0-9]|$)`).test(lower)) score += 24
          return
        }
        if (alias === normalizeText(alias) && alias.length >= 5 && normalizeText(lower).includes(alias)) {
          score += 12
        } else if (new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}([^a-z0-9]|$)`).test(lower)) {
          score += 20
        }
      })
      const humanizedTokens = humanizeColumnName(column).split(' ').filter(Boolean)
      const overlap = humanizedTokens.filter((token) => tokens.has(token)).length
      score += overlap === humanizedTokens.length && overlap > 1 ? 18 : overlap * 6
      return { column, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.column)
}

function parseFilters(question, columns = [], types = {}) {
  const filters = []
  const text = String(question || '')
  for (const column of [...columns].sort((a, b) => b.length - a.length)) {
    for (const alias of columnAliases(column)) {
      const escaped = escapeRegex(alias)
      const boundary = alias === normalizeText(alias) ? escaped : `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`
      const patterns = [
        { regex: new RegExp(`${boundary}\\s*(>=|<=|!=|=|>|<)\\s*([^,;?]+)`, 'i') },
        { regex: new RegExp(`${boundary}\\s+is\\s+([^,;?]+)`, 'i'), operator: '=' },
        { regex: new RegExp(`${boundary}\\s+equals\\s+([^,;?]+)`, 'i'), operator: '=' },
        { regex: new RegExp(`${boundary}\\s+greater than\\s+([^,;?]+)`, 'i'), operator: '>' },
        { regex: new RegExp(`${boundary}\\s+less than\\s+([^,;?]+)`, 'i'), operator: '<' },
      ]
      for (const pattern of patterns) {
        const match = text.match(pattern.regex)
        if (!match) continue
        const operator = pattern.operator || match[match.length - 2]
        const rawValue = String(pattern.operator ? match[match.length - 1] : match[match.length - 1] || '').trim().replace(/^["']|["']$/g, '')
        if (!rawValue) continue
        filters.push({ column, operator, value: rawValue, type: types[column] || 'string' })
        break
      }
      if (filters.some((item) => item.column === column)) break
    }
  }
  return filters
}

function applyParsedFilters(rows = [], filters = []) {
  if (!filters.length) return rows
  return rows.filter((row) =>
    filters.every((filter) => {
      const raw = row?.[filter.column]
      if (filter.type === 'number') {
        const left = Number(raw), right = Number(filter.value)
        if (!Number.isFinite(left) || !Number.isFinite(right)) return false
        if (filter.operator === '>') return left > right
        if (filter.operator === '>=') return left >= right
        if (filter.operator === '<') return left < right
        if (filter.operator === '<=') return left <= right
        if (filter.operator === '!=') return left !== right
        return left === right
      }
      const left = String(raw ?? '').trim().toLowerCase()
      const right = String(filter.value ?? '').trim().toLowerCase()
      if (filter.operator === '!=') return left !== right
      return left === right
    })
  )
}

function extractLookupValues(question, columns = []) {
  const text = String(question || '')
  const values = []
  ;[/`([^`]+)`/g, /'([^']+)'/g, /"([^"]+)"/g].forEach((regex) => {
    for (const match of text.matchAll(regex)) {
      if (match[1]?.trim()) values.push(match[1].trim())
    }
  })
  columns.forEach((column) => {
    const escaped = escapeRegex(String(column))
    const regex = new RegExp(`${escaped}\\s*(?:=|is|:)?\\s*([A-Za-z0-9_.-]+)`, 'ig')
    for (const match of text.matchAll(regex)) {
      if (match[1]?.trim() && normalizeText(match[1]) !== normalizeText(column)) values.push(match[1].trim())
    }
  })
  const idMatches = text.match(/\b[A-Za-z]{1,12}[-_]\d+[A-Za-z0-9_.-]*\b|\b\d+(?:\.\d+)?\b/g) || []
  values.push(...idMatches)
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).slice(0, 6)
}

function findExactRows(rows = [], columns = [], question = '', matchedColumns = []) {
  const lookupValues = extractLookupValues(question, columns)
  if (!lookupValues.length) return null
  const candidateColumns = [
    ...matchedColumns,
    ...columns.filter(isIdentifierColumn),
    ...columns,
  ].filter((column, index, list) => column && list.indexOf(column) === index)

  for (const value of lookupValues) {
    const wanted = String(value).trim().toLowerCase()
    const wantedNumber = Number(String(value).replace(/,/g, ''))
    for (const column of candidateColumns) {
      const matches = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
          const raw = row?.[column]
          const left = String(raw ?? '').trim().toLowerCase()
          if (left === wanted) return true
          const numeric = Number(raw)
          return Number.isFinite(wantedNumber) && Number.isFinite(numeric) && numeric === wantedNumber
        })
      if (matches.length) return { column, value, matches }
    }
  }
  return null
}

function buildRowDetailAnswer(match, columns = []) {
  const shown = match.matches.slice(0, 5)
  const lines = [
    `Found ${match.matches.length.toLocaleString()} matching row${match.matches.length === 1 ? '' : 's'} where \`${match.column}\` = \`${match.value}\` in the loaded dataset.`,
    '',
  ]
  shown.forEach(({ row, index }, displayIndex) => {
    lines.push(`Match ${displayIndex + 1} (dataset row index ${index}):`)
    columns.forEach((column) => {
      const value = row?.[column]
      lines.push(`- \`${column}\`: ${value === null || value === undefined || value === '' ? 'N/A' : String(value)}`)
    })
    lines.push('')
  })
  if (match.matches.length > shown.length) {
    lines.push(`Showing first ${shown.length} matches; ${match.matches.length - shown.length} more matching rows exist.`)
  }
  return lines.join('\n').trim()
}

function resolveLocalDatasetQuery(question, dataset, datasetProfile) {
  if (!dataset || !datasetProfile || !Array.isArray(dataset.rows) || !dataset.rows.length) return null
  const rows = dataset.rows
  const columns = dataset.columns || Object.keys(rows[0] || {})
  const types = datasetProfile.types || {}
  const numericColumns = datasetProfile.numericColumns || []
  const numericStats = datasetProfile.numericStats || {}
  const lower = String(question || '').toLowerCase()
  const matchedColumns = matchColumns(lower, columns)
  const filters = parseFilters(lower, columns, types)
  const filteredRows = applyParsedFilters(rows, filters)
  const totalRows = filters.length ? filteredRows.length : (datasetProfile.totalRowCount || datasetProfile.rowCount || rows.length)
  const targetNumeric = matchedColumns.find((col) => numericColumns.includes(col)) || numericColumns[0]
  const totalColumns = datasetProfile.totalColumnCount || datasetProfile.columnCount || columns.length

  if (/(detail|details|show|find|lookup|row|record|transaction|product|customer|order|sku|id)/.test(lower)) {
    const exactMatch = findExactRows(rows, columns, question, matchedColumns)
    if (exactMatch) {
      return {
        answer: buildRowDetailAnswer(exactMatch, columns),
        chart: null,
      }
    }
  }

  if (/(how many columns|number of columns|total columns)/.test(lower)) {
    return {
      answer: `The dataset has ${totalColumns.toLocaleString()} columns.`,
      chart: null,
    }
  }

  if (/(key columns|which columns|what columns|column names|fields|headers|schema)/.test(lower)) {
    const preview = columns.slice(0, 12)
    const suffix = columns.length > preview.length ? `, and ${columns.length - preview.length} more` : ''
    return {
      answer: `This dataset has ${totalColumns.toLocaleString()} columns. The columns are: ${preview.join(', ')}${suffix}.`,
      chart: null,
    }
  }

  if (/(how many|count|number of|rows)/.test(lower) && !targetNumeric) {
    return {
      answer: `The dataset contains ${totalRows.toLocaleString()} rows${filters.length ? ' for the current filter' : ''}.`,
      chart: null,
    }
  }

  if (targetNumeric) {
    const nums = filteredRows.map((r) => Number(r?.[targetNumeric])).filter(Number.isFinite)
    if (nums.length) {
      const avg = nums.reduce((s, v) => s + v, 0) / nums.length
      const max = Math.max(...nums)
      const min = Math.min(...nums)
      if (/(average|mean|avg)/.test(lower)) return { answer: `The average ${targetNumeric} is ${formatMetric(avg)}.`, chart: null }
      if (/(highest|max|maximum|largest)/.test(lower)) return { answer: `The highest ${targetNumeric} value is ${formatMetric(max)}.`, chart: null }
      if (/(lowest|min|minimum|smallest)/.test(lower)) return { answer: `The lowest ${targetNumeric} value is ${formatMetric(min)}.`, chart: null }
    }
  }

  if (/(average values|average of numeric columns|mean of numeric columns|numeric columns)/.test(lower) && numericColumns.length) {
    const summary = numericColumns.slice(0, 5).map((column) => {
      const stat = numericStats[column]
      const values = filteredRows.map((r) => Number(r?.[column])).filter(Number.isFinite)
      const value = Number.isFinite(stat?.mean)
        ? stat.mean
        : (values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : NaN)
      return Number.isFinite(value) ? `${column}: ${formatMetric(value)}` : null
    }).filter(Boolean)
    if (!summary.length) return null
    return {
      answer: `Average values for numeric columns: ${summary.join(', ')}.`,
      chart: null,
    }
  }

  return null
}

function sanitizeAssistantContent(content) {
  const lines = String(content || '').split('\n')
  while (lines.length && /^\s*MODE\s*:\s*["']?.+["']?\s*$/i.test(lines[0].trim())) {
    lines.shift()
  }
  while (lines.length && !lines[0].trim()) {
    lines.shift()
  }
  return lines.join('\n').trim()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BotLogo({ size = 'message', className = '' }) {
  const classes = ['chatbot-bot-logo', `chatbot-bot-logo--${size}`, className].filter(Boolean).join(' ')
  return (
    <span className={classes} aria-hidden="true">
      <span className="chatbot-bot-logo-shell">
        <IoLogoSnapchat className="chatbot-bot-logo-ghost" />
      </span>
    </span>
  )
}

function ModeTab({ mode, active, onClick }) {
  return (
    <button
      type="button"
      className={`chatbot-mode-tab ${active ? 'active' : ''}`}
      onClick={() => onClick(mode.id)}
      title={mode.description}
      style={{ '--mode-color': mode.color }}
    >
      <span className="chatbot-mode-tab-icon">{mode.icon}</span>
      <span className="chatbot-mode-tab-label">{mode.label}</span>
      {active && <span className="chatbot-mode-tab-active-bar" />}
    </button>
  )
}

function MessageModeTag({ mode }) {
  const modeConfig = MODES.find((m) => m.id === mode)
  if (!modeConfig) return null
  return (
    <span
      className="chatbot-msg-mode-tag"
      style={{ '--mode-color': modeConfig.color }}
    >
      {modeConfig.icon} {modeConfig.label}
    </span>
  )
}

/** Markdown renderer — handles bold, italic, headers, bullets, numbered lists, code blocks */
function FormattedResponse({ content }) {
  if (!content) return null

  const inlineMarkdown = (str) => {
    return str
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="chatbot-md-inline-code">$1</code>')
  }

  const lines = String(content).split('\n')
  const elements = []
  let listItems = []
  let key = 0

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key++}`} className="chatbot-md-list">
          {listItems.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      )
      listItems = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Code block
    if (trimmed.startsWith('```')) {
      flushList()
      i++
      const codeLines = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={`pre-${key++}`} className="chatbot-md-pre"><code>{codeLines.join('\n')}</code></pre>
      )
      i++
      continue
    }

    // Headings
    const h1m = trimmed.match(/^# (.+)/)
    const h2m = trimmed.match(/^## (.+)/)
    const h3m = trimmed.match(/^### (.+)/)
    if (h1m || h2m || h3m) {
      flushList()
      const text = (h3m || h2m || h1m)[1]
      const cls = h3m ? 'chatbot-md-h3' : h2m ? 'chatbot-md-h2' : 'chatbot-md-h1'
      elements.push(<div key={`h-${key++}`} className={cls} dangerouslySetInnerHTML={{ __html: inlineMarkdown(text) }} />)
      i++
      continue
    }

    // Bullet list
    if (/^[-*•]\s/.test(trimmed)) {
      listItems.push(inlineMarkdown(trimmed.replace(/^[-*•]\s*/, '')))
      i++
      continue
    }

    // Numbered list item
    if (/^\d+\.\s/.test(trimmed)) {
      flushList()
      const text = trimmed.replace(/^\d+\.\s*/, '')
      elements.push(
        <div key={`num-${key++}`} className="chatbot-md-num-item" dangerouslySetInnerHTML={{ __html: inlineMarkdown(text) }} />
      )
      i++
      continue
    }

    // HR
    if (/^[-_*]{3,}$/.test(trimmed)) {
      flushList()
      elements.push(<hr key={`hr-${key++}`} className="chatbot-md-hr" />)
      i++
      continue
    }

    // Empty line
    if (!trimmed) {
      flushList()
      elements.push(<div key={`sp-${key++}`} style={{ height: '0.35em' }} />)
      i++
      continue
    }

    // Paragraph
    flushList()
    elements.push(
      <p key={`p-${key++}`} className="chatbot-md-p" dangerouslySetInnerHTML={{ __html: inlineMarkdown(trimmed) }} />
    )
    i++
  }

  flushList()
  return <div className="chatbot-msg-text">{elements}</div>
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatBot({ dataset, datasetProfile, profileAvatar, profileInitials }) {
  const [open, setOpen] = useState(false)
  const [activeMode, setActiveMode] = useState('chat')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [groqStatus, setGroqStatus] = useState(null) // null | 'ok' | 'error'
  const [llmMeta, setLlmMeta] = useState({ model: 'AI Model', provider: '' })
  const messagesRef = useRef(null)
  const historyLoadedRef = useRef(false)
  const inputRef = useRef(null)
  const responseCacheRef = useRef(new Map())
  const hasDataset = Boolean(dataset)

  // Check AI service health on mount
  useEffect(() => {
    checkChatHealth().then((health) => {
      const configured = Boolean(health?.configured ?? health?.groq_configured)
      setGroqStatus(configured ? 'ok' : 'error')
      setLlmMeta({
        model: health?.model || 'AI Model',
        provider: health?.provider || '',
      })
    }).catch(() => setGroqStatus('error'))
  }, [])

  const currentMode = useMemo(() => MODES.find((m) => m.id === activeMode) || MODES[0], [activeMode])

  // Initialize welcome message per mode
  const getWelcomMessage = useCallback((modeId) => {
    const mode = MODES.find((m) => m.id === modeId) || MODES[0]
    const datasetInfo = hasDataset
      ? `Analyze your dataset with AI — ${mode.welcomeDesc}`
      : mode.welcomeDesc
    return buildMessage('assistant', datasetInfo, { mode: modeId, source: 'system' })
  }, [hasDataset, dataset])

  // Reset messages when mode changes
  useEffect(() => {
    setMessages([getWelcomMessage(activeMode)])
    setStreamingText('')
    setInput('')
  }, [activeMode, getWelcomMessage])

  // Load history when chat opens (only for chat mode)
  useEffect(() => {
    if (!open || historyLoadedRef.current) return
    let ignore = false

    async function loadHistory() {
      setLoadingHistory(true)
      try {
        const response = await fetchChatHistory()
        if (ignore) return
        const history = Array.isArray(response?.messages) ? response.messages : []
        if (history.length > 0 && activeMode === 'chat') {
          setMessages(history.map((msg) => ({
            id: `${msg.role}-${Math.random().toString(36).slice(2, 8)}`,
            role: msg.role,
            content: msg.content,
            createdAt: new Date(),
            chart: null, insights: null, details: null,
            mode: 'chat', source: 'history',
          })))
        }
        historyLoadedRef.current = true
      } catch {
        historyLoadedRef.current = true
      } finally {
        if (!ignore) setLoadingHistory(false)
      }
    }

    loadHistory()
    return () => { ignore = true }
  }, [open, activeMode])

  // Auto-scroll to bottom
  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages, sending, streamingText])

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  /** Stream text for visual effect */
  function streamResponse(text) {
    const safeText = String(text || '')
    setStreamingText(safeText)
    return Promise.resolve()
  }

  function responseCacheKey(mode, question) {
    const datasetSignature = dataset
      ? `${dataset.name || 'dataset'}:${datasetProfile?.totalRowCount || datasetProfile?.rowCount || dataset?.rows?.length || 0}`
      : 'no-dataset'
    return `${RESPONSE_CACHE_VERSION}::${datasetSignature}::${mode}::${String(question || '').trim().toLowerCase()}`
  }

  function getCachedResponse(mode, question) {
    return responseCacheRef.current.get(responseCacheKey(mode, question)) || null
  }

  function setCachedResponse(mode, question, response) {
    const key = responseCacheKey(mode, question)
    responseCacheRef.current.set(key, response)
  }

  /** Select the correct API function based on mode, passing conversation history for context. */
  async function callModeAPI(message, mode, currentMessages) {
    const historyForApi = (currentMessages || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => m.source !== 'system')
      .slice(-10)
      .map((m) => ({ role: m.role, content: String(m.content || '') }))

    switch (mode) {
      case 'ai_insights':
        return sendAIInsightsMessage(message, { history: historyForApi })
      case 'recommendation_insights':
        return sendRecommendationsMessage(message)
      default:
        return sendChatMessage(message, 'chat', { history: historyForApi })
    }
  }

  async function handleSend(rawValue) {
    const value = String(rawValue ?? input).trim()
    if (!value || sending) return

    const userMsg = buildMessage('user', value, { mode: activeMode })
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)
    setStreamingText('')

    try {
      const localResponse = activeMode === 'chat'
        ? resolveLocalDatasetQuery(value, dataset, datasetProfile)
        : null
      const cachedResponse = localResponse ? null : getCachedResponse(activeMode, value)

      let currentMsgs
      setMessages((prev) => { currentMsgs = prev; return prev })

      const response = localResponse
        ? { ...localResponse, source: 'local_fast_path' }
        : (cachedResponse || await callModeAPI(value, activeMode, currentMsgs))

      const answer = sanitizeAssistantContent(
        response?.answer || response?.content || response?.reply || 'I could not generate a response for this request.'
      )
      const source = response?.source || 'ai'

      if (!localResponse && !cachedResponse && source !== 'error') {
        setCachedResponse(activeMode, value, response)
      }

      await streamResponse(answer)
      setStreamingText('')

      const assistantMsg = buildMessage('assistant', answer, {
        chart: response?.chart || null,
        insights: response?.insights || null,
        details: Array.isArray(response?.details) ? response.details : null,
        mode: activeMode,
        source,
      })
      setMessages((prev) => [...prev, assistantMsg])
      // Log chatbot query for heatmap tracking
      client.post('/user-activities/log', {
        action: 'Chat',
        category: 'queries',
        details: value.slice(0, 120),
        metadata: { mode: activeMode },
      }).catch(() => {})
    } catch (error) {
      setStreamingText('')
      const errText = normalizeApiError(error)
      const errMsg = buildMessage(
        'assistant',
        `⚠️ ${errText}`,
        { mode: activeMode, source: 'error' }
      )
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setSending(false)
    }
  }

  async function handleClear() {
    try { await clearChatHistory() } catch {}
    historyLoadedRef.current = false
    setMessages([getWelcomMessage(activeMode)])
    setInput('')
    setStreamingText('')
  }

  function handleModeSwitch(modeId) {
    if (modeId === activeMode) return
    setActiveMode(modeId)
    setStreamingText('')
    if (inputRef.current) inputRef.current.focus()
  }

  const datasetPills = useMemo(() => {
    if (!dataset) return []
    const rowCount = datasetProfile?.totalRowCount || datasetProfile?.rowCount || dataset?.rows?.length || 0
    const colCount = datasetProfile?.totalColumnCount || datasetProfile?.columnCount || dataset?.columns?.length || 0
    return [
      rowCount ? { label: 'Rows', value: rowCount.toLocaleString() } : null,
      colCount ? { label: 'Cols', value: colCount.toLocaleString() } : null,
    ].filter(Boolean)
  }, [dataset, datasetProfile])

  const quickPrompts = QUICK_PROMPTS[activeMode] || []

  return (
    <>
      {/* FAB Button */}
      <button
        type="button"
        id="chatbot-fab-btn"
        className={`chatbot-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close AI chatbot' : 'Open AI chatbot'}
        title="Eighteen AI Assistant"
      >
        <BotLogo size="fab" className="chatbot-fab-logo" />
        {!open && (
          <span className="chatbot-fab-badge" aria-hidden="true">
            AI
          </span>
        )}
      </button>

      {open && (
        <section className="chatbot-panel chatbot-panel--enhanced" aria-label="Eighteen AI Assistant">

          {/* Header */}
          <header className="chatbot-header">
            <div className="chatbot-header-left">
              <div className="chatbot-avatar">
                <BotLogo size="header" />
              </div>
              <div className="chatbot-header-copy">
                <div className="chatbot-title-row">
                  <div className="chatbot-title">Eighteen AI</div>
                  <span className="chatbot-model-badge">{llmMeta.model || 'AI Model'}</span>
                  {llmMeta.provider ? <span className="chatbot-model-badge">{llmMeta.provider}</span> : null}
                  {groqStatus === 'ok' && <span className="chatbot-model-badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', marginLeft: 4 }}>✓ Live</span>}
                  {groqStatus === 'error' && <span className="chatbot-model-badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', marginLeft: 4 }}>⚠ Offline</span>}
                </div>
                <div className="chatbot-status">
                  <span className={`chatbot-status-dot ${hasDataset ? 'online' : ''}`} />
                  <span className="chatbot-status-text">
                    {hasDataset
                      ? `${dataset.name}${datasetProfile?.totalRowCount ? ` • ${datasetProfile.totalRowCount.toLocaleString()} rows` : ''}`
                      : 'No dataset loaded'}
                  </span>
                </div>
              </div>
            </div>
            <div className="absolute top-[22px] right-[22px] flex items-center gap-[10px] z-50">
              <button
                type="button"
                onClick={handleClear}
                className="group flex items-center justify-center w-[14px] h-[14px] rounded-full bg-[#28c840] border border-[#1dad2b] hover:bg-green-400 transition duration-200 shadow-[0_0_10px_rgba(40,200,64,0.2)] hover:shadow-[0_0_12px_rgba(40,200,64,0.5)] hover:scale-110 overflow-hidden"
                title="Refresh Chat"
              >
                <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100 transition duration-150 relative top-[1px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="group flex items-center justify-center w-[14px] h-[14px] rounded-full bg-[#ff5f56] border border-[#e0443e] hover:bg-rose-400 transition duration-200 shadow-[0_0_10px_rgba(255,95,86,0.2)] hover:shadow-[0_0_12px_rgba(255,95,86,0.5)] hover:scale-110 overflow-hidden"
                title="Close"
              >
                <svg className="w-2.5 h-2.5 text-red-900 opacity-0 group-hover:opacity-100 transition duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          </header>

          {/* Mode Tabs */}
          <div className="chatbot-mode-tabs">
            {MODES.map((mode) => (
              <ModeTab
                key={mode.id}
                mode={mode}
                active={activeMode === mode.id}
                onClick={handleModeSwitch}
              />
            ))}
          </div>

          {/* Messages */}
          <div ref={messagesRef} className="chatbot-messages" role="log" aria-live="polite">
            {loadingHistory && (
              <div className="chatbot-typing">
                <div className="typing-dots"><span /><span /><span /></div>
                <div className="typing-text">Loading previous messages</div>
              </div>
            )}

            {messages.map((message) => {
              const isUser = message.role === 'user'
              const isSystemWelcome = message.source === 'system'
              return (
                <div
                  key={message.id}
                  className={`chatbot-msg ${isUser ? 'chatbot-msg--user' : ''} ${isSystemWelcome ? 'chatbot-msg--welcome' : ''}`}
                >
                  <div className={`chatbot-msg-avatar ${isUser ? 'chatbot-msg-avatar--user' : 'chatbot-msg-avatar--assistant'}`} style={isUser && profileAvatar ? { padding: 0, overflow: 'hidden' } : {}}>
                    {isUser ? (
                      profileAvatar ? (
                        <img src={profileAvatar} alt="You" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        profileInitials || 'You'
                      )
                    ) : (
                      <BotLogo size="message" />
                    )}
                  </div>
                  <div className="chatbot-msg-content">
                    <div className="chatbot-msg-meta">
                      <span className="chatbot-msg-author">{isUser ? 'You' : 'Eighteen AI'}</span>
                      {message.mode && !isUser && <MessageModeTag mode={message.mode} />}
                      <span className="chatbot-msg-time">{formatTime(message.createdAt)}</span>
                    </div>
                    <div className="chatbot-msg-surface">
                      <div className="chatbot-msg-bubble">
                        <FormattedResponse content={message.content} />
                      </div>
                      {message.details?.length ? (
                        <div className="chatbot-details-card">
                          <div className="chatbot-details-title">Record details</div>
                          <div className="chatbot-details-grid">
                            {message.details.map((detail) => (
                              <div key={detail.column} className="chatbot-detail-row">
                                <span className="chatbot-detail-label">{detail.column}</span>
                                <strong className="chatbot-detail-value">{String(detail.value)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Streaming message */}
            {sending && streamingText && (
              <div className="chatbot-msg">
                <div className="chatbot-msg-avatar chatbot-msg-avatar--assistant">
                  <BotLogo size="message" />
                </div>
                <div className="chatbot-msg-content">
                  <div className="chatbot-msg-meta">
                    <span className="chatbot-msg-author">Eighteen AI</span>
                    <MessageModeTag mode={activeMode} />
                  </div>
                  <div className="chatbot-msg-surface">
                    <div className="chatbot-msg-bubble chatbot-msg-bubble--streaming">
                      <FormattedResponse content={streamingText} />
                      <span className="chatbot-stream-cursor" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Thinking dots (no text yet) */}
            {sending && !streamingText && (
              <div className="chatbot-typing">
                <div className="typing-dots"><span /><span /><span /></div>
                <div className="typing-text">
                  {activeMode === 'ai_insights' && 'Analyzing patterns with AI…'}
                  {activeMode === 'recommendation_insights' && 'Generating business recommendations…'}
                  {activeMode === 'chat' && (hasDataset ? 'Analyzing your dataset…' : 'Thinking…')}
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          {messages.length <= 1 && !sending && (
            <div className="chatbot-quick-prompts">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="chatbot-quick-prompt-btn"
                  onClick={() => handleSend(prompt)}
                  style={{ '--mode-color': currentMode.color }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="chatbot-input-row">
            <div className="chatbot-input-meta">
              <span style={{ color: currentMode.color }}>
                {currentMode.icon} {currentMode.label} Mode
              </span>
              <span>Enter to send • Shift+Enter for new line</span>
            </div>
            <div className="chatbot-input-wrapper">
              <textarea
                ref={inputRef}
                id="chatbot-input"
                className="chatbot-input"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={currentMode.placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={sending}
                aria-label="Chat message input"
              />
              <div className="chatbot-input-actions" style={{ transform: 'translateY(-12px)' }}>
                <button
                  id="chatbot-send-btn"
                  type="button"
                  className={`chatbot-send-btn ${!input.trim() || sending ? 'disabled' : ''}`}
                  disabled={!input.trim() || sending}
                  onClick={() => handleSend()}
                  style={{ '--mode-color': currentMode.color }}
                  aria-label="Send message"
                >
                  {sending ? '…' : '▶'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
