// Yeh predictionApi.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
﻿// Prediction API
import apiClient from '../../services/apiClient.js'
import { isBackendDatasetReady, buildDatasetSyncPayload } from '../dataset/datasetApi.js'

const INSIGHT_GENERATION_TIMEOUT_MS = 300_000

export async function preprocessData(payload) {
  const res = await apiClient.post('/preprocess', payload)
  return res.data
}

export async function trainModels(payload) {
  const res = await apiClient.post('/train', payload)
  return res.data
}

export async function getBestModel() {
  const res = await apiClient.get('/best-model-summary')
  return res.data
}

export async function runPrediction(payload) {
  const res = await apiClient.post('/predict', payload)
  return res.data
}

export async function downloadResults() {
  const res = await apiClient.get('/download-results', { responseType: 'blob' })
  return res
}

export async function syncInsightsDataset(dataset, options = {}) {
  if (!dataset || !dataset.rows?.length) {
    return { synced: false, reason: 'no_dataset' }
  }

  if (isBackendDatasetReady(dataset)) {
    return { synced: true, source: 'backend_session', skipped: true }
  }

  const payload = buildDatasetSyncPayload(dataset, { replaceOriginal: true })

  try {
    const response = await apiClient.post('/data/sync', payload, { timeout: 30_000, signal: options.signal })
    return { synced: true, source: 'data/sync', payload: response.data }
  } catch (error) {
    if (error?.code === 'ERR_CANCELED' || options.signal?.aborted) {
      throw error
    }
    if (error?.response?.status !== 404) {
      console.warn('[syncInsightsDataset] /data/sync failed:', error?.message)
    }
  }

  try {
    const fallback = await apiClient.post('/visualization/sync', payload, { timeout: 30_000, signal: options.signal })
    return { synced: true, source: 'visualization/sync', payload: fallback.data }
  } catch (fallbackError) {
    if (fallbackError?.code === 'ERR_CANCELED' || options.signal?.aborted) {
      throw fallbackError
    }
    console.warn('[syncInsightsDataset] fallback sync also failed:', fallbackError?.message)
    return { synced: false, reason: 'sync_failed' }
  }
}

export async function generateRecommendationInsights(prompt, mode = 'recommendation_insights', options = {}) {
  const response = await apiClient.post(
    '/chat/recommendations',
    { message: prompt, mode, source: 'page' },
    { timeout: INSIGHT_GENERATION_TIMEOUT_MS, signal: options.signal },
  )
  return response.data
}
