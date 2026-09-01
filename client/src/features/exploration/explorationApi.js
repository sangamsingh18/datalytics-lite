// Yeh explorationApi.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
﻿import apiClient from '../../services/apiClient.js'
import { isBackendDatasetReady, buildDatasetSyncPayload } from '../dataset/datasetApi.js'

export async function fetchEdaSummary() {
  const response = await apiClient.get('/eda/summary')
  return response.data
}

export async function syncDatasetToBackend(dataset, options = {}) {
  if (isBackendDatasetReady(dataset) && !options.forceSync) {
    try {
      const summary = await fetchEdaSummary()
      return { dataset, summary }
    } catch (error) {
      if (error?.response?.status !== 404) throw error
    }
  }

  const response = await apiClient.post('/eda/sync', buildDatasetSyncPayload(dataset, options))
  return response.data
}

export async function runEdaAction(action, options = {}) {
  const response = await apiClient.post('/eda/action', { action, options })
  return response.data
}

export async function createEdaChart(payload) {
  const response = await apiClient.post('/eda/chart', payload)
  return response.data
}

export async function fetchEdaReportJson() {
  const response = await apiClient.get('/eda/report/json')
  return response.data
}

export async function fetchEdaReportHtml() {
  const response = await apiClient.get('/eda/report/html', { responseType: 'text' })
  return response.data
}

export async function downloadEdaCsv() {
  const response = await apiClient.get('/eda/download-csv', { responseType: 'blob' })
  return response
}
