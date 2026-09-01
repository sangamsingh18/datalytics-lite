import { memo, useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'

function shallowStyleEqual(left, right) {
  if (left === right) return true
  if (!left || !right) return !left && !right

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

function PlotFigure({
  figure,
  style,
  className = '',
  themeMode = 'dark',
  onPointClick,
  onReady,
  lazy = false,
}) {
  const containerRef = useRef(null)
  const divRef = useRef(null)
  const callbacksRef = useRef({ onPointClick, onReady })
  const resizeFrameRef = useRef(0)
  const [isVisible, setIsVisible] = useState(!lazy)
  const [renderError, setRenderError] = useState('')

  useEffect(() => {
    callbacksRef.current = { onPointClick, onReady }
  }, [onPointClick, onReady])

  useEffect(() => {
    setRenderError('')
  }, [figure, themeMode])

  useEffect(() => {
    if (!lazy || isVisible || !containerRef.current || typeof IntersectionObserver === 'undefined') {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '600px' }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isVisible, lazy])

  useEffect(() => {
    if (!figure?.data || !figure?.layout || !divRef.current || !isVisible) return

    const isLight = themeMode === 'light'
    const target = divRef.current
    let clickHandler = null
    let resizeObserver = null
    let disposed = false
    let lastObservedWidth = 0
    let lastObservedHeight = 0

    function scheduleResize() {
      if (resizeFrameRef.current) {
        cancelAnimationFrame(resizeFrameRef.current)
      }
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = 0
        if (!target?.isConnected) return
        try {
          Plotly.Plots.resize(target)
        } catch {
          // Ignore size updates after unmount.
        }
      })
    }

    Promise.resolve()
      .then(() => Plotly.react(target, figure.data, {
        autosize: true,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: isLight ? '#0f172a' : '#edf3ff' },
        margin: { l: 40, r: 20, t: 60, b: 40 },
        ...figure.layout,
      }, {
        responsive: false,
        displaylogo: false,
        modeBarButtonsToRemove: ['select2d', 'lasso2d'],
        ...figure.config,
      }))
      .then(() => {
        if (disposed) return
        setRenderError('')
        if (callbacksRef.current.onPointClick && target?.on) {
          clickHandler = (event) => callbacksRef.current.onPointClick?.(event)
          target.on('plotly_click', clickHandler)
        }
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0]
            const width = Math.round(entry?.contentRect?.width || 0)
            const height = Math.round(entry?.contentRect?.height || 0)

            if (width <= 0 || height <= 0) return
            if (width === lastObservedWidth && height === lastObservedHeight) return

            lastObservedWidth = width
            lastObservedHeight = height
            scheduleResize()
          })
          resizeObserver.observe(containerRef.current)
        }
        scheduleResize()
        callbacksRef.current.onReady?.(target)
      })
      .catch((error) => {
        if (disposed) return
        setRenderError(error?.message || 'This chart could not render in the browser.')
      })

    return () => {
      disposed = true
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (resizeFrameRef.current) {
        cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = 0
      }
      if (clickHandler && target?.removeListener) {
        target.removeListener('plotly_click', clickHandler)
      }
      if (target) Plotly.purge(target)
    }
  }, [figure, isVisible, themeMode])

  if (!figure?.data || !figure?.layout) return null

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    >
      {renderError ? (
        <div
          className="builder-widget-empty"
          style={{
            width: '100%',
            height: '100%',
            minHeight: '160px',
          }}
        >
          <strong>Visual rendering failed</strong>
          <span>{renderError}</span>
        </div>
      ) : isVisible ? (
        <div
          ref={divRef}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <div
          className="builder-widget-skeleton"
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            borderRadius: '18px',
            background: 'rgba(148, 163, 184, 0.08)',
            color: themeMode === 'light' ? '#475569' : '#cbd5e1',
            fontSize: '0.9rem',
            padding: '1rem',
            textAlign: 'center',
          }}
        >
          <div className="builder-widget-skeleton-copy">
            <span className="builder-widget-skeleton-bar" />
            <span className="builder-widget-skeleton-bar is-short" />
            <small>Chart rendering is deferred until this widget is visible.</small>
          </div>
        </div>
      )}
    </div>
  )
}

function arePlotPropsEqual(previous, next) {
  return (
    previous.figure === next.figure &&
    previous.className === next.className &&
    previous.themeMode === next.themeMode &&
    previous.lazy === next.lazy &&
    shallowStyleEqual(previous.style, next.style)
  )
}

export default memo(PlotFigure, arePlotPropsEqual)
