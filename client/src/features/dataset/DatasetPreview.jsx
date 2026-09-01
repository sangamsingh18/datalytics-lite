import DataTable from './DatasetTable.jsx'

export default function DatasetPreview({ rows = [], columns = [], types = {}, nullCounts = {} }) {
  const previewRows = rows.slice(0, 20)

  return (
    <div className="preview-table">
      <div className="preview-badges">
        {columns.map((col) => (
          <div key={`${col}-type`} className="preview-badge">
            <span className="badge">{types[col] || 'unknown'}</span>
            <span className={`badge ${nullCounts[col] ? 'danger' : 'success'}`}>
              nulls: {nullCounts[col] ?? 0}
            </span>
          </div>
        ))}
      </div>
      <DataTable rows={previewRows} columns={columns} pageSize={20} sortable highlightNulls editable={true} />
    </div>
  )
}
