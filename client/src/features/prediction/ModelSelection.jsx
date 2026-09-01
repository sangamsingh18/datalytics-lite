import { useEffect, useState } from 'react'
import client from '../../services/apiClient.js'
import { buildDatasetSyncPayload, isBackendDatasetReady } from '../dataset/datasetApi.js'
import { useToast } from '../../hooks/useToast.jsx'
import CustomDropdown from '../../components/common/CustomDropdown.jsx';

const IDENTIFIER_HINTS = ['id', 'uuid', 'guid', 'index', 'serial', 'code', 'employeeid', 'empid']
const TARGET_HINTS = ['target', 'label', 'class', 'status', 'attrition', 'churn', 'outcome', 'result', 'response', 'category', 'segment', 'rating', 'score', 'sales', 'revenue', 'price', 'amount']

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function columnValues(dataset, column) {
  return (dataset?.rows || [])
    .map((row) => row?.[column])
    .filter((value) => value !== null && value !== undefined && value !== '')
}

function isNumericLike(value) {
  return Number.isFinite(Number(value))
}

function isIdentifierLike(column, values) {
  const normalized = normalizeName(column)
  if (IDENTIFIER_HINTS.some((hint) => normalized.includes(hint)) || normalized.endsWith('id')) {
    return true
  }
  if (values.length < 12) return false
  const uniqueRatio = new Set(values.map((value) => String(value))).size / values.length
  const numericRatio = values.filter(isNumericLike).length / values.length
  return uniqueRatio >= 0.98 && numericRatio >= 0.8
}

function inferTaskType(dataset, column) {
  const values = columnValues(dataset, column)
  if (!values.length) return 'Classification'
  const uniqueCount = new Set(values.map((value) => String(value))).size
  const numericRatio = values.filter(isNumericLike).length / values.length
  return numericRatio >= 0.8 && uniqueCount > Math.min(20, Math.max(6, Math.floor(values.length * 0.1)))
    ? 'Regression'
    : 'Classification'
}

function targetScore(dataset, column) {
  const values = columnValues(dataset, column)
  if (!values.length) return -1000

  const normalized = normalizeName(column)
  const uniqueCount = new Set(values.map((value) => String(value))).size
  const uniqueRatio = uniqueCount / values.length
  const numericRatio = values.filter(isNumericLike).length / values.length
  const identifierLike = isIdentifierLike(column, values)

  let score = 0
  if (TARGET_HINTS.some((hint) => normalized.includes(hint))) score += 40
  if (identifierLike) score -= 80
  if (uniqueCount >= 2 && uniqueCount <= Math.max(12, Math.floor(values.length * 0.2))) score += 25
  if (numericRatio >= 0.8 && uniqueCount > Math.min(20, Math.max(8, Math.floor(values.length * 0.1)))) score += 12
  if (uniqueRatio >= 0.98) score -= 20
  return score
}

function defaultTargetColumn(dataset) {
  const columns = dataset?.columns || []
  if (!columns.length) return ''
  // ML convention: target is almost always the last column
  // Fall back to last non-identifier if last column looks like an ID
  const last = columns[columns.length - 1]
  if (last && !isIdentifierLike(last, columnValues(dataset, last))) return last
  return columns.find((col) => !isIdentifierLike(col, columnValues(dataset, col))) || columns[0]
}

function buildAutomaticPayload(dataset, overrides = {}) {
  const target_col = overrides.target_col || defaultTargetColumn(dataset)
  return {
    target_col,
    task_type: overrides.task_type || inferTaskType(dataset, target_col),
    missing_strategy: overrides.missing_strategy || 'Fill with mode (all)',
    encode_method: overrides.encode_method || 'Label Encoding',
    scaling_method: overrides.scaling_method || 'StandardScaler',
    test_size: overrides.test_size || 0.2,
    random_state: Number(overrides.random_state) || 42,
  }
}

async function syncDatasetForPrediction(dataset) {
  if (isBackendDatasetReady(dataset)) {
    return
  }

  const payload = buildDatasetSyncPayload(dataset, { replaceOriginal: true })

  try {
    await client.post('/data/sync', payload)
  } catch (error) {
    if (error?.response?.status !== 404) throw error
    await client.post('/visualization/sync', payload)
  }
}

function payloadChanged(left, right) {
  const keys = ['target_col', 'task_type', 'missing_strategy', 'encode_method', 'scaling_method', 'test_size', 'random_state']
  return keys.some((key) => left?.[key] !== right?.[key])
}

export default function OnClickPred({ dataset, onPreprocessed, setStatus }) {
  const { addToast } = useToast()
  const columns = dataset?.columns || []

  const [targetCol, setTargetCol] = useState('')
  const [taskType, setTaskType] = useState('Classification')
  const [missingStrategy, setMissingStrategy] = useState(dataset?.meta?.missingTotal === 0 ? 'None' : 'Fill with mode (all)')
  const [encoding, setEncoding] = useState('Auto')
  const [encodingRules, setEncodingRules] = useState([
    { method: 'One-Hot Encoding', columns: [] },
    { method: 'Label Encoding', columns: [] }
  ])
  const [scaling, setScaling] = useState('StandardScaler')
  const [testSize, setTestSize] = useState(20)
  const [randomState, setRandomState] = useState(42)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [success, setSuccess] = useState(false)

  // Set target to last column whenever the dataset changes (ML convention)
  useEffect(() => {
    if (!columns.length) { setTargetCol(''); return }
    const def = defaultTargetColumn(dataset)
    setTargetCol(def)
    setTaskType(inferTaskType(dataset, def))
  }, [dataset?.name, columns.join('|')])

  async function submitPreprocess(payload) {
    await syncDatasetForPrediction(dataset)
    return client.post('/preprocess', payload)
  }

  function applyResolvedState(responseData, payload) {
    const resolvedTarget = responseData?.target_col || payload.target_col
    const resolvedTask = responseData?.task_type || payload.task_type
    setTargetCol(resolvedTarget)
    setTaskType(resolvedTask)
    setWarnings(responseData?.encoding_warnings || [])
  }

  async function handleApply() {
    setLoading(true)
    setError(null)
    setWarnings([])
    setSuccess(false)

    const initialPayload = buildAutomaticPayload(dataset, {
      target_col: targetCol,
      task_type: taskType,
      missing_strategy: missingStrategy,
      encode_method: encoding === 'Manual' ? 'Manual' : encoding,
      manual_encoding_rules: encoding === 'Manual' ? encodingRules.filter(r => r.columns.length > 0) : [],
      scaling_method: scaling,
      test_size: Number(testSize) / 100,
      random_state: Number(randomState),
    })

    try {
      let response
      let usedPayload = initialPayload
      try {
        response = await submitPreprocess(initialPayload)
      } catch (firstError) {
        const fallbackPayload = buildAutomaticPayload(dataset, {
          missing_strategy: missingStrategy === 'None' ? 'None' : 'Fill with mode (all)',
          encode_method: 'Label Encoding',
          scaling_method: scaling === 'None' ? 'None' : 'StandardScaler',
          test_size: 0.2,
          random_state: Number(randomState) || 42,
        })

        if (!payloadChanged(initialPayload, fallbackPayload)) {
          throw firstError
        }

        response = await submitPreprocess(fallbackPayload)
        usedPayload = fallbackPayload
        addToast('Preprocessing settings were adjusted automatically to keep the pipeline running.', null, 'success')
      }

      if (!response) return

      applyResolvedState(response.data, usedPayload)

      if (setStatus) {
        setStatus((s) => ({
          ...s,
          preprocessing_done: true,
          preprocess_data: response.data,
          supervised_done: false,
          unsupervised_done: false,
        }))
      }

      if (onPreprocessed) onPreprocessed(response.data)

      setSuccess(true)
      setTimeout(() => {
        if (setStatus) {
          setStatus((s) => ({ ...s, current_module: 'supervised' }))
        }
      }, 1200)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Preprocessing failed. Please check your data and parameters.')
    } finally {
      setLoading(false)
    }
  }

  const duplicateColumns = [];
  if (encoding === 'Manual') {
    const colCounts = {};
    encodingRules.forEach(rule => {
      rule.columns.forEach(c => {
        colCounts[c] = (colCounts[c] || 0) + 1;
      });
    });
    for (const c in colCounts) {
      if (colCounts[c] > 1) duplicateColumns.push(c);
    }
  }

  const G = '#22c55e', Gd = 'rgba(34,197,94,.12)', Gb = 'rgba(34,197,94,.3)'
  const card = {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18, padding: '1.5rem 1.75rem', marginBottom: '1.25rem', backdropFilter: 'blur(8px)',
  }
  const sectionLabel = {
    display: 'flex', alignItems: 'center', gap: '.45rem',
    fontFamily: 'Space Grotesk,sans-serif', fontWeight: 700, fontSize: '.75rem',
    letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: '1rem',
  }
  const chipStyle = (active) => ({
    padding: '.55rem 1.15rem', borderRadius: 100, cursor: 'pointer',
    fontFamily: 'Space Grotesk,sans-serif', fontWeight: 700, fontSize: '.82rem',
    border: `1.5px solid ${active ? Gb : 'rgba(255,255,255,0.1)'}`,
    background: active ? Gd : 'rgba(255,255,255,0.04)',
    color: active ? G : 'rgba(255,255,255,0.5)',
    transition: 'all .18s ease', outline: 'none',
  })
  const selectStyle = {
    width: '100%', padding: '.75rem 1rem', borderRadius: 10,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '.9rem', fontFamily: 'Space Grotesk,sans-serif',
    fontWeight: 600, outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ fontFamily: 'Inter,sans-serif' }}>

      {/* HEADER */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.4rem' }}>
          <span style={{ fontSize: '1.4rem' }}>⚙️</span>
          <h1 style={{ margin: 0, fontFamily: 'Space Grotesk,sans-serif', fontWeight: 800, fontSize: '1.65rem', color: '#fff' }}>Data Preprocessing</h1>
        </div>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.38)', fontSize: '.85rem', paddingLeft: '2.1rem' }}>Configure cleaning, encoding, and scaling before training models.</p>
      </div>

      {/* TARGET COLUMN & TASK */}
      <div style={card}>
        <div style={sectionLabel}><span>🎯</span> Target Column &amp; Task</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Target Column</div>
            <CustomDropdown value={targetCol} onChange={(val) => setTargetCol(val)} style={selectStyle}>
              {columns.map((col) => <option key={col} value={col} style={{ background: '#1a1a2e' }}>{col}</option>)}
            </CustomDropdown>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Task Type</div>
            <div style={{ display: 'flex', gap: '.6rem' }}>
              {[{ v: 'Classification', i: '🏷️' }, { v: 'Regression', i: '📈' }].map(({ v, i }) => (
                <button key={v} type="button" onClick={() => setTaskType(v)} style={{ ...chipStyle(taskType === v), flex: 1 }}>{i} {v}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MISSING VALUES */}
      <div style={card}>
        <div style={sectionLabel}><span>🩹</span> Missing Values</div>
        <CustomDropdown value={missingStrategy} onChange={(val) => setMissingStrategy(val)} style={selectStyle}>
          <option value="None" style={{ background: '#1a1a2e', color: '#10b981' }}>None (Already Cleaned in Data Preparation)</option>
          <option value="Drop rows with missing values" style={{ background: '#1a1a2e' }}>Drop rows with missing values</option>
          <option value="Fill with mean (numeric)" style={{ background: '#1a1a2e' }}>Fill with mean (numeric)</option>
          <option value="Fill with median (numeric)" style={{ background: '#1a1a2e' }}>Fill with median (numeric)</option>
          <option value="Fill with mode (all)" style={{ background: '#1a1a2e' }}>Fill with mode (all)</option>
        </CustomDropdown>
      </div>

      {/* ENCODING */}
      <div style={card}>
        <div style={sectionLabel}><span>🔠</span> Encoding Strategy</div>
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {[{ v: 'Auto', i: '⚡' }, { v: 'Manual', i: '🛠️' }, { v: 'No Encoding', i: '🚫' }].map(({ v, i }) => (
            <button key={v} type="button" onClick={() => setEncoding(v)} style={chipStyle(encoding === v)}>{i} {v}</button>
          ))}
        </div>

        {encoding === 'Manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {encodingRules.map((rule, idx) => (
              <div key={idx} style={{ 
                padding: '1.25rem', borderRadius: 14, background: 'rgba(255,255,255,0.02)', 
                border: '1px solid rgba(255,255,255,0.06)', position: 'relative' 
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Method</div>
                    <div style={{ 
                      ...selectStyle, 
                      cursor: 'default', 
                      background: 'rgba(0,0,0,0.2)', 
                      color: 'rgba(255,255,255,0.8)' 
                    }}>
                      {rule.method}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Columns</div>
                    <div style={{ 
                      display: 'flex', flexWrap: 'wrap', gap: '.5rem', padding: '.5rem', 
                      minHeight: '42px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' 
                    }}>
                      {columns.map(col => {
                        const isSelected = rule.columns.includes(col)
                        return (
                          <button
                            key={col}
                            type="button"
                            onClick={() => {
                              const newRules = [...encodingRules]
                              if (isSelected) {
                                newRules[idx].columns = newRules[idx].columns.filter(c => c !== col)
                              } else {
                                // Prevent selecting same column in different manual rules for simplicity in UI
                                // but allow if user wants to override (backend will handle)
                                newRules[idx].columns = [...newRules[idx].columns, col]
                              }
                              setEncodingRules(newRules)
                            }}
                            style={{
                              padding: '.3rem .7rem', borderRadius: 8, fontSize: '.75rem', fontWeight: 600,
                              background: isSelected ? Gd : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${isSelected ? Gb : 'rgba(255,255,255,0.1)'}`,
                              color: isSelected ? G : 'rgba(255,255,255,0.4)',
                              transition: 'all .15s ease'
                            }}
                          >
                            {col}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FEATURE SCALING */}
      <div style={card}>
        <div style={sectionLabel}><span>⚖️</span> Feature Scaling</div>
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
          {[{ v: 'None', i: '∅' }, { v: 'StandardScaler', i: '📊' }, { v: 'MinMaxScaler', i: '📐' }].map(({ v, i }) => (
            <button key={v} type="button" onClick={() => setScaling(v)} style={chipStyle(scaling === v)}>{i} {v}</button>
          ))}
        </div>
      </div>

      {/* TRAIN-TEST SPLIT */}
      <div style={card}>
        <div style={sectionLabel}><span>✂️</span> Train-Test Split</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.6rem' }}>
              <span style={{ fontSize: '.78rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Test Size</span>
              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '.82rem', fontWeight: 700, color: G }}>{testSize}%</span>
            </div>
            <input type="range" min="10" max="50" value={testSize} onChange={(e) => setTestSize(e.target.value)}
              style={{ width: '100%', accentColor: G }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.3rem' }}>
              <span style={{ fontSize: '.68rem', color: 'rgba(255,255,255,0.22)' }}>10%</span>
              <span style={{ fontSize: '.68rem', color: 'rgba(255,255,255,0.22)' }}>50%</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: '.6rem' }}>Random State</div>
            <input type="number" value={randomState} onChange={(e) => setRandomState(e.target.value)}
              style={{ width: '100%', padding: '.65rem 1rem', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '.9rem', fontFamily: 'JetBrains Mono,monospace', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      {/* ALERTS */}
      {duplicateColumns.length > 0 && <div style={{ padding: '1rem 1.25rem', borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'rgba(252,165,165,.85)', fontSize: '.83rem', marginBottom: '1.25rem' }}>⚠️ <strong>Duplicate Encoding:</strong> Column(s) ({duplicateColumns.join(', ')}) have multiple encodings applied. Please select only one encoding per column.</div>}
      {warnings.length > 0 && <div style={{ padding: '1rem 1.25rem', borderRadius: 12, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', color: 'rgba(253,230,138,.85)', fontSize: '.83rem', marginBottom: '1.25rem' }}>⚠️ {warnings.join(' ')}</div>}
      {error && <div style={{ padding: '1rem 1.25rem', borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'rgba(252,165,165,.85)', fontSize: '.83rem', marginBottom: '1.25rem' }}>❌ {error}</div>}
      {success && <div style={{ padding: '1rem 1.25rem', borderRadius: 12, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', color: 'rgba(134,239,172,.85)', fontSize: '.83rem', marginBottom: '1.25rem' }}>✅ Preprocessing complete. Supervised models are now unlocked.</div>}

      {/* SUBMIT */}
      <button type="button" onClick={handleApply} disabled={loading || columns.length === 0 || duplicateColumns.length > 0}
        style={{
          width: '100%', padding: '1rem 2rem', borderRadius: 14, border: 'none', color: '#fff',
          fontSize: '1rem', fontFamily: 'Space Grotesk,sans-serif', fontWeight: 800, letterSpacing: '.04em',
          background: loading ? 'rgba(34,197,94,.5)' : 'linear-gradient(135deg,#16a34a 0%,#22c55e 60%,#4ade80 100%)',
          cursor: (loading || columns.length === 0 || duplicateColumns.length > 0) ? 'not-allowed' : 'pointer',
          boxShadow: loading ? 'none' : '0 8px 32px rgba(34,197,94,.35)',
          opacity: (columns.length === 0 || duplicateColumns.length > 0) ? .5 : 1, transition: 'all .2s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem',
        }}>
        {loading
          ? <><span style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin .7s linear infinite' }} /> Processing…</>
          : <><span style={{ fontSize: '1.1rem' }}>🚀</span> Apply Preprocessing</>}
      </button>
    </div>
  )
}
