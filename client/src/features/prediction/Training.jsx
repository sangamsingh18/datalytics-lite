import { useEffect, useState } from 'react'
import client from '../../services/apiClient.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const COLORS = ['#6c63ff', '#3f8efc', '#00d2ff', '#00d26a', '#ffb020', '#f472b6', '#a78bfa']

export default function TrainStep({ preprocessData, status, onTrained, setStatus }) {
  const [loading, setLoading] = useState(false)
  const [hydrating, setHydrating] = useState(true)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const expectsLargeDatasetMode = Boolean(
    preprocessData?.large_dataset_mode || (preprocessData?.train_size || 0) >= 35000
  )

  useEffect(() => {
    let cancelled = false

    async function loadExisting() {
      if (!status.supervised_done) {
        setHydrating(false)
        return
      }

      try {
        const res = await client.get('/train-results')
        if (!cancelled) {
          setResult(res.data)
        }
      } catch (e) {
        if (!cancelled && e.response?.status !== 404) {
          setError(e.response?.data?.detail || 'Failed to load trained model results.')
        }
      } finally {
        if (!cancelled) {
          setHydrating(false)
        }
      }
    }

    loadExisting()
    return () => {
      cancelled = true
    }
  }, [status.supervised_done])

  if (!preprocessData && !status.preprocessing_done) {
    return <div className="alert alert-warning">Please complete preprocessing first.</div>
  }

  async function handleTrain() {
    setLoading(true)
    setError(null)
    try {
      const res = await client.post('/train-model')
      setResult(res.data)
      onTrained(res.data)
      setStatus(s => ({ ...s, supervised_done: true, best_model_name: res.data.best_model_name }))
    } catch (e) {
      setError(e.response?.data?.detail || 'Training failed.')
    } finally {
      setLoading(false)
    }
  }

  const primaryMetric = result?.primary_metric || 'Accuracy'
  const chartData = result?.results?.map(row => ({
    name: row.Model,
    value: parseFloat((row[primaryMetric] ?? 0).toFixed(4)),
  })) || []

  const MODELS = [
    { name: 'Random Forest',     icon: '🌲', color: '#22c55e' },
    { name: 'Gradient Boosting', icon: '⚡', color: '#f59e0b' },
    { name: 'Logistic Reg.',     icon: '📈', color: '#60a5fa' },
    { name: 'Decision Tree',     icon: '🌿', color: '#a78bfa' },
    { name: 'SVM',               icon: '🔷', color: '#f472b6' },
  ]

  return (
    <div style={{ fontFamily: 'Inter,sans-serif' }}>

      {/* PAGE HEADER */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.4rem' }}>
          <span style={{ fontSize: '1.4rem' }}>🧠</span>
          <h1 style={{ margin: 0, fontFamily: 'Space Grotesk,sans-serif', fontWeight: 800, fontSize: '1.65rem', color: '#fff' }}>Supervised Models</h1>
        </div>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.38)', fontSize: '.85rem', paddingLeft: '2.1rem' }}>
          Train and compare supervised models using the shared backend dataset session.
        </p>
      </div>

      {/* TRAIN CARD */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '1.5rem 1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', fontFamily: 'Space Grotesk,sans-serif' }}>⚙️ Configuration</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '.85rem 1.1rem', borderRadius: 12, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🎯</span>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Task Type</div>
            <div style={{ fontFamily: 'Space Grotesk,sans-serif', fontWeight: 700, color: '#22c55e', fontSize: '.95rem' }}>{preprocessData?.task_type || status.task_type || '—'}</div>
          </div>
        </div>
        {expectsLargeDatasetMode && !result && (
          <div style={{ padding: '.85rem 1.1rem', borderRadius: 12, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', color: 'rgba(147,210,255,.8)', fontSize: '.82rem', marginBottom: '1rem' }}>
            ⚡ Large dataset mode — scalable models, reduced memory, CV skipped for stability.
          </div>
        )}
        {error && <div style={{ padding: '.85rem 1.1rem', borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'rgba(252,165,165,.9)', fontSize: '.83rem', marginBottom: '1rem' }}>❌ {error}</div>}
        <button onClick={handleTrain} disabled={loading} style={{
          width: '100%', padding: '1rem 2rem', borderRadius: 14, border: 'none', color: '#fff',
          fontSize: '1rem', fontFamily: 'Space Grotesk,sans-serif', fontWeight: 800, letterSpacing: '.04em',
          background: loading ? 'rgba(34,197,94,.4)' : 'linear-gradient(135deg,#16a34a 0%,#22c55e 60%,#4ade80 100%)',
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: loading ? 'none' : '0 8px 32px rgba(34,197,94,.35)',
          transition: 'all .2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem',
        }}>
          {loading
            ? <><span style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin .7s linear infinite' }} /> Initiating training pipeline…</>
            : <><span style={{ fontSize: '1.1rem' }}>🚀</span> Train All Supervised Models</>}
        </button>
      </div>

      {/* ── TRAINING ANIMATION ── */}
      {loading && (
        <div style={{ marginBottom: '1.5rem' }}>
          <style>{`
            @keyframes train-pulse { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
            @keyframes train-bar { from{width:0} to{width:var(--tw)} }
            @keyframes train-glow { 0%,100%{box-shadow:0 0 20px rgba(34,197,94,.15)} 50%{box-shadow:0 0 50px rgba(34,197,94,.4)} }
            @keyframes train-orbit { 0%{transform:rotate(0deg) translateX(36px)} 100%{transform:rotate(360deg) translateX(36px)} }
            @keyframes train-fade { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
          `}</style>

          {/* Neural Net Orb */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'2.5rem 1.5rem', background:'rgba(255,255,255,.025)', border:'1px solid rgba(34,197,94,.2)', borderRadius:22, marginBottom:'1.25rem', animation:'train-glow 2s ease-in-out infinite', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 60% 40% at 50% 0%,rgba(34,197,94,.12),transparent 70%)', pointerEvents:'none' }} />
            {/* Orbiting dots */}
            <div style={{ position:'relative', width:90, height:90, marginBottom:'1.5rem' }}>
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid rgba(34,197,94,.25)', animation:'train-glow 1.5s ease-in-out infinite' }} />
              <div style={{ position:'absolute', inset:'50%', width:18, height:18, marginLeft:-9, marginTop:-9, borderRadius:'50%', background:'linear-gradient(135deg,#22c55e,#4ade80)', boxShadow:'0 0 24px rgba(34,197,94,.8)' }} />
              {MODELS.map((m, i) => {
                const orbitDur = 3
                const delay = `-${(orbitDur / 5) * i}s`
                return (
                  <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:0, height:0, animation:`train-orbit ${orbitDur}s linear ${delay} infinite`, transformOrigin:'0 0' }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:m.color, boxShadow:`0 0 12px ${m.color}`, position:'absolute', top:-4.5, left:-4.5 }} />
                  </div>
                )
              })}
            </div>
            <div style={{ fontFamily:'Space Grotesk,sans-serif', fontWeight:800, fontSize:'1.1rem', color:'#fff', marginBottom:'.4rem', zIndex:1 }}>Training Neural Pipeline</div>
            <div style={{ fontSize:'.8rem', color:'rgba(255,255,255,.45)', zIndex:1 }}>Fitting models · Optimizing hyperparameters · Evaluating metrics</div>
          </div>

          {/* Per-model animated bars */}
          <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
            {MODELS.map((m, i) => {
              const pct = [92, 78, 65, 55, 40][i]
              return (
                <div key={m.name} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14, padding:'1rem 1.25rem', animation:`train-fade .4s ease ${i * .12}s both` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.65rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'.6rem' }}>
                      <span style={{ fontSize:'1.05rem' }}>{m.icon}</span>
                      <span style={{ fontFamily:'Space Grotesk,sans-serif', fontWeight:700, fontSize:'.85rem', color:'#fff' }}>{m.name}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:m.color, boxShadow:`0 0 8px ${m.color}`, display:'inline-block', animation:'train-pulse 1.2s ease-in-out infinite', animationDelay:`${i*0.2}s` }} />
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'.72rem', color:m.color, fontWeight:700 }}>Training…</span>
                    </div>
                  </div>
                  <div style={{ height:6, borderRadius:999, background:'rgba(255,255,255,.07)', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:999,
                      background:`linear-gradient(90deg,${m.color},${m.color}aa)`,
                      boxShadow:`0 0 12px ${m.color}66`,
                      width:`${pct}%`,
                      animation:`train-bar ${1.5 + i * 0.4}s cubic-bezier(.22,1,.36,1) ${i*0.15}s both`,
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {hydrating && !loading && (
        <div style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'1.5rem', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:14, marginBottom:'1.5rem' }}>
          <span style={{ width:20, height:20, borderRadius:'50%', border:'2.5px solid rgba(255,255,255,.2)', borderTopColor:'#22c55e', display:'inline-block', animation:'spin .7s linear infinite', flexShrink:0 }} />
          <span style={{ color:'rgba(255,255,255,.6)', fontSize:'.88rem' }}>Loading saved training results…</span>
        </div>
      )}

      {result && !loading && (
        <>
          {result.large_dataset_mode && (
            <div style={{ padding:'.85rem 1.1rem', borderRadius:12, background:'rgba(96,165,250,.06)', border:'1px solid rgba(96,165,250,.2)', color:'rgba(147,210,255,.8)', fontSize:'.82rem', marginBottom:'1.25rem' }}>
              ⚡ Large dataset mode — trained on <strong>{(result.train_rows_used||0).toLocaleString()}</strong> rows, tested on <strong>{(result.test_rows_used||0).toLocaleString()}</strong> rows.
              {!result.cv_enabled && ' Cross-validation skipped.'}
            </div>
          )}
          <div className="best-banner"><div className="best-banner-label">Best Model</div><div className="best-banner-name">{result.best_model_name}</div></div>
          <BestMetrics metrics={result.best_metrics} taskType={result.task_type} />
          <TuningSummary metrics={result.best_metrics} taskType={result.task_type} />
          <div className="card" style={{ marginBottom:'1rem' }}>
            <div className="section-title">Performance Comparison — {primaryMetric}</div>
            <div className="chart-wrap" style={{ height:360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top:28, right:16, left:4, bottom:30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3551" />
                  <XAxis dataKey="name" tick={{ fill:'#aebad3', fontSize:12 }} angle={-20} textAnchor="end" />
                  <YAxis tick={{ fill:'#c5d2eb', fontSize:12 }} tickFormatter={(v)=>formatAxisTick(v,primaryMetric)} />
                  <Tooltip cursor={{ fill:'rgba(255,255,255,0.04)' }} content={<ChartTooltip metricLabel={primaryMetric} />} />
                  <Bar dataKey="value" radius={[8,8,0,0]}>
                    <LabelList dataKey="value" position="top" content={(props)=><ValueLabel {...props} metricLabel={primaryMetric} />} />
                    {chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card"><div className="section-title">Model Comparison Table</div><ResultsTable results={result.results} primaryMetric={primaryMetric} bestModel={result.best_model_name} /></div>
        </>
      )}
    </div>
  )
}

function BestMetrics({ metrics, taskType }) {
  if (!metrics) {
    return null
  }

  const isClassification = taskType === 'Classification'
  const pairs = isClassification
    ? [
        ['Accuracy', metrics.Accuracy],
        ['F1 Score', metrics['F1 Score']],
        ['ROC-AUC', metrics['ROC-AUC']],
        ['CV Mean', metrics['CV Mean']],
      ]
    : [
        ['R2 Score', metrics['R2 Score']],
        ['CV Mean R2', metrics['CV Mean R2']],
        ['RMSE', metrics.RMSE],
        ['MAE', metrics.MAE],
      ]

  return (
    <div className="metrics-row metrics-4" style={{ marginBottom: '1rem' }}>
      {pairs.map(([label, value]) => (
        <div key={label} className="metric-card">
          <div className="metric-label">{label}</div>
          <div className="metric-value">{formatDisplayValue(value, label)}</div>
        </div>
      ))}
    </div>
  )
}

function TuningSummary({ metrics, taskType }) {
  if (!metrics?.['Best Params']) {
    return null
  }

  const tuningLabel = taskType === 'Classification' ? 'Best CV Accuracy' : 'Best CV R2'
  const tuningScore = metrics['Tuning Score']

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="section-title">Tuned Parameters</div>
      <div className="metrics-row metrics-2" style={{ marginBottom: '1rem' }}>
        <div className="metric-card">
          <div className="metric-label">{tuningLabel}</div>
          <div className="metric-value">{formatDisplayValue(tuningScore, tuningLabel)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Search Status</div>
          <div className="metric-value">{metrics.Tuned || 'No'}</div>
        </div>
      </div>
      <div className="alert alert-info" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong>Best Params</strong>
          <div style={{ marginTop: '0.5rem', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {metrics['Best Params']}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultsTable({ results, primaryMetric, bestModel }) {
  if (!results?.length) {
    return null
  }

  const columns = Object.keys(results[0])
  const primaryMetricDisplay = displayMetricLabel(primaryMetric)
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(column => <th key={column}>{displayMetricLabel(column)}</th>)}</tr>
        </thead>
        <tbody>
          {results.map((row, index) => (
            <tr key={index} style={row.Model === bestModel ? { background: 'rgba(0,210,106,0.05)' } : {}}>
              {columns.map(column => (
                <td key={column} className={column === primaryMetric && row.Model === bestModel ? 'best' : ''}>
                  {formatTableValue(row[column], displayMetricLabel(column))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatTableValue(value, column) {
  if (value == null) {
    return '-'
  }

  if (typeof value === 'number') {
    return formatDisplayValue(value, column)
  }

  if (column === 'Best Params') {
    return (
      <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.75rem' }}>
        {String(value)}
      </code>
    )
  }

  return String(value)
}

function ChartTooltip({ active, payload, label, metricLabel }) {
  if (!active || !payload?.length) {
    return null
  }

  const value = payload[0]?.value

  return (
    <div
      style={{
        background: 'rgba(10, 18, 34, 0.96)',
        border: '1px solid rgba(108, 99, 255, 0.35)',
        borderRadius: 14,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)',
        padding: '0.85rem 1rem',
        minWidth: 220,
      }}
    >
      <div style={{ color: '#f5fbff', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.45rem' }}>
        {label}
      </div>
      <div style={{ color: '#92a4c9', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {metricLabel}
      </div>
      <div style={{ color: '#7cecff', fontSize: '1.35rem', fontWeight: 800, marginTop: '0.15rem' }}>
        {formatDisplayValue(value, metricLabel)}
      </div>
    </div>
  )
}

function ValueLabel({ x, y, width, value, metricLabel }) {
  if (value == null || x == null || y == null || width == null) {
    return null
  }

  return (
    <text
      x={x + width / 2}
      y={Math.max(y - 12, 14)}
      textAnchor="middle"
      fill="#f7fbff"
      fontSize={13}
      fontWeight={700}
      stroke="rgba(8, 14, 24, 0.95)"
      strokeWidth={4}
      paintOrder="stroke"
    >
      {formatDisplayValue(value, metricLabel, { compact: true })}
    </text>
  )
}

function formatAxisTick(value, metricLabel) {
  if (shouldUsePercentage(metricLabel, value)) {
    return `${Math.round(value * 100)}%`
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }
  return Number(value).toFixed(2)
}

function formatDisplayValue(value, metricLabel, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }

  const digits = options.compact ? 1 : 2

  if (shouldUsePercentage(metricLabel, value)) {
    return `${(value * 100).toFixed(digits)}%`
  }

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  return value.toFixed(4)
}

function shouldUsePercentage(metricLabel, value) {
  const label = String(metricLabel || '').toLowerCase()

  if (!Number.isFinite(value)) {
    return false
  }

  if (label.includes('mae') || label.includes('mse') || label.includes('rmse')) {
    return false
  }

  return Math.abs(value) <= 1.2
}

function displayMetricLabel(label) {
  if (!label) return label
  const map = {
    'R2 Score': 'R2 Score',
    'CV Mean R2': 'CV Mean R2',
    'Best CV R2': 'Best CV R2',
  }
  return map[label] || label
}
