import { useState } from 'react'
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowUpTray,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlassCircle,
  HiOutlinePresentationChartBar,
  HiOutlineUser,
  HiOutlineXMark,
  HiOutlineLightBulb,
} from 'react-icons/hi2'

const NAV_ITEMS = [
  { key: 'upload',        label: 'Dataset Upload',  icon: HiOutlineArrowUpTray },
  { key: 'exploration',   label: 'Data Exploration', icon: HiOutlineMagnifyingGlassCircle },
  { key: 'preparation',   label: 'Data Preparation', icon: HiOutlineAdjustmentsHorizontal },
  { key: 'visualization', label: 'Visualization',    icon: HiOutlinePresentationChartBar },
  { key: 'prediction',    label: 'Prediction',       icon: HiOutlineCpuChip },
  { key: 'decisionMaking',label: 'Decision Making',  icon: HiOutlineLightBulb },
  { key: 'reports',       label: 'Reports',          icon: HiOutlineDocumentText },
]

const DEFAULT_COMPLETED_FALLBACK = {}
const DEFAULT_PREDICTION_FALLBACK = { completed: {} }

export default function Sidebar({
  currentStep,
  setStep,
  predictionModule,
  setPredictionModule,
  predictionStatus = {},
  completedSteps = DEFAULT_COMPLETED_FALLBACK,
  predictionState = DEFAULT_PREDICTION_FALLBACK,
  dataset,
  datasetProfile,
  authProfile,
  collapsed,
  mobileOpen,
  autoHide,
  hoverPeek,
  onToggleCollapse,
  onCloseMobile,
  progress,
}) {
  const compact = collapsed && !mobileOpen
  const safeCompletedSteps = completedSteps || {}
  const totalSteps = NAV_ITEMS.length
  const completedCount = progress?.completedCount || Object.values(safeCompletedSteps).filter(Boolean).length
  const completionRate = totalSteps ? Math.round((completedCount / totalSteps) * 100) : 0
  const datasetRows = datasetProfile?.totalRowCount || datasetProfile?.rowCount || dataset?.rows?.length || 0
  const datasetCols = datasetProfile?.totalColumnCount || datasetProfile?.columnCount || dataset?.columns?.length || 0

  function closeIfMobile() {
    if (typeof onCloseMobile === 'function') onCloseMobile()
  }

  function handleNavigate(stepKey) {
    setStep(stepKey)
    if (stepKey === 'prediction') setPredictionModule('preprocessing')
    closeIfMobile()
  }

  return (
    <>
      <div
        className={`ds-sidebar-backdrop ${mobileOpen ? 'is-visible' : ''}`}
        onClick={closeIfMobile}
      />

      <aside
        className={[
          'ds-sidebar',
          compact ? 'is-collapsed' : '',
          autoHide ? 'is-auto-hidden' : '',
          autoHide && hoverPeek ? 'is-hover-peek' : '',
          mobileOpen ? 'is-mobile-open' : '',
        ]
          .join(' ')
          .trim()}
      >
        <div className="ds-sidebar-glow" />

        <div className="ds-sidebar-head" style={{ paddingTop: '12px' }}>
          <a
            href="/"
            className={`flex items-center ${compact ? 'justify-center p-2 mx-1 rounded-[16px]' : 'gap-3 px-4 py-3 mx-2 rounded-[20px]'} bg-slate-900/60 border border-white/5 shadow-lg relative overflow-hidden group cursor-pointer hover:bg-slate-800/60 transition-colors`}
            style={{ marginTop: '-12px', textDecoration: 'none' }}
          >
            {/* Logo icon */}
            <div style={{
              position: 'relative',
              width: '26px',
              height: '20px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: '3px',
              zIndex: 10,
            }}>
              {[{ h: '60%' }, { h: '100%' }, { h: '75%' }].map((bar, i) => (
                <div key={i} style={{
                  width: '6px',
                  height: bar.h,
                  borderRadius: '2px',
                  background: 'linear-gradient(180deg, #a5b4fc 0%, #6366f1 60%, #4f46e5 100%)',
                  boxShadow: '0 2px 8px rgba(99,102,241,0.5)',
                  transformOrigin: 'bottom',
                  animation: `logo3dWave 1.2s ease-in-out ${i * 0.3}s infinite alternate`,
                }} />
              ))}
              <style>{`
                @keyframes logo3dWave {
                  0%   { transform: scaleY(1); }
                  100% { transform: scaleY(0.35); }
                }
              `}</style>
            </div>
            {!compact ? (
              <span className="text-[19px] font-black tracking-[-0.03em] text-white drop-shadow-sm ml-1 relative z-10">
                Datalytics
              </span>
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/5 to-transparent opacity-0 group-hover:opacity-100 transition duration-500" />
          </a>
        </div>

        {/* Dataset Stats Card */}
        {dataset && datasetProfile && !compact ? (
          <div className="ds-sidebar-dataset-card" style={{
            padding: '8px 14px',
            margin: '2px 14px 8px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '8px', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rows</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginTop: '1px', lineHeight: '1' }}>{datasetRows.toLocaleString()}</div>
            </div>

            <div style={{ fontSize: '9px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 6px', background: 'rgba(99,102,241, 0.12)', borderRadius: '4px' }}>
              Loaded
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '8px', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Columns</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginTop: '1px', lineHeight: '1' }}>{datasetCols.toLocaleString()}</div>
            </div>
          </div>
        ) : null}

        {/* Workflow Progress */}
        {!compact ? (
          <div className="ds-sidebar-progress" style={{ marginTop: '0px' }}>
            <div className="ds-sidebar-progress-head">
              <span>Workflow Progress</span>
              <strong>{completionRate}%</strong>
            </div>
            <div className="ds-sidebar-progress-track">
              <span style={{ width: `${completionRate}%` }} />
            </div>
            <p>{completedCount} of {totalSteps} pipeline steps completed</p>
          </div>
        ) : null}

        {/* Navigation */}
        <div className="ds-sidebar-section ds-sidebar-workflow">
          {!compact ? <p className="ds-sidebar-section-title">Pipeline Modules</p> : null}
          <nav className="ds-sidebar-nav" aria-label="Data pipeline navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = currentStep === item.key
              const isCompleted = Boolean(completedSteps[item.key])
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`ds-sidebar-step${isActive ? ' is-active' : ''}${isCompleted ? ' is-done' : ''}`}
                  onClick={() => handleNavigate(item.key)}
                  title={item.label}
                >
                  <span className="ds-sidebar-step-icon">
                    <Icon />
                  </span>
                  {!compact ? (
                    <span className="ds-sidebar-step-copy">
                      <strong>{item.label}</strong>
                      <small>{isCompleted ? 'Completed' : 'In progress'}</small>
                    </span>
                  ) : null}
                  {!compact && isCompleted ? <span className="ds-sidebar-step-state">Done</span> : null}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="ds-sidebar-foot">
          {!compact ? (
            <button
              type="button"
              className="ds-sidebar-profile hover:bg-white/5 transition"
              onClick={() => setStep('profile')}
              title="User Profile"
            >
              <span className="ds-sidebar-profile-avatar" style={{ background: '#4f46e5', color: '#fff' }}>
                <HiOutlineUser className="w-5 h-5 mx-auto" style={{ marginTop: '2px' }} />
              </span>
              <span className="ds-sidebar-profile-copy">
                <strong>{authProfile?.fullName?.split(' ')[0] || 'Profile'}</strong>
                <small>View Profile</small>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            className="ds-sidebar-toggle"
            onClick={onToggleCollapse}
            aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {compact ? <HiOutlineChevronDoubleRight /> : <HiOutlineChevronDoubleLeft />}
          </button>
        </div>
      </aside>
    </>
  )
}
