// Yeh datasetApi.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
import apiClient from '../../services/apiClient.js'

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024
const CHUNK_UPLOAD_THRESHOLD = 12 * 1024 * 1024

function emitProgress(onProgress, percent) {
  if (typeof onProgress === 'function') {
    onProgress(Math.max(0, Math.min(100, Math.round(percent))))
  }
}

async function uploadDirect(file, { onProgress } = {}) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      const total = event.total || file.size || 1
      emitProgress(onProgress, (event.loaded / total) * 100)
    },
  })
  emitProgress(onProgress, 100)
  return response.data
}

async function uploadInChunks(file, { onProgress } = {}) {
  const initResponse = await apiClient.post('/upload/init', {
    filename: file.name,
    total_size: file.size,
    content_type: file.type || 'application/octet-stream',
    chunk_size: DEFAULT_CHUNK_SIZE,
  })

  const uploadId = initResponse.data?.upload_id
  const chunkSize = Number(initResponse.data?.chunk_size) || DEFAULT_CHUNK_SIZE
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  let uploadedBytes = 0

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const blob = file.slice(start, end)
    const formData = new FormData()
    formData.append('chunk', blob, `${file.name}.part-${index}`)
    formData.append('index', String(index))
    formData.append('total_chunks', String(totalChunks))

    await apiClient.post(`/upload/chunk/${uploadId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        const currentLoaded = uploadedBytes + (event.loaded || 0)
        emitProgress(onProgress, (currentLoaded / Math.max(file.size, 1)) * 100)
      },
    })

    uploadedBytes += blob.size
    emitProgress(onProgress, (uploadedBytes / Math.max(file.size, 1)) * 100)
  }

  const completeResponse = await apiClient.post(`/upload/complete/${uploadId}`)
  emitProgress(onProgress, 100)
  return completeResponse.data
}

export async function uploadDataset(file, options = {}) {
  if (!file) {
    throw new Error('No file selected.')
  }

  if (file.size >= CHUNK_UPLOAD_THRESHOLD) {
    return uploadInChunks(file, options)
  }

  return uploadDirect(file, options)
}

export async function fetchDatasetJson(limit = 5000) {
  const response = await apiClient.get('/dataset/json', {
    params: { limit },
  })
  return response.data
}

export function isBackendDatasetReady(dataset) {
  return Boolean(dataset?.meta?.backend_managed) && !dataset?.meta?.needs_backend_sync
}

export function buildDatasetSyncPayload(dataset, options = {}) {
  return {
    rows: dataset?.rows || [],
    columns: dataset?.columns || [],
    name: dataset?.name || 'Dataset',
    meta: dataset?.meta || {},
    replace_original: Boolean(options.replaceOriginal),
  }
}
