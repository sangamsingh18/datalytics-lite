import { useEffect, useState } from 'react'

export default function GlobalRuntimeGuard({ children }) {
  const [runtimeError, setRuntimeError] = useState(null)

  useEffect(() => {
    function handleError(event) {
      const error = event?.error
      setRuntimeError({
        message: error?.message || event?.message || 'Unknown client runtime error',
        stack: error?.stack || '',
        type: 'error',
      })
    }

    function handleUnhandledRejection(event) {
      const reason = event?.reason
      setRuntimeError({
        message: reason?.message || String(reason || 'Unhandled promise rejection'),
        stack: reason?.stack || '',
        type: 'unhandledrejection',
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  if (!runtimeError) return children

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: 'linear-gradient(180deg, #0b1020, #16121d)',
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          width: 'min(920px, 100%)',
          padding: '1.5rem',
          borderRadius: '24px',
          border: '1px solid rgba(251,191,36,0.24)',
          background: 'rgba(15,23,42,0.88)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ marginBottom: '1rem', fontSize: '0.78rem', letterSpacing: '0.18em', color: '#fde68a', fontWeight: 800 }}>
          RUNTIME ERROR
        </div>
        <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem' }}>A browser-side runtime exception was caught.</h1>
        <div
          style={{
            padding: '1rem',
            borderRadius: '16px',
            background: 'rgba(2,6,23,0.72)',
            border: '1px solid rgba(148,163,184,0.2)',
            color: '#fde68a',
            fontFamily: 'Consolas, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {runtimeError.message}
        </div>
        {runtimeError.stack ? (
          <pre
            style={{
              marginTop: '1rem',
              maxHeight: '320px',
              overflow: 'auto',
              padding: '1rem',
              borderRadius: '16px',
              background: 'rgba(2,6,23,0.72)',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#e2e8f0',
              fontFamily: 'Consolas, monospace',
              whiteSpace: 'pre-wrap',
            }}
          >
            {runtimeError.stack}
          </pre>
        ) : null}
      </div>
    </div>
  )
}
