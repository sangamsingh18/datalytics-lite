import { useEffect, useRef, useState } from 'react'
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineBars3,
  HiOutlineChevronRight,
  HiOutlineUserCircle,
} from 'react-icons/hi2'
import client from '../../services/apiClient.js'

export default function Navbar({
  stepLabel,
  onMenuToggle,
  onProfileOpen,
  onOpenSettings,
  onLogout,
  profileName,
  profileRole,
  profileInitials,
  profileAvatar,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [diamondBalance, setDiamondBalance] = useState(0)
  const menuRef = useRef(null)

  // Fetch diamond balance on mount
  useEffect(() => {
    async function fetchBalance() {
      try {
        const res = await client.get('/payment/user-diamonds')
        if (res.data?.diamonds !== undefined) {
          setDiamondBalance(Number(res.data.diamonds))
        }
      } catch {
        try {
          const fallback = await client.get('/auth/me')
          if (fallback.data?.diamonds !== undefined) {
            setDiamondBalance(Number(fallback.data.diamonds))
          }
        } catch {}
      }
    }
    fetchBalance()
  }, [])

  // Listen for real-time balance updates
  useEffect(() => {
    function handleBalanceUpdate(event) {
      if (event.detail?.balance !== undefined) {
        setDiamondBalance(event.detail.balance)
      }
    }
    function handleDeduction(event) {
      if (event.detail?.remaining !== undefined) {
        setDiamondBalance(event.detail.remaining)
      }
    }
    window.addEventListener('datalytics:diamonds-updated', handleBalanceUpdate)
    window.addEventListener('datalytics:diamonds-deducted', handleDeduction)
    return () => {
      window.removeEventListener('datalytics:diamonds-updated', handleBalanceUpdate)
      window.removeEventListener('datalytics:diamonds-deducted', handleDeduction)
    }
  }, [])

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const balanceLow = diamondBalance < 20

  return (
    <header className="ds-navbar">
      <div className="ds-navbar-left">
        <button
          type="button"
          className="ds-navbar-hamburger"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
        >
          <HiOutlineBars3 />
        </button>

        <div className="ds-navbar-breadcrumb">
          <span className="ds-navbar-breadcrumb-root">Analytics Workspace</span>
          <HiOutlineChevronRight />
          <span className="ds-navbar-breadcrumb-current">{stepLabel}</span>
        </div>
      </div>

      <div className="ds-navbar-right">
        {/* DIAMOND BALANCE PILL */}
        <button
          type="button"
          onClick={onProfileOpen}
          title={balanceLow ? 'Low credit balance! Recharge to run ML models.' : `${diamondBalance} Credits available`}
          className={`
            inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold
            border backdrop-blur-sm transition-all duration-300
            ${balanceLow
              ? 'border-rose-400/40 bg-rose-500/15 text-rose-300 shadow-[0_0_12px_rgba(248,113,113,0.2)] animate-pulse'
              : 'border-indigo-400/30 bg-indigo-500/10 text-indigo-100 shadow-[0_0_12px_rgba(99,102,241,0.18)] hover:bg-indigo-500/20 hover:border-indigo-400/50'
            }
          `}
          id="navbar-diamond-balance"
        >
          <span className="text-lg leading-none select-none">🪙</span>
          <span className="tabular-nums text-base">{diamondBalance.toLocaleString()}</span>
          {balanceLow && <span className="text-xs opacity-80">Low!</span>}
        </button>

        {/* PROFILE */}
        <div className="ds-navbar-profile-wrap" ref={menuRef} style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            className={`ds-navbar-profile${menuOpen ? ' is-open' : ''}`}
            onClick={() => onProfileOpen?.()}
            title="View Profile"
          >
            <span className="ds-navbar-avatar overflow-hidden">
              {profileAvatar ? (
                <img src={profileAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                profileInitials
              )}
            </span>
            <span className="ds-navbar-profile-copy">
              <strong className="text-white drop-shadow-sm">{profileName}</strong>
              <small className="text-indigo-300/80">{profileRole}</small>
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
