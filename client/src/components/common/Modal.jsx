import { useEffect } from 'react'
import { HiOutlineXMark } from 'react-icons/hi2'

export default function GlassModal({
  open,
  title,
  onClose,
  children,
  footer = null,
  panelClass = '',
}) {
  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ds-modal-backdrop" role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
      <div className={`ds-modal-panel ${panelClass}`}>
        <header className="ds-modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="ds-modal-close mac-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </header>

        <div className="ds-modal-body">
          {children}
        </div>

        {footer ? <footer className="ds-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}
