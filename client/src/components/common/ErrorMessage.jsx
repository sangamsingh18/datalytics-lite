import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      error: null,
      info: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    if (typeof window !== 'undefined') {
      window.__datalytics_last_error__ = {
        message: error?.message || 'Unknown client error',
        stack: error?.stack || '',
        componentStack: info?.componentStack || '',
      }
    }
    console.error('Datalytics client error boundary caught:', error, info)
  }

  render() {
    const { error, info } = this.state
    if (!error) {
      return this.props.children
    }

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
            border: '1px solid rgba(248,113,113,0.24)',
            background: 'rgba(15,23,42,0.88)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ marginBottom: '1rem', fontSize: '0.78rem', letterSpacing: '0.18em', color: '#fca5a5', fontWeight: 800 }}>
            CLIENT ERROR
          </div>
          <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem' }}>The dashboard hit a browser-side exception.</h1>
          <p style={{ margin: '0 0 1rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            The exact error is shown below so we can fix it directly instead of guessing.
          </p>
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
            {error?.message || 'Unknown client error'}
          </div>
          {error?.stack ? (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: '#93c5fd' }}>Stack trace</summary>
              <pre
                style={{
                  marginTop: '0.75rem',
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
                {error.stack}
                {info?.componentStack ? `\n\nComponent stack:\n${info.componentStack}` : ''}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    )
  }
}
