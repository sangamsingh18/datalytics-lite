import client from '../../services/apiClient.js'
import { useToast } from '../../hooks/useToast.jsx'

export default function DownloadStep({ trainData, preprocessData, status, setStatus }) {
  const { addToast } = useToast()
  const hasModel = Boolean(trainData?.best_model_name || status.best_model_name)
  const hasProcessed = Boolean(preprocessData || status.preprocessing_done)
  const hasResults = Boolean(status.supervised_done)
  const hasClusters = Boolean(status.unsupervised_done)
  const hasPredictions = Boolean(status.has_predictions)
  const modelName = trainData?.best_model_name || status.best_model_name || 'model'

  async function download(endpoint, filename) {
    try {
      const res = await client.get(endpoint, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      if (setStatus) {
        setStatus((prev) => ({ ...prev, download_done: true }))
      }
    } catch (e) {
      const message = e.response?.data?.detail || e.message || 'Download failed.'
      addToast(`Download failed: ${message}`, () => download(endpoint, filename), 'error')
    }
  }

  const downloads = [
    {
      title: 'Best Trained Model',
      description: `Download the best model (${modelName}) as a pickle file.`,
      label: 'Download Model (.pkl)',
      action: () => download('/download-model', `${modelName.replace(/ /g, '_')}_model.pkl`),
      disabled: !hasModel,
    },
    {
      title: 'Processed Dataset',
      description: 'Download the preprocessed dataset as CSV.',
      label: 'Download Processed Data (.csv)',
      action: () => download('/download-processed-data', 'processed_dataset.csv'),
      disabled: !hasProcessed,
    },
    {
      title: 'Prediction Results',
      description: 'Download all predictions made in this session.',
      label: 'Download Predictions (.csv)',
      action: () => download('/download-predictions', 'prediction_results.csv'),
      disabled: !hasPredictions,
    },
    {
      title: 'Model Comparison Report',
      description: 'Download the full model comparison table as CSV.',
      label: 'Download Report (.csv)',
      action: () => download('/download-report', 'model_comparison_report.csv'),
      disabled: !hasResults,
    },
    {
      title: 'Clustering Report',
      description: 'Download clustering metrics as CSV.',
      label: 'Download Clustering Report (.csv)',
      action: () => download('/download-clustering-report', 'clustering_report.csv'),
      disabled: !hasClusters,
    },
  ]

  return (
    <div className="download-step">
      <h1 className="page-title">Download Results</h1>
      <p className="page-subtitle">Export model artifacts, reports, and prediction tables from the integrated backend workflow.</p>

      <div className="download-grid">
        {downloads.map(item => (
          <div key={item.title} className={`download-card${item.disabled ? ' is-disabled' : ''}`}>
            <div className="download-card-body">
              <strong className="download-card-title">{item.title}</strong>
              <p className="download-card-desc">{item.description}</p>
            </div>
            <div className="download-card-footer">
              <button
                className="btn btn-primary btn-sm download-card-btn"
                onClick={item.action}
                disabled={item.disabled}
              >
                {item.label}
              </button>
              {item.disabled && (
                <span className="download-card-hint">Available once the related step has run.</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
