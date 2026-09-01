import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaLinkedin, FaGithub, FaGlobe, FaEnvelope } from "react-icons/fa";
import GoogleLogin from '../features/authentication/GoogleLogin.jsx';

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Upload Data",
    desc: "Ingest CSV or Excel (XLSX) datasets with automatic schema and type detection.",
    icon: "📁",
    badge: "CSV / XLSX",
  },
  {
    step: "02",
    title: "Explore Data",
    desc: "Instant dataset preview, schema types, missing value audit, and statistical summary.",
    icon: "🔍",
    badge: "Smart EDA",
  },
  {
    step: "03",
    title: "Prepare Data",
    desc: "Handle missing values, remove IQR outliers, clean duplicate rows, and fix data types.",
    icon: "⚙️",
    badge: "Data Cleaning",
  },
  {
    step: "04",
    title: "Visualize Data",
    desc: "Interactive Bar, Line, Pie, Histogram, Scatter Plot, and Box Plot chart generators.",
    icon: "📊",
    badge: "6 Core Charts",
  },
  {
    step: "05",
    title: "Predict with ML",
    desc: "Train Supervised & Unsupervised ML models, auto-select the best model, and download predictions.",
    icon: "🧠",
    badge: "AutoML Engine",
  },
  {
    step: "06",
    title: "Generate Report",
    desc: "Export comprehensive PDF and Excel analytics summaries with pipeline metrics and charts.",
    icon: "📄",
    badge: "PDF / Excel",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  function handleStart() {
    if (isLoggedIn) {
      navigate("/app");
    } else {
      setShowAuthModal(true);
    }
  }

  function handleAuthSuccess() {
    setShowAuthModal(false);
    setIsLoggedIn(true);
    navigate("/app");
  }

  return (
    <div className="min-h-screen bg-[#050811] text-white flex flex-col selection:bg-indigo-500 selection:text-white font-sans antialiased overflow-x-hidden overflow-y-auto w-full scroll-smooth">
      {/* Background Decorative Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="relative z-20 border-b border-white/5 bg-[#050811]/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Equalizer Logo */}
            <div className="flex items-end gap-1 h-7">
              <div className="w-2 h-[60%] rounded-full bg-gradient-to-t from-indigo-600 to-violet-400" />
              <div className="w-2 h-[100%] rounded-full bg-gradient-to-t from-indigo-600 to-violet-400" />
              <div className="w-2 h-[75%] rounded-full bg-gradient-to-t from-indigo-600 to-violet-400" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-white">Datalytics</span>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              AI
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-xs text-slate-300 font-medium">
            <a href="#hero" className="hover:text-indigo-400 transition cursor-pointer">Overview</a>
            <a href="#pipeline" className="hover:text-indigo-400 transition cursor-pointer">Pipeline</a>
            <a href="#features" className="hover:text-indigo-400 transition cursor-pointer">Features</a>
            <a href="#contact" className="hover:text-indigo-400 transition cursor-pointer">Contact</a>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleStart}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer hover:scale-105"
            >
              {isLoggedIn ? "Open Dashboard →" : "Sign In with Google"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Section 1: Hero / First Screen ──────────────────── */}
      <section id="hero" className="relative z-10 pt-20 pb-24 px-6 text-center max-w-5xl mx-auto flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-8 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          End-to-End Data Analytics & Machine Learning Platform
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.1] mb-6">
          Turn Raw Datasets into{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-300 to-indigo-300">
            Actionable Intelligence
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed mb-10">
          Upload CSV or Excel data, inspect schema profiles, preprocess missing values and outliers, generate 6 core chart types, and train ML predictive models — seamlessly in one workspace.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <button
            onClick={handleStart}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition duration-200 shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 cursor-pointer hover:scale-[1.02]"
          >
            <span>{isLoggedIn ? "Launch Analytics Workspace" : "Get Started — Free"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Hero Visual Mockup */}
        <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-950/60 p-4 sm:p-6 backdrop-blur-xl shadow-2xl shadow-indigo-950/40 relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-2 font-mono text-[11px] text-slate-500">datalytics://workspace/pipeline</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono text-[10px]">v2.0 LIVE</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Input</p>
              <p className="text-sm font-bold text-white mt-1">CSV & XLSX</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Schema Profiling</p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Preparation</p>
              <p className="text-sm font-bold text-white mt-1">IQR & Impute</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Auto-Clean</p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Charts</p>
              <p className="text-sm font-bold text-white mt-1">6 Core Views</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Plotly Visuals</p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Machine Learning</p>
              <p className="text-sm font-bold text-white mt-1">Supervised ML</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Auto-Model Rank</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Product Showcase (6-Step Pipeline) ───── */}
      <section id="pipeline" className="relative z-10 py-20 px-6 max-w-6xl mx-auto w-full border-t border-white/5">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-3">Structured Workflow</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            The 6-Stage Analytics Pipeline
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto">
            From raw spreadsheet files to trained machine learning models in a clean, reproducible workflow.
          </p>
        </div>

        <div id="features" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WORKFLOW_STEPS.map((step) => (
            <div
              key={step.step}
              className="p-6 rounded-2xl border border-white/10 bg-slate-900/40 hover:border-indigo-500/40 hover:bg-slate-900/80 transition-all duration-300 group flex flex-col justify-between backdrop-blur-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                    {step.icon}
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500 group-hover:text-indigo-400 transition-colors">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">{step.desc}</p>
              </div>
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-indigo-300/80 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                  {step.badge}
                </span>
                <span className="text-slate-600 text-xs group-hover:text-indigo-400 transition-colors">→</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline Diagram Flow */}
        <div className="mt-16 p-6 rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-950/30 via-slate-900/40 to-indigo-950/30 text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Workflow Flowchart</p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-300">
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">1. Upload CSV / XLSX</span>
            <span className="text-indigo-400 font-bold">→</span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">2. Explore Data</span>
            <span className="text-indigo-400 font-bold">→</span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">3. Prepare Data</span>
            <span className="text-indigo-400 font-bold">→</span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">4. Visualize</span>
            <span className="text-indigo-400 font-bold">→</span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">5. Predict ML</span>
            <span className="text-indigo-400 font-bold">→</span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">6. Report PDF</span>
          </div>
        </div>
      </section>

      {/* ── Section 3: Footer ───────────────────────────────── */}
      <footer id="contact" className="relative z-10 mt-auto border-t border-white/10 bg-[#04060d] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2.5 mb-1.5">
              <div className="flex items-end gap-1 h-5">
                <div className="w-1.5 h-[60%] rounded-full bg-indigo-500" />
                <div className="w-1.5 h-[100%] rounded-full bg-indigo-500" />
                <div className="w-1.5 h-[75%] rounded-full bg-indigo-500" />
              </div>
              <span className="font-extrabold text-white text-base">Datalytics AI</span>
            </div>
            <p className="text-xs text-slate-500">
              End-to-End Data Analytics & Machine Learning Platform. Developed by SANGAM SINGH.
            </p>
          </div>

          <div className="flex items-center gap-5 text-slate-400">
            <a href="mailto:singhsangam1800@gmail.com" className="hover:text-white transition text-sm" title="Email"><FaEnvelope /></a>
            <a href="https://www.linkedin.com/in/sangam-singh-94a52633b" target="_blank" rel="noopener noreferrer" className="hover:text-white transition text-sm" title="LinkedIn"><FaLinkedin /></a>
            <a href="https://github.com/sangamsingh18" target="_blank" rel="noopener noreferrer" className="hover:text-white transition text-sm" title="GitHub"><FaGithub /></a>
            <a href="https://sangam-ai-ml.vercel.app/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition text-sm" title="Portfolio"><FaGlobe /></a>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      {showAuthModal && (
        <GoogleLogin
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}
