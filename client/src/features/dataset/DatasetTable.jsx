import { useMemo, useState } from 'react';

export default function DataTable({
  rows = [],
  columns,
  limit,
  compact,
  pageSize = 10,
  sortable = true,
  highlightNulls = true,
  maxHeight = 420,
  virtualizeThreshold = 200,
  rowHeight = 44,
  editable = false,
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ column: null, dir: 'asc' });
  const [scrollTop, setScrollTop] = useState(0);

  const safeRows = limit ? rows.slice(0, limit) : rows;
  const cols = columns || Object.keys(safeRows[0] || {});

  const sortedRows = useMemo(() => {
    if (!sort.column) return safeRows;
    return [...safeRows].sort((a, b) => {
      const av = a[sort.column] ?? '';
      const bv = b[sort.column] ?? '';
      const aNum = Number(av);
      const bNum = Number(bv);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return sort.dir === 'asc' ? aNum - bNum : bNum - aNum;
      }
      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [safeRows, sort]);

  const useVirtualization = !limit && sortedRows.length > virtualizeThreshold;
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const pagedRows = useVirtualization
    ? sortedRows
    : sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const overscan = 6;
  const visibleCount = Math.ceil(maxHeight / rowHeight) + overscan * 2;
  const startIndex = useVirtualization
    ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    : 0;
  const endIndex = useVirtualization
    ? Math.min(pagedRows.length, startIndex + visibleCount)
    : pagedRows.length;
  const visibleRows = useVirtualization ? pagedRows.slice(startIndex, endIndex) : pagedRows;
  const topSpacer = useVirtualization ? startIndex * rowHeight : 0;
  const bottomSpacer = useVirtualization ? Math.max(0, (pagedRows.length - endIndex) * rowHeight) : 0;

  if (!safeRows.length || !cols.length) {
    return <div className="alert alert-info">No data available.</div>;
  }

  function handleSort(column) {
    if (!sortable) return;
    setPage(1);
    setSort((prev) => {
      if (prev.column === column) {
        return { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { column, dir: 'asc' };
    });
  }

  return (
    <div className={`table-wrap ${compact ? 'table-wrap-compact' : ''}`}
      style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      <div
        style={useVirtualization ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' } : undefined}
        onScroll={useVirtualization ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
      >
        <table style={{ minWidth: `${Math.max(cols.length * 120, 400)}px` }}>
          <thead>
            <tr>
              {cols.map((column) => (
                <th key={column} onClick={() => handleSort(column)}
                  style={{ minWidth: '100px', whiteSpace: 'nowrap' }}
                >
                  {column}{sortable && sort.column === column ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {useVirtualization && topSpacer > 0 ? (
              <tr aria-hidden="true" className="table-spacer">
                <td colSpan={cols.length} style={{ height: `${topSpacer}px` }} />
              </tr>
            ) : null}
            {visibleRows.map((row, index) => {
              const rowHasNull = highlightNulls && cols.some((col) => {
                const v = row[col];
                return v == null || v === '';
              });
              return (
                <tr key={`${startIndex + index}`} className={rowHasNull ? 'row-has-null' : ''}>
                  {cols.map((column) => {
                    const value = row[column];
                    const isNull = value == null || value === '';
                    return (
                      <td
                        key={`${startIndex + index}-${column}`}
                        className={isNull && highlightNulls ? 'null-cell' : ''}
                        style={{ whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', outline: 'none' }}
                        contentEditable={editable}
                        suppressContentEditableWarning={editable}
                        onBlur={(e) => {
                          if (!editable) return;
                          const newVal = e.target.textContent;
                          if (newVal !== 'NULL') {
                            row[column] = newVal;
                          } else if (newVal === 'NULL' || newVal.trim() === '') {
                            row[column] = null;
                          }
                        }}
                      >
                        {isNull ? 'NULL' : (typeof value === 'object' ? JSON.stringify(value) : String(value))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {useVirtualization && bottomSpacer > 0 ? (
              <tr aria-hidden="true" className="table-spacer">
                <td colSpan={cols.length} style={{ height: `${bottomSpacer}px` }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {useVirtualization ? (
        <div className="pagination">
          <span>Virtualized {sortedRows.length.toLocaleString()} rows for smoother scrolling</span>
        </div>
      ) : totalPages > 1 ? (
        <div className="pagination">
          {Array.from({ length: totalPages }).map((_, idx) => (
            <button
              key={idx + 1}
              type="button"
              onClick={() => setPage(idx + 1)}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
