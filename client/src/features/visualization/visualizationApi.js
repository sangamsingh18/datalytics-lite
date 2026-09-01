// Yeh visualizationApi.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
﻿import apiClient from '../../services/apiClient.js'
import { isBackendDatasetReady, buildDatasetSyncPayload } from '../dataset/datasetApi.js'

export async function syncVisualizationDataset(dataset, options = {}) {
  if (isBackendDatasetReady(dataset) && !options.forceSync) {
    try {
      return { metadata: await fetchVisualizationMetadata() }
    } catch (error) {
      if (error?.response?.status !== 404) throw error
    }
  }

  const response = await apiClient.post('/visualization/sync', buildDatasetSyncPayload(dataset, options))
  return response.data
}

export async function fetchVisualizationMetadata() {
  const response = await apiClient.get('/visualization/metadata')
  return response.data
}

export async function renderVisualizationChart(payload) {
  const response = await apiClient.post('/visualization/chart', payload)
  return response.data
}

export async function renderVisualizationBatch(charts) {
  const response = await apiClient.post('/visualization/batch', { charts })
  return response.data
}

export async function renderGeoMap(payload) {
  const response = await apiClient.post('/visualization/geo', payload)
  return response.data
}
