/**
 * useDiamonds — React hook for diamond balance management.
 *
 * Usage in any pipeline step:
 *   const { deductDiamonds, InsufficientDiamondsAlert } = useDiamonds()
 *
 *   const proceedToNextStep = async () => {
 *     const ok = await deductDiamonds(20)
 *     if (!ok) return  // Alert is shown automatically
 *     // ... continue pipeline
 *   }
 *
 *   // Render the alert overlay at the root of your component:
 *   return <><InsufficientDiamondsAlert /> ... rest of your JSX ... </>
 */

import { useState, useCallback } from 'react'
import client from '../services/apiClient.js'

export function useDiamonds() {
  const [showAlert, setShowAlert] = useState(false)
  const [currentBalance, setCurrentBalance] = useState(null)
  const [isDeducting, setIsDeducting] = useState(false)

  /**
   * Attempt to deduct `amount` diamonds (default 20).
   * Returns `true` if successful, `false` if insufficient.
   */
  const deductDiamonds = useCallback(async (amount = 50) => {
    setIsDeducting(true)
    try {
      const res = await client.post('/payment/deduct-diamonds', { amount })
      const remaining = res.data?.remaining_diamonds
      if (remaining !== undefined) {
        setCurrentBalance(remaining)
        // Broadcast to Navbar
        window.dispatchEvent(
          new CustomEvent('datalytics:diamonds-deducted', { detail: { remaining } })
        )
      }
      setIsDeducting(false)
      return true
    } catch (err) {
      setIsDeducting(false)
      if (err?.response?.status === 402) {
        const detail = err.response?.data?.detail || {}
        setCurrentBalance(detail.current_balance ?? null)
        setShowAlert(true)
        return false
      }
      if (err?.response?.status === 401) {
        // Not authenticated — let this through silently (no deduction)
        return true
      }
      // For other errors, allow the pipeline step to proceed
      console.warn('[useDiamonds] Deduction error:', err.message)
      return true
    }
  }, [])

  /**
   * The "Not Enough Diamonds" modal overlay.
   * Render once inside your component.
   */
  const InsufficientDiamondsAlert = useCallback(() => {
    if (!showAlert) return null

    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center px-4"
        style={{ background: 'rgba(5, 8, 20, 0.88)', backdropFilter: 'blur(12px)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Insufficient UC"
      >
        <div
          className="relative w-full max-w-md rounded-[28px] border border-cyan-400/20 p-8 text-center"
          style={{
            background: 'linear-gradient(145deg, #0a1015 0%, #0d1725 100%)',
            boxShadow: '0 0 60px rgba(0,198,255,0.12), 0 40px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Glow ring */}
          <div
            className="absolute -inset-px rounded-[28px] pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(0,198,255,0.15), transparent 60%, rgba(0,198,255,0.08))' }}
          />

          <div className="relative">
            {/* Icon */}
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/5 shadow-[0_0_30px_rgba(0,198,255,0.15)]">
              <span style={{ fontSize: '2.5rem', filter: 'drop-shadow(0 0 12px #00c6ff)' }}>🪙</span>
            </div>

            <h3 className="text-2xl font-bold text-white mb-2">Not Enough UC</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-2">
              You need at least <strong className="text-white">50 🪙</strong> to run this pipeline step.
            </p>
            {currentBalance !== null && (
              <p className="text-sm text-cyan-400/80 mb-6">
                Current balance: <strong className="text-cyan-300">{currentBalance} 🪙</strong>
              </p>
            )}
            {currentBalance === null && <div className="mb-6" />}

            {/* Animated diamond sparkle line */}
            <div className="flex justify-center gap-1 mb-8">
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className="text-cyan-400 opacity-60"
                  style={{
                    fontSize: '8px',
                    animation: `pulse 1.4s ease-in-out ${i * 0.14}s infinite`,
                  }}
                >
                  ◆
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAlert(false)
                  // Open pricing modal via custom event (App.jsx listens)
                  window.dispatchEvent(new CustomEvent('datalytics:open-pricing'))
                }}
                className="w-full rounded-xl py-3.5 text-sm font-bold text-slate-950 transition hover:brightness-110 shadow-[0_0_20px_rgba(0,198,255,0.2)]"
                style={{
                  background: 'linear-gradient(135deg, #00c6ff 0%, #0066ff 100%)',
                }}
              >
                Buy UC 🪙
              </button>
              <button
                type="button"
                onClick={() => setShowAlert(false)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }, [showAlert, currentBalance])

  return { deductDiamonds, InsufficientDiamondsAlert, isDeducting, currentBalance }
}
