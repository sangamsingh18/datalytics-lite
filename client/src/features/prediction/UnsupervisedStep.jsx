import { useEffect, useState } from 'react'
import client from '../../services/apiClient.js'
import PlotFigure from '../visualization/PlotFigure.jsx'

export default function UnsupervisedStep({ status, setStatus }) {
  const [loading, setLoading] = useState(false)
  const [hydrating, setHydrating] = useState(true)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [nClusters, setNClusters] = useState(3)
  const [eps, setEps] = useState(0.5)
  const [minSamples, setMinSamples] = useState(5)

  useEffect(() => {
    let cancelled = false

    async function loadExisting() {
      try {
        const res = await client.get('/cluster-results')
        if (!cancelled) {
          setResult(res.data)
        }
      } catch (e) {
        if (!cancelled && e.response?.status !== 404) {
          setError(e.response?.data?.detail || 'Failed to load clustering results.')
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
  }, [])

  if (!status.preprocessing_done) {
    return <div className="alert alert-warning">Please preprocess the dataset first.</div>
  }

  async function handleCluster() {
    setLoading(true)
    setError(null)
    try {
      const res = await client.post('/cluster', {
        n_clusters: nClusters,
        eps: parseFloat(eps),
        min_samples: minSamples,
      })
      setResult(res.data)
      setStatus(s => ({ ...s, unsupervised_done: true }))
    } catch (e) {
      setError(e.response?.data?.detail || 'Clustering failed.')
    } finally {
      setLoading(false)
    }
  }

  const MODELS = [
    { name: 'K-Means Clustering', icon: '🎯', color: '#22c55e' },
    { name: 'DBSCAN',             icon: '🌌', color: '#00d2ff' },
    { name: 'Gaussian Mixture',   icon: '🔮', color: '#f59e0b' },
    { name: 'Agglomerative',      icon: '🌿', color: '#a78bfa' },
  ]

  return (
    <div style={{ fontFamily: 'Inter,sans-serif' }}>
      {/* PAGE HEADER */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.4rem' }}>
          <span style={{ fontSize: '1.4rem' }}>🌌</span>
          <h1 style={{ margin: 0, fontFamily: 'Space Grotesk,sans-serif', fontWeight: 800, fontSize: '1.65rem', color: '#fff' }}>Unsupervised Models</h1>
        </div>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.38)', fontSize: '.85rem', paddingLeft: '2.1rem' }}>
          Run clustering models against the shared processed dataset and inspect PCA-based cluster views.
        </p>
      </div>

      {/* TRAIN CARD */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '1.5rem 1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', fontFamily: 'Space Grotesk,sans-serif' }}>⚙️ Configuration</span>
        </div>
        
        <div className="form-row form-row-3" style={{ marginBottom: '1.5rem' }}>
          <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', color: '#aebad3', fontSize: '.8rem', marginBottom: '.5rem' }}>
              <span>K-Means / GMM clusters</span>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>{nClusters}</span>
            </label>
            <input type="range" min={2} max={10} value={nClusters} onChange={e => setNClusters(Number(e.target.value))} style={{ width: '100%', accentColor: '#22c55e' }} />
          </div>
          <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', color: '#aebad3', fontSize: '.8rem', marginBottom: '.5rem' }}>
              <span>DBSCAN eps</span>
              <span style={{ color: '#00d2ff', fontWeight: 700 }}>{eps}</span>
            </label>
            <input type="range" min={0.1} max={5} step={0.1} value={eps} onChange={e => setEps(e.target.value)} style={{ width: '100%', accentColor: '#00d2ff' }} />
          </div>
          <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', color: '#aebad3', fontSize: '.8rem', marginBottom: '.5rem' }}>
              <span>DBSCAN min samples</span>
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>{minSamples}</span>
            </label>
            <input type="range" min={2} max={20} value={minSamples} onChange={e => setMinSamples(Number(e.target.value))} style={{ width: '100%', accentColor: '#f59e0b' }} />
          </div>
        </div>

        {error && <div style={{ padding: '.85rem 1.1rem', borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'rgba(252,165,165,.9)', fontSize: '.83rem', marginBottom: '1rem' }}>❌ {error}</div>}
        
        <button onClick={handleCluster} disabled={loading} style={{
          width: '100%', padding: '1rem 2rem', borderRadius: 14, border: 'none', color: '#fff',
          fontSize: '1rem', fontFamily: 'Space Grotesk,sans-serif', fontWeight: 800, letterSpacing: '.04em',
          background: loading ? 'rgba(34,197,94,.4)' : 'linear-gradient(135deg,#16a34a 0%,#22c55e 60%,#4ade80 100%)',
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: loading ? 'none' : '0 8px 32px rgba(34,197,94,.35)',
          transition: 'all .2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem',
        }}>
          {loading
            ? <><span style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin .7s linear infinite' }} /> Running Clustering Pipeline…</>
            : <><span style={{ fontSize: '1.1rem' }}>✨</span> Train Clustering Models</>}
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
                const delay = `-${(orbitDur / MODELS.length) * i}s`
                return (
                  <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:0, height:0, animation:`train-orbit ${orbitDur}s linear ${delay} infinite`, transformOrigin:'0 0' }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:m.color, boxShadow:`0 0 12px ${m.color}`, position:'absolute', top:-4.5, left:-4.5 }} />
                  </div>
                )
              })}
            </div>
            <div style={{ fontFamily:'Space Grotesk,sans-serif', fontWeight:800, fontSize:'1.1rem', color:'#fff', marginBottom:'.4rem', zIndex:1 }}>Clustering Data Pipeline</div>
            <div style={{ fontSize:'.8rem', color:'rgba(255,255,255,.45)', zIndex:1 }}>Computing distances · Identifying centroids · Projecting PCA</div>
          </div>

          {/* Per-model animated bars */}
          <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
            {MODELS.map((m, i) => {
              const pct = [85, 70, 50, 40][i]
              return (
                <div key={m.name} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14, padding:'1rem 1.25rem', animation:`train-fade .4s ease ${i * .12}s both` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.65rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'.6rem' }}>
                      <span style={{ fontSize:'1.05rem' }}>{m.icon}</span>
                      <span style={{ fontFamily:'Space Grotesk,sans-serif', fontWeight:700, fontSize:'.85rem', color:'#fff' }}>{m.name}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:m.color, boxShadow:`0 0 8px ${m.color}`, display:'inline-block', animation:'train-pulse 1.2s ease-in-out infinite', animationDelay:`${i*0.2}s` }} />
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'.72rem', color:m.color, fontWeight:700 }}>Clustering…</span>
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
          <span style={{ color:'rgba(255,255,255,.6)', fontSize:'.88rem' }}>Loading clustering state…</span>
        </div>
      )}

      {result?.cluster_counts?.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="section-title">Clustering Comparison</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>{['Model', 'Silhouette', 'Davies-Bouldin', 'Clusters'].map(column => <th key={column}>{column}</th>)}</tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Clustering Pipeline</td>
                    <td>{formatMetric(result.silhouette_score)}</td>
                    <td>{formatMetric(result.davies_bouldin)}</td>
                    <td>{result.n_clusters}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="section-title">PCA Cluster View</div>
            <PlotFigure figure={result.figure} style={{ height: 420 }} />
          </div>
        </>
      )}
    </div>
  )
}

function formatMetric(value) {
  return typeof value === 'number' ? value.toFixed(4) : String(value)
}
