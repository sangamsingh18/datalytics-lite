import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'

// Layout
import Sidebar from './components/layout/Sidebar.jsx'
import Navbar from './components/layout/Navbar.jsx'

// Common
import GlowButton from './components/common/Button.jsx'
import GlassModal from './components/common/Modal.jsx'
import ErrorBoundary from './components/common/ErrorMessage.jsx'
import GlobalRuntimeGuard from './components/common/GlobalRuntimeGuard.jsx'

// Features
import FileUpload from './features/dataset/FileUpload.jsx'
import DataPreparationStep from './features/preparation/DataPreparationStep.jsx'
import ModelSelection from './features/prediction/ModelSelection.jsx'
import Training from './features/prediction/Training.jsx'
import UnsupervisedStep from './features/prediction/UnsupervisedStep.jsx'
import PredictionResult from './features/prediction/PredictionResult.jsx'
import PredictionForm from './features/prediction/PredictionForm.jsx'
import DownloadStep from './features/prediction/DownloadStep.jsx'
import GoogleLogin from './features/authentication/GoogleLogin.jsx'

// Pages
import LandingPage from './pages/LandingPage.jsx'

// Hooks & Services
import { useDataset } from './hooks/useDataset.js'
import { ToastProvider } from './hooks/useToast.jsx'
import { useDiamonds } from './hooks/useDiamonds.jsx'
import apiClient from './services/apiClient.js'
import {
  HiOutlineBolt,
  HiOutlineUsers,
} from 'react-icons/hi2'

// Lazy-loaded heavy modules
const ExploreStep       = lazy(() => import('./features/exploration/ExploreStep.jsx'))
const VisualizationStep = lazy(() => import('./features/visualization/VisualizationStep.jsx'))
const DecisionMakingStep = lazy(() => import('./features/prediction/DecisionMakingStep.jsx'))
const ReportDownload    = lazy(() => import('./features/reports/ReportDownload.jsx'))
const ProfilePage       = lazy(() => import('./features/profile/Profile.jsx'))
const Chatbot           = lazy(() => import('./components/chatbot/Chatbot.jsx'))

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_COMPLETED = {
  upload: false,
  preparation: false,
  exploration: false,
  visualization: false,
  prediction: false,
  decisionMaking: false,
  reports: false,
}

const DEFAULT_PREDICTION_STATE = {
  supervised: {
    linear:   { status: 'idle', progress: 0, metrics: null },
    logistic: { status: 'idle', progress: 0, metrics: null },
    tree:     { status: 'idle', progress: 0, metrics: null },
    forest:   { status: 'idle', progress: 0, metrics: null },
  },
  unsupervised: {
    kmeans: { status: 'idle', progress: 0, metrics: null },
    pca:    { status: 'idle', progress: 0, metrics: null },
  },
  bestModel: null,
  selectedModel: 'Random Forest',
  predictions: [],
  batchPredictions: [],
  inputs: {},
  downloadReady: false,
  completed: {
    supervised: false,
    unsupervised: false,
    best: false,
    predict: false,
    download: false,
  },
}

const DEFAULT_PREDICTION_STATUS = {
  preprocessing_done: false,
  supervised_done: false,
  unsupervised_done: false,
  best_done: false,
  predict_done: false,
  download_done: false,
  preprocess_data: null,
  has_predictions: false,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeDataset(dataset) {
  if (!dataset) return null
  const rows = dataset.rows || dataset.sample_rows || dataset.preview || []
  const columns = dataset.columns || dataset.all_columns || (rows[0] ? Object.keys(rows[0]) : [])
  return { name: dataset.name || 'Dataset', rows, columns, meta: dataset.meta || dataset }
}

function setDatasetSyncState(dataset, { backendManaged, needsBackendSync }) {
  if (!dataset) return dataset
  return { ...dataset, meta: { ...(dataset.meta || {}), backend_managed: backendManaged, needs_backend_sync: needsBackendSync } }
}

function StepLoader({ label }) {
  return (
    <div className="card">
      <div className="section-title">Loading {label}</div>
      <p style={{ marginTop: '0.6rem', color: 'var(--text-secondary, #94a3b8)' }}>Preparing workspace module...</p>
    </div>
  )
}

function getStepLabel(step) {
  const labels = {
    upload: 'Dataset Upload', preparation: 'Data Preparation',
    exploration: 'Data Exploration', visualization: 'Visualization',
    prediction: 'Prediction', decisionMaking: 'Decision Making',
    reports: 'Reports', profile: 'Profile',
  }
  return labels[step] || 'Dashboard'
}

// ─── Analytics Workspace ─────────────────────────────────────────────────────
function AnalyticsWorkspace() {
  const navigate = useNavigate()
  const { dataset, profile: datasetProfile, setDataset, clearDataset } = useDataset()
  const [authProfile, setAuthProfile] = useState(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [profileAvatar, setProfileAvatar] = useState(null)
  const { deductDiamonds, InsufficientDiamondsAlert } = useDiamonds()
  const profileVisitKeyRef = useRef(0)
  const [profileVisitKey, setProfileVisitKey] = useState(0)
  const chargedStepsRef = useRef(new Set())

  const [step, setStep] = useState('upload')
  const [completedSteps, setCompletedSteps] = useState(DEFAULT_COMPLETED)
  const [predictionModule, setPredictionModule] = useState('preprocessing')
  const [predictionState, setPredictionState] = useState(DEFAULT_PREDICTION_STATE)
  const [predictionStatus, setPredictionStatus] = useState(DEFAULT_PREDICTION_STATUS)
  const [vizConfig, setVizConfig] = useState({ chartType: 'Bar', x: '', y: '', filterColumn: '', filterValues: [] })
  const [savedCharts, setSavedCharts] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarHoverPeek, setSidebarHoverPeek] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [quickPanelOpen, setQuickPanelOpen] = useState(false)
  const sidebarCloseTimerRef = useRef(null)
  const sidebarHoverPeekRef = useRef(false)
  const sidebarPointerFrameRef = useRef(null)
  const immersiveSidebarAutoHide = step === 'visualization' && !isMobile

  function clearSidebarCloseTimer() {
    if (sidebarCloseTimerRef.current) { window.clearTimeout(sidebarCloseTimerRef.current); sidebarCloseTimerRef.current = null }
  }
  function openSidebarHoverPeek() { clearSidebarCloseTimer(); setSidebarHoverPeek((c) => c ? c : true) }
  function scheduleSidebarHoverClose() {
    clearSidebarCloseTimer()
    sidebarCloseTimerRef.current = window.setTimeout(() => { setSidebarHoverPeek(false); sidebarCloseTimerRef.current = null }, 180)
  }

  useEffect(() => {
    function syncViewport() {
      const mobile = window.innerWidth <= 900
      setIsMobile(mobile); setSidebarCollapsed(mobile); setSidebarOpen(false)
    }
    syncViewport(); window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  async function chargeStepIfNeeded(stepKey, { force = false } = {}) {
    if (!stepKey) return true
    if (!force && (completedSteps[stepKey] || chargedStepsRef.current.has(stepKey))) return true
    const ok = await deductDiamonds(50)
    if (ok) chargedStepsRef.current.add(stepKey)
    return ok
  }

  async function handleStepChange(nextStep) {
    setQuickPanelOpen(false)
    if (dataset && nextStep === 'prediction') {
      const ok = await chargeStepIfNeeded(nextStep)
      if (!ok) return
    }
    if (isMobile) {
      setSidebarOpen(false)
      setTimeout(() => {
        setStep(nextStep)
        document.querySelector('.ds-content')?.scrollTo({ top: 0, behavior: 'instant' })
        if (nextStep === 'profile') { profileVisitKeyRef.current += 1; setProfileVisitKey(profileVisitKeyRef.current) }
      }, 120)
    } else {
      setStep(nextStep)
      document.querySelector('.ds-content')?.scrollTo({ top: 0, behavior: 'instant' })
      if (nextStep === 'profile') { profileVisitKeyRef.current += 1; setProfileVisitKey(profileVisitKeyRef.current) }
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      try {
        const base64Url = token.split('.')[1]
        if (!base64Url) throw new Error('Missing token payload')
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
        const payload = JSON.parse(jsonPayload)
        const email = payload.sub

        apiClient.get('/auth/me')
          .then((res) => {
            const user = res.data || {}
            setAuthProfile({
              fullName: user.fullName || payload.name || 'Datalytics User',
              email: user.email || email,
              role: 'Workspace Member',
              joinedAt: user.joined_at || payload.joined_at,
              provider: user.provider || payload.provider || 'google',
              plan: user.plan || payload.plan || 'None',
              diamonds: Number(user.diamonds ?? payload.diamonds ?? 0),
            })
          })
          .catch(() => {
            localStorage.removeItem('auth_token')
            setAuthProfile(null)
          })

        const avatarKey = `datalytics-profile-avatar-${email}`
        const savedAvatar = localStorage.getItem(avatarKey) || localStorage.getItem('datalytics-profile-avatar')
        if (savedAvatar) setProfileAvatar(savedAvatar)
      } catch (err) {
        console.error('Invalid token', err)
        localStorage.removeItem('auth_token')
        setAuthProfile(null)
      }
    }
    setAuthChecking(false)
  }, [])

  useEffect(() => { sidebarHoverPeekRef.current = sidebarHoverPeek }, [sidebarHoverPeek])
  useEffect(() => { if (!immersiveSidebarAutoHide) { clearSidebarCloseTimer(); setSidebarHoverPeek(false) } }, [immersiveSidebarAutoHide])
  useEffect(() => () => { clearSidebarCloseTimer(); if (sidebarPointerFrameRef.current) { cancelAnimationFrame(sidebarPointerFrameRef.current); sidebarPointerFrameRef.current = null } }, [])

  useEffect(() => {
    if (!immersiveSidebarAutoHide) return undefined
    function handlePointerMove(e) {
      const x = e.clientX
      if (sidebarPointerFrameRef.current) cancelAnimationFrame(sidebarPointerFrameRef.current)
      sidebarPointerFrameRef.current = requestAnimationFrame(() => {
        sidebarPointerFrameRef.current = null
        if (x <= 18 || (sidebarHoverPeekRef.current && x <= 308)) { openSidebarHoverPeek(); return }
        scheduleSidebarHoverClose()
      })
    }
    function handlePointerLeave(e) { if (e.relatedTarget) return; scheduleSidebarHoverClose() }
    window.addEventListener('mousemove', handlePointerMove, { passive: true })
    window.addEventListener('mouseout', handlePointerLeave)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseout', handlePointerLeave)
      if (sidebarPointerFrameRef.current) { cancelAnimationFrame(sidebarPointerFrameRef.current); sidebarPointerFrameRef.current = null }
    }
  }, [immersiveSidebarAutoHide])

  useEffect(() => { if (dataset && !completedSteps.upload) setCompletedSteps((p) => ({ ...p, upload: true })) }, [dataset, completedSteps.upload])

  useEffect(() => {
    if (!datasetProfile) return
    const defaultX = datasetProfile.categoricalColumns[0] || datasetProfile.columns[0] || ''
    const defaultY = datasetProfile.numericColumns[0] || datasetProfile.columns[1] || datasetProfile.columns[0] || ''
    setVizConfig((p) => ({ ...p, x: p.x || defaultX, y: p.y || defaultY, filterColumn: p.filterColumn || defaultX }))
  }, [datasetProfile])

  useEffect(() => {
    const done = Boolean(predictionStatus.supervised_done || predictionStatus.unsupervised_done || predictionStatus.best_done || predictionStatus.predict_done || predictionStatus.download_done)
    if (done && !completedSteps.prediction) setCompletedSteps((p) => ({ ...p, prediction: true }))
  }, [predictionStatus, completedSteps.prediction])

  useEffect(() => {
    function handleOpenPricing() { handleStepChange('profile'); window.setTimeout(() => window.dispatchEvent(new CustomEvent('datalytics:profile-open-pricing')), 400) }
    window.addEventListener('datalytics:open-pricing', handleOpenPricing)
    return () => window.removeEventListener('datalytics:open-pricing', handleOpenPricing)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { document.querySelector('.ds-content')?.scrollTo({ top: 0, behavior: 'instant' }); window.scrollTo({ top: 0, behavior: 'instant' }) }, 10)
    return () => clearTimeout(t)
  }, [step])

  function markComplete(stepKey) { chargedStepsRef.current.add(stepKey); setCompletedSteps((p) => ({ ...p, [stepKey]: true })) }

  function handleDatasetChange(nextDataset) {
    const n = normalizeDataset(nextDataset); setDataset(n)
    setPredictionState(DEFAULT_PREDICTION_STATE); setPredictionModule('preprocessing')
    setPredictionStatus(DEFAULT_PREDICTION_STATUS); setSavedCharts([])
    setVizConfig({ chartType: 'Bar', x: '', y: '', filterColumn: '', filterValues: [] })
    chargedStepsRef.current = n ? new Set(['upload']) : new Set()
    setCompletedSteps({ ...DEFAULT_COMPLETED, upload: Boolean(n) })
  }

  async function handlePreparationContinue(nextDataset, hasChanges) {
    const ok = await chargeStepIfNeeded('preparation')
    if (!ok) return
    if (hasChanges) {
      const n = setDatasetSyncState(normalizeDataset(nextDataset), { backendManaged: false, needsBackendSync: true })
      setDataset(n); setPredictionState(DEFAULT_PREDICTION_STATE); setPredictionModule('preprocessing')
      setPredictionStatus(DEFAULT_PREDICTION_STATUS); setSavedCharts([])
      setVizConfig({ chartType: 'Bar', x: '', y: '', filterColumn: '', filterValues: [] })
      setCompletedSteps({ ...DEFAULT_COMPLETED, upload: Boolean(n), exploration: Boolean(n), preparation: Boolean(n) })
    } else {
      setCompletedSteps((p) => ({ ...p, preparation: Boolean(nextDataset) }))
    }
    setStep('visualization'); if (isMobile) setSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleExplorationDatasetUpdate(nextDataset) {
    const n = setDatasetSyncState(normalizeDataset(nextDataset), { backendManaged: true, needsBackendSync: false })
    setDataset(n); setPredictionState(DEFAULT_PREDICTION_STATE); setPredictionModule('preprocessing')
    setPredictionStatus(DEFAULT_PREDICTION_STATUS); setSavedCharts([])
    setVizConfig({ chartType: 'Bar', x: '', y: '', filterColumn: '', filterValues: [] })
    setCompletedSteps({ ...DEFAULT_COMPLETED, upload: Boolean(n), preparation: Boolean(n), exploration: Boolean(n) })
  }

  function handleResetWorkflow() {
    clearDataset(); setPredictionState(DEFAULT_PREDICTION_STATE); setPredictionModule('preprocessing')
    setPredictionStatus(DEFAULT_PREDICTION_STATUS); setSavedCharts([])
    setVizConfig({ chartType: 'Bar', x: '', y: '', filterColumn: '', filterValues: [] })
    chargedStepsRef.current.clear(); setCompletedSteps(DEFAULT_COMPLETED); setStep('upload'); setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const predictionModules = [
    { key: 'preprocessing', label: 'Data Preprocessing',  icon: '01' },
    { key: 'supervised',    label: 'Supervised Models',    icon: '02' },
    { key: 'unsupervised',  label: 'Unsupervised Models',  icon: '03' },
    { key: 'best',          label: 'Best Model Selection', icon: '04' },
    { key: 'predict',       label: 'Prediction',           icon: '05' },
    { key: 'download',      label: 'Download Results',     icon: '06' },
  ]

  const predictionStatusMap = {
    preprocessing: 'preprocessing_done', supervised: 'supervised_done',
    unsupervised: 'unsupervised_done', best: 'best_done', predict: 'predict_done', download: 'download_done',
  }

  function renderPredictionContent() {
    switch (predictionModule) {
      case 'preprocessing': return <ModelSelection dataset={dataset} setStatus={setPredictionStatus} />
      case 'supervised':    return <Training preprocessData={predictionStatus.preprocess_data} status={predictionStatus} onTrained={() => setPredictionStatus((s) => ({ ...s, supervised_done: true }))} setStatus={setPredictionStatus} />
      case 'unsupervised':  return <UnsupervisedStep status={predictionStatus} setStatus={setPredictionStatus} />
      case 'best':          return <PredictionResult status={predictionStatus} setStatus={setPredictionStatus} />
      case 'predict':       return <PredictionForm trainData={predictionStatus.preprocess_data} status={predictionStatus} setStatus={setPredictionStatus} />
      case 'download':      return <DownloadStep trainData={predictionStatus.preprocess_data} preprocessData={predictionStatus.preprocess_data} status={predictionStatus} setStatus={setPredictionStatus} />
      default: return null
    }
  }

  function renderPrediction() {
    return (
      <div className="prediction-layout">
        <div className="prediction-subnav">
          <div className="prediction-subnav-header">
            <span className="prediction-subnav-title">Prediction</span>
            <span className="prediction-subnav-sub">ML Pipeline</span>
          </div>
          <nav className="prediction-subnav-list">
            {predictionModules.map((mod) => {
              const isActive = predictionModule === mod.key
              const isDone = predictionStatus[predictionStatusMap[mod.key]]
              return (
                <button key={mod.key} type="button"
                  className={`pred-subnav-item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                  onClick={() => { setPredictionModule(mod.key); setPredictionStatus((s) => ({ ...s, current_module: mod.key })) }}
                >
                  <span className="pred-subnav-step">{mod.icon}</span>
                  <span className="pred-subnav-label">{mod.label}</span>
                  {isDone && <span className="pred-subnav-done-dot" />}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="prediction-content">{renderPredictionContent()}</div>
      </div>
    )
  }

  function renderStep() {
    switch (step) {
      case 'upload':
        return <FileUpload dataset={dataset} datasetProfile={datasetProfile} onDatasetChange={handleDatasetChange} onComplete={markComplete} onBeforeUpload={() => chargeStepIfNeeded('upload', { force: true })} onReset={handleResetWorkflow} />
      case 'preparation':
        return <DataPreparationStep dataset={dataset} datasetProfile={datasetProfile} onContinue={handlePreparationContinue} onJumpToUpload={() => handleStepChange('upload')} />
      case 'exploration':
        return (
          <Suspense fallback={<StepLoader label="exploration" />}>
            <ExploreStep dataset={dataset} datasetProfile={datasetProfile} explorationReady={completedSteps.exploration} onComplete={markComplete} onDatasetUpdate={handleExplorationDatasetUpdate} onJumpToUpload={() => handleStepChange('upload')} />
          </Suspense>
        )
      case 'visualization':
        return (
          <Suspense fallback={<StepLoader label="visualization" />}>
            <VisualizationStep dataset={dataset} datasetProfile={datasetProfile} vizConfig={vizConfig} setVizConfig={setVizConfig}
              onAddChart={(chart) => setSavedCharts((p) => [chart, ...p].slice(0, 8))}
              onComplete={markComplete} onBeforeVisualize={() => chargeStepIfNeeded('visualization')}
              onContinueToPrediction={() => { markComplete('visualization'); setPredictionModule('preprocessing'); setPredictionStatus((c) => ({ ...c, current_module: 'preprocessing' })); handleStepChange('prediction') }}
              onJumpToUpload={() => handleStepChange('upload')}
            />
          </Suspense>
        )
      case 'prediction': return renderPrediction()
      case 'decisionMaking':
        return (
          <Suspense fallback={<StepLoader label="decision making" />}>
            <DecisionMakingStep
              dataset={dataset}
              datasetProfile={datasetProfile}
              onComplete={markComplete}
              onBeforeEvaluate={() => chargeStepIfNeeded('decisionMaking')}
              onJumpToUpload={() => handleStepChange('upload')}
            />
          </Suspense>
        )
      case 'reports':
        return (
          <Suspense fallback={<StepLoader label="reports" />}>
            <ReportDownload dataset={dataset} datasetProfile={datasetProfile} predictionStatus={predictionStatus} vizConfig={vizConfig} savedCharts={savedCharts} onComplete={markComplete} onBeforeGenerate={() => chargeStepIfNeeded('reports')} onJumpToUpload={() => handleStepChange('upload')} />
          </Suspense>
        )
      case 'profile':
        return (
          <Suspense fallback={<StepLoader label="profile" />}>
            <ProfilePage key={profileVisitKey} dataset={dataset} datasetProfile={datasetProfile} savedCharts={savedCharts} predictionStatus={predictionStatus} completedSteps={completedSteps} authProfile={authProfile} onNavigate={handleStepChange} profileAvatar={profileAvatar} setProfileAvatar={setProfileAvatar} />
          </Suspense>
        )
      default: return null
    }
  }

  if (authChecking) {
    return <div className="fixed inset-0 flex items-center justify-center bg-[#050811]"><div className="w-8 h-8 rounded-full border-4 border-t-indigo-400 border-indigo-400/20 animate-spin" /></div>
  }

  if (!authProfile) {
    return <GoogleLogin onClose={() => {}} onSuccess={(user) => setAuthProfile({ fullName: user.fullName || 'Datalytics User', email: user.email, role: 'Workspace Member', provider: user.provider || 'google', plan: user.plan || 'None', diamonds: user.diamonds })} />
  }

  const profileName = authProfile?.fullName || 'Datalytics User'
  const profileRole = authProfile?.role || 'Analytics Workspace'
  const initialsMatch = profileName.match(/\b\w/g) || []
  const profileInitials = ((initialsMatch[0] || '') + (initialsMatch[1] || '')).toUpperCase() || 'DL'

  return (
    <div className={`ds-shell${immersiveSidebarAutoHide ? ' has-immersive-sidebar' : ''}`}>
      <InsufficientDiamondsAlert />
      <Sidebar
        currentStep={step} setStep={handleStepChange}
        predictionModule={predictionModule} setPredictionModule={setPredictionModule}
        predictionStatus={{ ...predictionStatus, setStatus: setPredictionStatus }}
        completedSteps={completedSteps} predictionState={predictionState}
        dataset={dataset} datasetProfile={datasetProfile} authProfile={authProfile}
        collapsed={immersiveSidebarAutoHide ? false : sidebarCollapsed}
        mobileOpen={sidebarOpen} autoHide={immersiveSidebarAutoHide} hoverPeek={sidebarHoverPeek}
        onToggleCollapse={() => { if (isMobile) { setSidebarOpen((v) => !v); return } if (immersiveSidebarAutoHide) { scheduleSidebarHoverClose(); return } setSidebarCollapsed((v) => !v) }}
        onCloseMobile={() => setSidebarOpen(false)}
        progress={{ completedCount: Object.values(completedSteps).filter(Boolean).length, totalSteps: Object.keys(completedSteps).length }}
      />
      <div className="ds-main">
        <Navbar
          stepLabel={getStepLabel(step)} onMenuToggle={() => setSidebarOpen((v) => !v)}
          onProfileOpen={() => handleStepChange('profile')} onOpenSettings={() => handleStepChange('reports')}
          onLogout={async () => {
            const token = localStorage.getItem('auth_token')
            try { if (token) await apiClient.post('/auth/logout') } catch {}
            localStorage.removeItem('auth_token'); localStorage.removeItem('datalytics-notifications')
            setAuthProfile(null); navigate('/')
          }}
          profileName={profileName} profileRole={profileRole} profileInitials={profileInitials} profileAvatar={profileAvatar}
        />
        <main className={`ds-content${step === 'prediction' ? ' is-prediction' : ''}`}>
          <section className="ds-workspace-panel">
            <div className="content-fade" key={step}>{renderStep()}</div>
          </section>
        </main>
        <footer className="ds-footer">Datalytics v2.0 | End-to-end Data Analytics &amp; Machine Learning Platform</footer>
      </div>

      <GlassModal open={quickPanelOpen} title="Quick Actions" onClose={() => setQuickPanelOpen(false)}
        footer={<GlowButton variant="ghost" size="sm" onClick={() => setQuickPanelOpen(false)}>Close</GlowButton>}
      >
        <div className="ds-modal-grid">
          <button type="button" className="ds-modal-action" onClick={() => handleStepChange('preparation')}><HiOutlineBolt /><span><strong>Continue Pipeline</strong><small>Jump back into data preparation</small></span></button>
          <button type="button" className="ds-modal-action" onClick={() => handleStepChange('profile')}><HiOutlineUsers /><span><strong>View Profile</strong><small>Open user profile and settings</small></span></button>
        </div>
      </GlassModal>

      <Suspense fallback={null}>
        <Chatbot dataset={dataset} datasetProfile={datasetProfile} profileAvatar={profileAvatar} profileInitials={profileInitials} />
      </Suspense>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ToastProvider>
      <GlobalRuntimeGuard>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<AnalyticsWorkspace />} />
            <Route path="/app/*" element={<AnalyticsWorkspace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </GlobalRuntimeGuard>
    </ToastProvider>
  )
}
