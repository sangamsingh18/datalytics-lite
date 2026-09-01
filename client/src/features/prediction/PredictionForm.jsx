import { useEffect, useState } from 'react'
import client from '../../services/apiClient.js'
import CustomDropdown from '../../components/common/CustomDropdown.jsx';

/* ─── tiny keyframe injector (runs once) ─── */
if (typeof document !== 'undefined' && !document.getElementById('ps-keyframes')) {
  const s = document.createElement('style')
  s.id = 'ps-keyframes'
  s.textContent = `
    @keyframes ps-spin { to { transform: rotate(360deg); } }
    @keyframes ps-fadein { from { opacity:0; transform:translateY(20px) scale(.96); } to { opacity:1; transform:translateY(0) scale(1); } }
    @keyframes ps-glow { 0%,100%{opacity:.4} 50%{opacity:.85} }
    @keyframes ps-shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
  `
  document.head.appendChild(s)
}

/* ─── design tokens ─── */
const T = {
  bg:       'rgba(255,255,255,0.03)',
  bgHov:    'rgba(255,255,255,0.055)',
  border:   'rgba(255,255,255,0.09)',
  borderAc: 'rgba(255,255,255,0.18)',
  radius:   '14px',
  green:    '#22c55e',
  greenDim: 'rgba(34,197,94,0.15)',
  greenBdr: 'rgba(34,197,94,0.35)',
  orange:   '#ff6b35',
  text:     'rgba(255,255,255,0.88)',
  muted:    'rgba(255,255,255,0.42)',
  faint:    'rgba(255,255,255,0.18)',
}

/* ─── shared sub-components ─── */
function SectionCard({ icon, title, tag, sub, count, children }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: T.bg,
        border: `1px solid ${hov ? T.borderAc : T.border}`,
        borderRadius: '18px',
        marginBottom: '1.5rem',
        overflow: 'visible',
        transition: 'border-color .25s, boqx-shadow .25s',
        boxShadow: hov ? '0 4px 32px rgba(255,107,53,.07)' : 'none',
      }}
    >
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.1rem 1.5rem',
        borderBottom: `1px solid ${T.border}`,
        background: 'rgba(255,255,255,0.02)',
        flexWrap: 'wrap', gap: '.6rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem' }}>
          <span style={{ fontSize: '1.35rem', filter: 'drop-shadow(0 0 6px rgba(255,107,53,.3))' }}>{icon}</span>
          <div>
            <div style={{ fontFamily:'Space Grotesk,sans-serif', fontWeight: 700, fontSize: '.95rem', color: T.text, display:'flex', alignItems:'center', gap:'.5rem', flexWrap:'wrap' }}>
              {title}
              {tag && (
                <span style={{ fontSize:'.65rem', fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
                  background:'rgba(99,179,237,.1)', color:'rgba(147,210,255,.8)', border:'1px solid rgba(99,179,237,.2)',
                  borderRadius:'100px', padding:'.12rem .55rem' }}>
                  {tag}
                </span>
              )}
            </div>
            <div style={{ fontSize: '.73rem', color: T.muted, marginTop: '.15rem', fontFamily:'Inter,sans-serif' }}>{sub}</div>
          </div>
        </div>
        <span style={{
          fontSize: '.72rem', fontWeight: 700, fontFamily:'JetBrains Mono,monospace',
          color: 'rgba(255,107,53,.8)', background: 'rgba(255,107,53,.1)',
          border: '1px solid rgba(255,107,53,.2)', padding: '.28rem .75rem', borderRadius: '100px',
        }}>{count} fields</span>
      </div>
      {/* grid body */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: '1.1rem',
        padding: '1.4rem 1.5rem',
      }}>
        {children}
      </div>
    </div>
  )
}

function SelectField({ label, value, options, onChange }) {
  const [foc, setFoc] = useState(false)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'.35rem' }}>
      <label style={{
        fontFamily:'Inter,sans-serif', fontSize:'.72rem', fontWeight:700,
        color: T.muted, textTransform:'uppercase', letterSpacing:'.06em',
      }}>{label}</label>
      <div style={{ position:'relative' }}>
        <CustomDropdown
          value={value}
          onChange={onChange}
          onFocus={() => setFoc(true)}
          onBlur={() => setFoc(false)}
          style={{
            width:'100%', padding:'.62rem 2.2rem .62rem .85rem',
            background: foc ? 'rgba(255,107,53,.06)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${foc ? 'rgba(255,107,53,.45)' : T.border}`,
            borderRadius:'10px', color: T.text,
            fontFamily:'Inter,sans-serif', fontSize:'.88rem', fontWeight:500,
            appearance:'none', WebkitAppearance:'none', outline:'none', cursor:'pointer',
            transition:'border-color .2s, background .2s',
            boxShadow: foc ? '0 0 0 3px rgba(255,107,53,.1)' : 'none',
          }}
        >
          {options.map(o => <option key={o} value={o} style={{ background:'#12121e' }}>{o}</option>)}
        </CustomDropdown>
        <span style={{
          position:'absolute', right:'.75rem', top:'50%', transform:'translateY(-50%)',
          fontSize:'.72rem', color: foc ? 'rgba(255,107,53,.7)' : T.faint,
          pointerEvents:'none', transition:'color .2s',
        }}>▾</span>
      </div>
    </div>
  )
}

function NumberField({ label, hint, value, placeholder, onChange }) {
  const [foc, setFoc] = useState(false)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'.35rem' }}>
      <label style={{
        fontFamily:'Inter,sans-serif', fontSize:'.72rem', fontWeight:700,
        color: T.muted, textTransform:'uppercase', letterSpacing:'.06em',
        display:'flex', justifyContent:'space-between', alignItems:'center', gap:'.3rem',
      }}>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
        {hint && <span style={{ fontSize:'.6rem', fontFamily:'JetBrains Mono,monospace', color:'rgba(255,255,255,0.85)', fontWeight:400, textTransform:'none', letterSpacing:0, flexShrink:0 }}>{hint}</span>}
      </label>
      <input
        type="number" step="any"
        value={value} placeholder={placeholder}
        onChange={onChange}
        onFocus={() => setFoc(true)}
        onBlur={() => setFoc(false)}
        style={{
          width:'100%', padding:'.62rem .85rem', boxSizing:'border-box',
          background: foc ? 'rgba(255,107,53,.06)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${foc ? 'rgba(255,107,53,.45)' : T.border}`,
          borderRadius:'10px', color: T.text,
          fontFamily:'JetBrains Mono,monospace', fontSize:'.86rem', fontWeight:500,
          outline:'none', transition:'border-color .2s, background .2s',
          boxShadow: foc ? '0 0 0 3px rgba(255,107,53,.1)' : 'none',
        }}
      />
    </div>
  )
}



/* ═══════════════════════════════════════════ */
export default function PredictStep({ trainData, status, setStatus }) {
  const [featureInfo, setFeatureInfo] = useState(null)
  const [inputs, setInputs] = useState({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!trainData && !status.supervised_done) return
    client.get('/feature-info')
      .then(res => {
        setFeatureInfo(res.data)
        const defaults = {}
        Object.entries(res.data.le_defaults || {}).forEach(([f, v]) => { defaults[f] = v })
        Object.entries(res.data.ohe_groups || {}).forEach(([col, info]) => {
          defaults[`__ohe__${col}`] = info.options?.[0] || ''
          info.feat_val_pairs?.forEach(([feat]) => { defaults[feat] = 0 })
        })
        Object.entries(res.data.feature_stats || {}).forEach(([f, s]) => {
          let val = s.median ?? 0
          if (typeof val === 'number' && !Number.isInteger(val)) {
            val = Number(val.toFixed(4))
          }
          defaults[f] = val
        })
        setInputs(defaults)
      })
      .catch(() => setError('Failed to load feature info.'))
  }, [trainData, status.supervised_done])

  if (!trainData && !status.supervised_done)
    return <div className="alert alert-warning">Please train models first.</div>

  if (!featureInfo)
    return <div className="spinner-wrap"><div className="spinner" /><span>Loading feature info…</span></div>

  function handleOheChange(col, info, chosen) {
    const update = { [`__ohe__${col}`]: chosen }
    info.feat_val_pairs?.forEach(([feat, val]) => { update[feat] = chosen === val ? 1 : 0 })
    setInputs(cur => ({ ...cur, ...update }))
  }

  async function handlePredict(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    const fv = {}
    featureInfo.feature_columns.forEach(feat => {
      if (label_encoded_feats[feat]) {
        const cls = label_encoded_feats[feat]
        const sel = inputs[feat] ?? cls[0]
        const enc = cls.indexOf(sel)
        fv[feat] = enc >= 0 ? enc : 0
        return
      }
      const raw = Number(inputs[feat] ?? 0)
      fv[feat] = Number.isFinite(raw) ? raw : 0
    })
    try {
      const res = await client.post('/predict', { feature_values: fv })
      setResult(res.data)
      setHistory(cur => [...cur, { ...fv, Prediction: res.data.prediction }])
      setStatus(cur => ({ ...cur, has_predictions: true, download_ready: true }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Prediction failed.')
    } finally {
      setLoading(false)
    }
  }

  const { label_encoded_feats, ohe_groups, numeric_feats, feature_stats } = featureInfo
  const modelName = trainData?.best_model_name || status.best_model_name || '—'
  const taskType  = (trainData?.task_type || status.task_type || '').toLowerCase()

  return (
    <div style={{ fontFamily:'Inter,sans-serif' }}>

      {/* ── PAGE HEADER ── */}
      <div style={{ marginBottom:'1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:'1.6rem', fontWeight:800, color:'#fff' }}>Make Predictions</h1>
          <div style={{ color:T.muted, fontSize:'.82rem', marginTop:'.25rem' }}>Configure feature inputs and run a real-time prediction</div>
        </div>

        {/* ── TOP RIGHT PREDICT BUTTON ── */}
        <button
          type="submit"
          form="predict-form"
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
            padding: '.75rem 1.75rem',
            background: loading
              ? 'rgba(34,197,94,.55)'
              : 'linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)',
            border: 'none', borderRadius: '100px',
            color: '#fff', fontSize: '.95rem', fontWeight: 700,
            fontFamily: 'Space Grotesk,sans-serif', letterSpacing: '.04em',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading
              ? 'none'
              : '0 6px 20px rgba(34,197,94,.35), 0 2px 6px rgba(0,0,0,.4)',
            opacity: loading ? .75 : 1,
            transition: 'all .25s ease',
          }}
          onMouseEnter={e => {
            if (!loading) {
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(34,197,94,.5), 0 2px 8px rgba(0,0,0,.4)'
              e.currentTarget.style.filter = 'brightness(1.08)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = loading ? 'none' : '0 6px 20px rgba(34,197,94,.35), 0 2px 6px rgba(0,0,0,.4)'
            e.currentTarget.style.filter = ''
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          {loading ? (
            <>
              <span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'ps-spin .7s linear infinite', flexShrink:0 }} />
              Predicting…
            </>
          ) : (
            <><span style={{ fontSize:'1rem' }}>⚡</span> Run Prediction</>
          )}
        </button>
      </div>



      <form id="predict-form" onSubmit={handlePredict}>

        {/* ── CATEGORICAL ── */}
        {Object.keys(label_encoded_feats).length > 0 && (
          <SectionCard icon="🏷️" title="Categorical Features" sub="Label encoded — ordinal integer mapping" count={Object.keys(label_encoded_feats).length}>
            {Object.entries(label_encoded_feats).map(([feat, classes]) => (
              <SelectField key={feat} label={feat} value={inputs[feat] || classes[0]} options={classes}
                onChange={e => setInputs(cur => ({ ...cur, [feat]: e.target.value }))} />
            ))}
          </SectionCard>
        )}

        {/* ── OHE ── */}
        {Object.keys(ohe_groups).length > 0 && (
          <SectionCard icon="🔠" title="Category Features" tag="One-Hot" sub="Binary column per unique category" count={Object.keys(ohe_groups).length}>
            {Object.entries(ohe_groups).map(([col, info]) => (
              <SelectField key={col} label={col} value={inputs[`__ohe__${col}`] || info.options?.[0]} options={info.options || []}
                onChange={e => handleOheChange(col, info, e.target.value)} />
            ))}
          </SectionCard>
        )}

        {/* ── NUMERIC ── */}
        {numeric_feats?.length > 0 && (
          <SectionCard icon="🔢" title="Numeric Features" sub="Pre-filled with dataset medians — adjust as needed" count={numeric_feats.length}>
            {numeric_feats.map(feat => {
              const s = feature_stats[feat] || {}
              
              // Format the median to 4 decimal places to look cleaner
              let initialVal = s.median ?? 0
              if (typeof initialVal === 'number' && !Number.isInteger(initialVal)) {
                initialVal = Number(initialVal.toFixed(4))
              }

              return (
                <NumberField key={feat} label={feat}
                  value={inputs[feat] ?? initialVal}
                  placeholder={initialVal}
                  onChange={e => setInputs(cur => ({ ...cur, [feat]: e.target.value }))} />
              )
            })}
          </SectionCard>
        )}

        {error && <div className="alert alert-warning" style={{ marginBottom:'6rem' }}>{error}</div>}

      </form>

      {/* ── RESULT CARD ── */}
      {result && !loading && (
        <div style={{
          position:'relative', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          textAlign:'center', margin:'0 auto 2rem', padding:'3rem 2rem 2.5rem',
          maxWidth:640, background:'linear-gradient(160deg, rgba(34,197,94,.07) 0%, rgba(10,10,20,.75) 100%)',
          border:'1px solid rgba(34,197,94,.35)', borderRadius:'22px',
          backdropFilter:'blur(14px)', overflow:'hidden',
          boxShadow:'0 0 50px rgba(34,197,94,.1), 0 20px 60px rgba(0,0,0,.35)',
          animation:'ps-fadein .6s cubic-bezier(.175,.885,.32,1.275) both',
        }}>
          {/* glow blob */}
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 75% 50% at 50% 0%, rgba(34,197,94,.18), transparent 70%)', pointerEvents:'none', animation:'ps-glow 3s ease-in-out infinite' }} />

          <div style={{ fontSize:'2.5rem', marginBottom:'.75rem', filter:'drop-shadow(0 0 16px rgba(34,197,94,.5))', zIndex:1 }}>🎯</div>

          <div style={{ fontFamily:'Inter,sans-serif', fontSize:'.72rem', fontWeight:800, letterSpacing:'.2em', textTransform:'uppercase', color:'rgba(34,197,94,.75)', marginBottom:'.65rem', zIndex:1 }}>
            PREDICTION RESULT
          </div>

          {/* BIG VALUE */}
          <div style={{
            fontFamily:'Space Grotesk,sans-serif',
            fontSize:'clamp(2.8rem, 6vw, 4.5rem)',
            fontWeight:900, lineHeight:1.05, letterSpacing:'-.03em',
            background:'linear-gradient(135deg, #fff 10%, #86efac 55%, #22c55e 100%)',
            WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent',
            marginBottom:'1.5rem', wordBreak:'break-all', zIndex:1,
          }}>
            {(() => {
              const p = result.prediction
              const n = parseFloat(p)
              return (!isNaN(n) && isFinite(n)) ? n.toFixed(3) : String(p)
            })()}

          </div>

          {/* badges */}
          <div style={{ display:'flex', gap:'.6rem', flexWrap:'wrap', justifyContent:'center', zIndex:1 }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:'.4rem', padding:'.35rem .9rem', borderRadius:'100px', fontSize:'.75rem', fontWeight:600, fontFamily:'JetBrains Mono,monospace', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.65)' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:T.green, boxShadow:`0 0 5px ${T.green}`, display:'inline-block' }} />
              {result.model_used}
            </span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:'.4rem', padding:'.35rem .9rem', borderRadius:'100px', fontSize:'.75rem', fontWeight:600, fontFamily:'JetBrains Mono,monospace', background:T.greenDim, border:`1px solid ${T.greenBdr}`, color:T.green, textTransform:'capitalize' }}>
              {result.task_type}
            </span>
          </div>
        </div>
      )}

      {/* ── HISTORY TABLE ── */}
      {history.length > 0 && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginBottom:'1rem' }}>
            <div style={{ fontFamily:'Space Grotesk,sans-serif', fontWeight:700, fontSize:'1rem', color:'#fff' }}>Prediction History</div>
            <span style={{ fontSize:'.72rem', fontWeight:700, fontFamily:'JetBrains Mono,monospace', color:T.green, background:T.greenDim, border:`1px solid ${T.greenBdr}`, padding:'.2rem .65rem', borderRadius:'100px' }}>{history.length} runs</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{Object.keys(history[0]).map(k => <th key={k}>{k}</th>)}</tr>
              </thead>
              <tbody>
                {history.map((row, i) => (
                  <tr key={i}>
                    {Object.entries(row).map(([k, v]) => (
                      <td key={k} className={k === 'Prediction' ? 'best' : ''}>
                        {(() => { const n = parseFloat(v); return (!isNaN(n) && isFinite(n)) ? n.toFixed(3) : String(v) })()}

                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
