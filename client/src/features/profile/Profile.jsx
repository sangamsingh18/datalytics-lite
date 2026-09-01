import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import cx from 'classnames'
import { FaInstagram, FaLinkedin, FaGithub, FaGlobe, FaEnvelope } from 'react-icons/fa'
import client from '../../services/apiClient.js'


const CREDIT_PLANS = [
  {
    name: 'Starter',
    price: '₹199',
    amount: 199,
    diamonds: 500,
    displayCredits: '500 Credits',
    tagline: 'Ideal for personal data exploration and testing.',
    features: ['500 Pipeline Credits', 'Full ML model training', 'Export PDF reports', 'Chatbot access'],
    buttonLabel: 'Get Starter',
    highlight: false,
  },
  {
    name: 'Pro Analytics',
    price: '₹499',
    amount: 499,
    diamonds: 1500,
    displayCredits: '1,500 Credits',
    tagline: 'Best for data scientists & portfolio building.',
    badge: 'Popular',
    features: ['1,500 Pipeline Credits', 'Full ML model comparison', 'Priority prediction engine', 'Unlimited exports', 'Chatbot priority support'],
    buttonLabel: 'Get Pro',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '₹999',
    amount: 999,
    diamonds: 4000,
    displayCredits: '4,000 Credits',
    tagline: 'High-volume analytics and batch dataset workflows.',
    features: ['4,000 Pipeline Credits', 'All pipeline modules', 'Full AutoML suite', 'Dedicated support'],
    buttonLabel: 'Get Enterprise',
    highlight: false,
  },
]

export default function UserProfileStep({
  authProfile,
  profileAvatar,
  setProfileAvatar,
  onNavigate,
}) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState(authProfile?.fullName || 'Datalytics User')
  const [diamondBalance, setDiamondBalance] = useState(authProfile?.diamonds ?? 200)
  const [currentPlan, setCurrentPlan] = useState(authProfile?.plan || 'Free')
  const [saving, setSaving] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState(null)
  const [paymentSuccess, setPaymentSuccess] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const avatarInputRef = useRef(null)

  const email = authProfile?.email || 'user@datalytics.ai'
  const initialsMatch = fullName.match(/\b\w/g) || []
  const profileInitials = ((initialsMatch[0] || '') + (initialsMatch[1] || '')).toUpperCase() || 'DL'

  // Fetch live profile details
  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await client.get('/auth/me')
        if (res.data) {
          setFullName(res.data.fullName || authProfile?.fullName || 'Datalytics User')
          setDiamondBalance(res.data.diamonds ?? 200)
          setCurrentPlan(res.data.plan || 'Free')
        }
      } catch {}
    }
    fetchMe()
  }, [authProfile])

  // Handle pricing open event
  useEffect(() => {
    function handleOpenPricing() {
      const pricingEl = document.getElementById('pricing-plans-section')
      if (pricingEl) pricingEl.scrollIntoView({ behavior: 'smooth' })
    }
    window.addEventListener('datalytics:profile-open-pricing', handleOpenPricing)
    return () => window.removeEventListener('datalytics:profile-open-pricing', handleOpenPricing)
  }, [])

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target.result
      setProfileAvatar(base64)
      const avatarKey = `datalytics-profile-avatar-${email}`
      localStorage.setItem(avatarKey, base64)
      localStorage.setItem('datalytics-profile-avatar', base64)
    }
    reader.readAsDataURL(file)
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await client.patch('/auth/profile', { fullName })
      setEditing(false)
    } catch (err) {
      console.error('Failed to update profile', err)
    } finally {
      setSaving(false)
    }
  }

  function loadRazorpayScript() {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true)
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  async function handleBuyPlan(plan) {
    setSelectedPlan(plan)
    setPaymentLoading(true)
    setPaymentError(null)
    setPaymentSuccess(null)

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setPaymentError('Your session has expired. Please log in again.')
        setPaymentLoading(false)
        navigate('/')
        return
      }

      // Ensure Razorpay SDK is loaded
      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded || !window.Razorpay) {
        setPaymentError('Razorpay could not be loaded. Please check your internet connection and try again.')
        setPaymentLoading(false)
        return
      }

      let currentUser = null
      try {
        currentUser = (await client.get('/auth/me')).data
      } catch (authErr) {
        localStorage.removeItem('auth_token')
        setPaymentError('Your session is invalid. Please log in again.')
        setPaymentLoading(false)
        navigate('/')
        return
      }

      const res = await client.post('/payment/create-order', {
        plan_name: plan.name,
        amount: plan.amount,
        diamonds: plan.diamonds,
      })

      if (!res.data?.order_id) {
        setPaymentError('Failed to create payment order. Please try again.')
        setPaymentLoading(false)
        return
      }

      const razorpayKey = String(res.data.key_id || '').trim()
      if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(razorpayKey)) {
        setPaymentError('Razorpay is not configured correctly. Please check the server payment keys.')
        setPaymentLoading(false)
        return
      }

      const options = {
        key: razorpayKey,
        amount: res.data.amount,
        currency: 'INR',
        name: 'Datalytics AI',
        description: 'Datalytics subscription',
        order_id: res.data.order_id,
        handler: async function (response) {
          try {
            const verifyRes = await client.post('/payment/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_name: plan.name,
              diamonds: plan.diamonds,
            })

            const meRes = await client.get('/auth/me')
            const nextBalance = Number(meRes?.data?.diamonds ?? verifyRes?.data?.diamonds ?? diamondBalance)
            setDiamondBalance(nextBalance)
            setCurrentPlan(meRes?.data?.plan || plan.name)
            setPaymentError(null)
            setPaymentSuccess(`Payment verified! ${plan.diamonds.toLocaleString()} Credits have been added to your account.`)
            window.dispatchEvent(new CustomEvent('datalytics:diamonds-updated', { detail: { balance: nextBalance } }))
          } catch (err) {
            const detailMsg = err?.response?.data?.detail || err?.response?.data?.message || err?.message
            setPaymentError(detailMsg && typeof detailMsg === 'string' ? detailMsg : 'Payment verification failed. Please contact support.')
          } finally {
            setPaymentLoading(false)
          }
        },
        prefill: {
          name: fullName,
          email,
        },
        theme: {
          color: '#6366f1',
        },
        modal: {
          ondismiss: () => {
            setPaymentLoading(false)
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (response) => {
        const paymentError = response?.error || {}
        const errorMessage = paymentError.description || 'Payment failed. Please try again.'
        const errorCode = paymentError.code ? ` (${paymentError.code})` : ''
        if (errorMessage.includes('invalid characters')) {
          setPaymentError('Payment failed: invalid checkout description. Please refresh and try again.')
        } else {
          setPaymentError(`Payment failed: ${errorMessage}${errorCode}`)
        }
      })
      rzp.open()
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Payment initialization failed.'
      setPaymentError(msg)
    } finally {
      setPaymentLoading(false)
    }
  }

  async function handleLogout() {
    const token = localStorage.getItem('auth_token')
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    } catch {}
    localStorage.removeItem('auth_token')
    localStorage.removeItem('datalytics-notifications')
    navigate('/')
    window.location.reload()
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-8">
      {/* ── 1. Profile Header ─────────────────────────────────── */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
          {/* Avatar with upload */}
          <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
            <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-indigo-500/40 shadow-xl bg-indigo-950 flex items-center justify-center">
              {profileAvatar ? (
                <img src={profileAvatar} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-black text-indigo-300">{profileInitials}</span>
              )}
            </div>
            <div className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs text-white font-medium">
              Change Photo
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* User Details */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">{fullName}</h1>
                <p className="text-sm text-slate-400 mt-0.5">{email}</p>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                    Google Account
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    Plan: {currentPlan}
                  </span>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(!editing)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition"
                >
                  {editing ? 'Cancel' : 'Edit Profile'}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Inline Edit Profile Form */}
            {editing && (
              <form onSubmit={handleSaveProfile} className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter full name"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-sm focus:outline-none focus:border-indigo-400"
                  required
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Credit Wallet & Plans ───────────────────────────── */}
      <div id="pricing-plans-section" className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8 backdrop-blur-xl space-y-6">
        {/* Wallet Balance Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-indigo-950/40 border border-indigo-500/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-400/30 flex items-center justify-center text-2xl shadow-lg">
              🪙
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Credit Balance</p>
              <p className="text-2xl font-black text-white">
                {diamondBalance.toLocaleString()} <span className="text-sm font-normal text-indigo-300">Credits</span>
              </p>
            </div>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs text-slate-400">ML Predictions & pipeline runs consume 50 Credits per execution.</p>
          </div>
        </div>

        {paymentSuccess && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
            <span>✨</span>
            <span>{paymentSuccess}</span>
          </div>
        )}

        {paymentError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {paymentError}
          </div>
        )}

        {/* Pricing Cards */}
        <div>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">Choose a Credit Plan</h2>
            <p className="text-xs text-slate-400 mt-1">Recharge credits to unlock model predictions and high-volume dataset runs.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {CREDIT_PLANS.map((plan) => {
              const isCurrent = currentPlan === plan.name
              return (
                <div
                  key={plan.name}
                  className={cx(
                    'flex flex-col rounded-2xl border p-5 transition-all duration-200',
                    plan.highlight
                      ? 'border-indigo-500/60 bg-indigo-950/20 shadow-xl shadow-indigo-600/10 ring-1 ring-indigo-500/30'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-bold text-white">{plan.name}</h3>
                    {plan.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <div className="my-2">
                    <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-xs text-slate-400 ml-1.5 font-medium">/ {plan.displayCredits}</span>
                  </div>

                  <p className="text-xs text-slate-400 mb-4">{plan.tagline}</p>

                  <ul className="space-y-2 mb-6 flex-1 text-xs text-slate-300">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="text-indigo-400">✓</span> {feat}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleBuyPlan(plan)}
                    disabled={paymentLoading}
                    className={cx(
                      'w-full py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50',
                      plan.highlight
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                        : 'bg-white/10 hover:bg-white/15 text-white'
                    )}
                  >
                    {paymentLoading && selectedPlan?.name === plan.name ? 'Processing...' : isCurrent ? 'Active Plan' : plan.buttonLabel}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 3. Developer & Project Information ────────────────── */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl text-center space-y-4">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Datalytics AI Platform</p>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          End-to-End Data Analytics & Machine Learning workspace. Built for unified dataset profiling, preprocessing, visualization, and AutoML prediction.
        </p>
        <div className="flex justify-center items-center gap-4 pt-2">
          <a href="mailto:singhsangam1800@gmail.com" className="text-slate-400 hover:text-white transition text-base" title="Email"><FaEnvelope /></a>
          <a href="https://www.linkedin.com/in/sangam-singh-94a52633b" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition text-base" title="LinkedIn"><FaLinkedin /></a>
          <a href="https://github.com/sangamsingh18" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition text-base" title="GitHub"><FaGithub /></a>
          <a href="https://sangam-ai-ml.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition text-base" title="Portfolio"><FaGlobe /></a>
        </div>
      </div>

    </div>
  )
}
