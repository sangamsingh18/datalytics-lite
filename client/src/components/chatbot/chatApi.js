// Yeh chatApi.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
﻿import apiClient from '../../services/apiClient.js'

const VALID_MODES = new Set(['chat', 'ai_insights', 'recommendation_insights', 'decision_making'])
const AI_TIMEOUT_MS = 120_000
const CHAT_TIMEOUT_MS = 60_000

export function normalizeApiError(error) {
  if (!error) return 'An unknown error occurred.'
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || String(d)).join('; ')
  if (error?.code === 'ECONNABORTED' || error?.message?.toLowerCase().includes('timeout')) {
    return 'The AI is taking too long to respond. Please try a shorter query or retry.'
  }
  if (error?.code === 'ERR_NETWORK' || !error?.response) {
    return 'Cannot reach the server. Check your connection or ensure the backend is running.'
  }
  const status = error?.response?.status
  if (status === 429) return 'The AI service is rate-limited. Please wait a moment and retry.'
  if (status === 503 || status === 502) return 'The AI service is temporarily unavailable. Please retry.'
  if (status === 401 || status === 403) return 'Authentication error. Your session may have expired.'
  if (status >= 500) return 'A server error occurred. The team has been notified. Please retry.'
  return error?.message || 'An unexpected error occurred.'
}

export async function fetchChatHistory() {
  const response = await apiClient.get('/chat/history', { timeout: 15_000 })
  return response.data
}

export async function sendChatMessage(message, mode = null, options = {}) {
  const payload = { message: String(message).trim() }
  if (mode && VALID_MODES.has(mode)) {
    payload.mode = mode
  }
  if (Array.isArray(options.history) && options.history.length > 0) {
    payload.history = options.history.slice(-8).map((m) => ({ role: m.role, content: String(m.content || '') }))
  }
  const response = await apiClient.post('/chat', payload, { timeout: CHAT_TIMEOUT_MS, signal: options.signal })
  return response.data
}

export async function sendAIInsightsMessage(message, options = {}) {
  const payload = { message: String(message).trim() }
  if (Array.isArray(options.history) && options.history.length > 0) {
    payload.history = options.history.slice(-6).map((m) => ({ role: m.role, content: String(m.content || '') }))
  }
  const response = await apiClient.post('/chat/ai-insights', payload, { timeout: AI_TIMEOUT_MS, signal: options.signal })
  return response.data
}

export async function sendRecommendationsMessage(message, options = {}) {
  const response = await apiClient.post('/chat/recommendations', { message: String(message).trim() }, { timeout: AI_TIMEOUT_MS, signal: options.signal })
  return response.data
}

export async function clearChatHistory() {
  const response = await apiClient.delete('/chat/clear', { timeout: 10_000 })
  return response.data
}

export async function fetchChatModes() {
  const response = await apiClient.get('/chat/modes', { timeout: 10_000 })
  return response.data
}

export async function checkChatHealth() {
  try {
    const response = await apiClient.get('/chat/health', { timeout: 8_000 })
    return response.data
  } catch {
    return { status: 'error', configured: false, groq_configured: false }
  }
}
