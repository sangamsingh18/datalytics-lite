import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const API_URL = "/api/auth";

export default function AuthSystem({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleGoogleAction = async (endpoint, payload) => {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await fetch(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Authentication failed');
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const onGoogleSuccess = async (cred) => {
    const data = await handleGoogleAction('google', { token: cred.credential });
    if (data?.token) {
      localStorage.setItem('auth_token', data.token);
      setMessage('Login successful! Setting up your workspace...');
      setIsRedirecting(true);
      setTimeout(() => {
        onSuccess(data.user);
      }, 800);
    }
  };

  const PIPELINE_STEPS = [
    { icon: '📁', label: 'Upload CSV / XLSX' },
    { icon: '🔍', label: 'Explore Data' },
    { icon: '⚙️', label: 'Prepare Data' },
    { icon: '📊', label: 'Visualize' },
    { icon: '🧠', label: 'Predict with ML' },
    { icon: '📄', label: 'Generate Report' },
  ];

  const GOOGLE_CLIENT_ID =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
    '';

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || "dummy-id"}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050811]/95 backdrop-blur-[24px] overflow-y-auto p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative w-full max-w-4xl flex flex-col md:flex-row bg-[#0a0e1a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 my-auto"
        >
          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
              aria-label="Close authentication modal"
              title="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          {/* LEFT SIDE — Branding & Pipeline */}
          <div className="md:w-[48%] p-8 lg:p-10 bg-gradient-to-br from-[#0d1225] to-[#0a0e1a] flex flex-col justify-between relative overflow-hidden">
            {/* Background glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="relative z-10">
              {/* Logo */}
              <div className="flex items-center gap-2.5 mb-6">
                <div className="flex items-end gap-1 h-7">
                  <div className="w-2 h-[55%] rounded-full bg-gradient-to-t from-indigo-600 to-violet-400" />
                  <div className="w-2 h-[100%] rounded-full bg-gradient-to-t from-indigo-600 to-violet-400" />
                  <div className="w-2 h-[75%] rounded-full bg-gradient-to-t from-indigo-600 to-violet-400" />
                </div>
                <span className="text-xl font-extrabold text-white tracking-tight">Datalytics</span>
                <span className="text-[9px] font-bold tracking-[0.15em] text-indigo-400 uppercase bg-indigo-400/10 border border-indigo-400/20 px-2 py-0.5 rounded-full">AI</span>
              </div>

              <h1 className="text-2xl lg:text-3xl font-extrabold text-white leading-tight mb-3">
                End-to-End{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
                  Data Analytics
                </span>{' '}
                & ML Platform
              </h1>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-sm">
                Upload datasets, explore, prepare, visualize, and train ML models — all in one focused workspace.
              </p>

              {/* Pipeline Flow */}
              <div className="space-y-2">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{step.icon}</span>
                      <span className="text-xs font-medium text-slate-400">{step.label}</span>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="ml-auto w-px h-3 bg-indigo-400/20" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 relative z-10">
              <p className="text-[9px] text-slate-600 font-medium tracking-wider uppercase">
                © 2026 DATALYTICS | Developed by SANGAM SINGH
              </p>
            </div>
          </div>

          {/* RIGHT SIDE — Google Sign In */}
          <div className="md:w-[52%] p-8 lg:p-10 bg-[#0d1225]/40 flex flex-col justify-center">
            <div className="max-w-xs mx-auto w-full">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-400/20 flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect x="2" y="16" width="5" height="10" rx="1.5" fill="#6366f1" opacity="0.6"/>
                    <rect x="10" y="8" width="5" height="18" rx="1.5" fill="#818cf8"/>
                    <rect x="18" y="11" width="5" height="15" rx="1.5" fill="#6366f1" opacity="0.8"/>
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-1.5">Welcome to Datalytics</h2>
                <p className="text-slate-500 text-xs">Sign in with your Google account to continue</p>
              </div>

              {/* Alerts */}
              {error && (
                <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  {error}
                </div>
              )}
              {message && (
                <div className="mb-5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                  {message}
                </div>
              )}

              {/* Google Login */}
              <div className="flex flex-col items-center gap-4">
                {isRedirecting ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="w-8 h-8 rounded-full border-4 border-indigo-400/20 border-t-indigo-400 animate-spin" />
                    <p className="text-xs text-indigo-300 font-medium animate-pulse">Preparing your workspace...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-full flex justify-center google-pill-fix">
                      {GOOGLE_CLIENT_ID ? (
                        <GoogleLogin
                          onSuccess={onGoogleSuccess}
                          onError={() => setError("Google Sign-In failed. Please try again.")}
                          theme="outline"
                          shape="pill"
                          width="300px"
                        />
                      ) : (
                        <div className="text-[10px] text-slate-600 text-center italic border border-white/5 rounded-full px-4 py-2">
                          Google Sign-in currently unavailable
                        </div>
                      )}
                    </div>
                    {loading && (
                      <p className="text-xs text-indigo-400 animate-pulse font-medium">
                        Authenticating with Google...
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Features List */}
              <div className="mt-8 space-y-2.5">
                {[
                  '✓ No password required',
                  '✓ Secure Google authentication',
                  '✓ Your data stays private',
                ].map((item, i) => (
                  <p key={i} className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span className="text-indigo-400">{item.slice(0, 1)}</span>
                    <span>{item.slice(2)}</span>
                  </p>
                ))}
              </div>
            </div>

            <style jsx global>{`
              .google-pill-fix iframe { border-radius: 9999px !important; }
              .google-pill-fix > div { border-radius: 9999px !important; }
            `}</style>
          </div>
        </motion.div>
      </div>
    </GoogleOAuthProvider>
  );
}
