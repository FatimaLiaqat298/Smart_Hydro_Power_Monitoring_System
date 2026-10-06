'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, User, Lock, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [touched, setTouched] = useState({ username: false, password: false });
  const [submitted, setSubmitted] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [shake, setShake] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const usernameError = (() => {
    if (username.trim() === '') return 'Username is required';
    if (username.trim().length < 3) return 'Username must be at least 3 characters';
    return '';
  })();

  const passwordError = (() => {
    if (password === '') return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return '';
  })();

  const showUsernameError = (touched.username || submitted) && !!usernameError;
  const showPasswordError = (touched.password || submitted) && !!passwordError;

  const checkCapsLock = (e) => {
    if (e.getModifierState) {
      setIsCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setServerError('');
    setSubmitted(true);
    setTouched({ username: true, password: true });

    const usernameValid = username.trim().length >= 3;
    const passwordValid = password.length >= 6;

    if (!usernameValid || !passwordValid) {
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      await login(username, password);
      toast.success('Successfully signed in!');
    } catch (err) {
      console.error(err);
      setServerError('Invalid credentials. Contact your administrator.');
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden relative bg-transparent text-[#0B2545]">
      {/* LEFT PANEL */}
      <div className="hidden md:flex md:w-[60%] relative flex-col justify-between p-12 overflow-hidden z-10">
        <div className="relative z-10 flex items-center gap-3 select-none">
          <div className="w-[56px] h-[56px] rounded-full bg-white flex items-center justify-center shadow-lg shrink-0">
            <img src="/pedo-logo.png" alt="PEDO emblem" className="w-11 h-11 object-contain" loading="lazy" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-xl tracking-wider text-[#0B2545]">PEDO</span>
            <span className="text-[11px] tracking-widest font-bold uppercase text-[#23807F]">
              ENERGY PORTAL
            </span>
          </div>
        </div>

        <div className="relative z-10 my-auto flex flex-col max-w-xl">
          <div className="mb-4">
            <h1 className="text-6xl font-black tracking-tight text-[#0B2545] drop-shadow-sm">SHPMFS</h1>
          </div>
          <h2 className="text-2xl font-extrabold mb-3 leading-snug text-[#0B2545]">
            Smart Hydro Power Monitoring &amp; Forecasting System
          </h2>
          <p className="text-xs leading-relaxed mb-8 uppercase tracking-wider font-bold text-[#143552]">
            Pakhtunkhwa Energy Development Organization
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Status',      value: '9 Power Plants', sub: 'Monitored Live' },
              { label: 'Grid Rating', value: '207 MW Capacity', sub: 'Total Installed' },
              { label: 'Production',  value: '666+ GWh',        sub: 'Generated to Date' },
            ].map(({ label, value, sub }) => (
              <div
                key={label}
                className="card !p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#2F9E9A]"
              >
                <div className="text-xs font-bold uppercase mb-1 text-[#23807F]">{label}</div>
                <div className="text-lg font-black text-[#0B2545] leading-tight">{value}</div>
                <div className="text-[11px] font-semibold text-[#143552]">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11px] font-semibold text-[#143552]">
          © {new Date().getFullYear()} PEDO. All rights reserved. Managed by Hydel Division.
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full md:w-[40%] flex flex-col justify-center items-center p-6 sm:p-12 relative z-10">
        <div className={`w-full max-w-md card !p-8 shadow-2xl relative z-10 transition-all ${shake ? 'animate-shake' : ''}`}>
          <div className="md:hidden mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
              <img src="/pedo-logo.png" alt="PEDO emblem" className="w-8 h-8 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg text-[#0B2545]">PEDO</span>
              <span className="text-[10px] font-bold text-[#23807F] uppercase tracking-wider">Energy Portal</span>
            </div>
          </div>

          <div className="hidden md:flex mb-4 items-center justify-between">
            <span className="text-xs font-black tracking-widest uppercase text-[#23807F]">
              PEDO MONITORING
            </span>
            <span className="text-[10px] font-bold text-[#143552] bg-white/40 px-2 py-0.5 rounded-full border border-white/60">
              Secure Access
            </span>
          </div>

          <h2 className="text-3xl font-extrabold text-[#0B2545] mb-2">Sign In</h2>

          <div className="p-3.5 rounded-r-lg mb-6 border-l-4 border-[#2F9E9A] bg-white/40">
            <p className="text-xs leading-relaxed font-semibold text-[#143552]">
              Only admin-approved accounts can access this system.
            </p>
          </div>

          {serverError && (
            <div className="rounded-lg p-3.5 mb-5 flex items-center gap-2.5 bg-red-500/15 border border-red-500/30 text-[#5A0F0F]">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <p className="text-xs font-bold text-[#5A0F0F]">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="label text-[#143552] font-bold" htmlFor="login-username">Username / Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#1B4360]">
                  <User size={16} />
                </div>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your username or email"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, username: true }))}
                  className={`input-field pl-10 bg-white/50 text-[#0B2545] border-white/70 focus:border-[#2F9E9A] ${showUsernameError ? 'error' : ''}`}
                />
              </div>
              {showUsernameError && (
                <p className="field-error text-[#5A0F0F]">
                  <span>⚠️</span>
                  {usernameError}
                </p>
              )}
            </div>

            <div>
              <label className="label text-[#143552] font-bold" htmlFor="login-password">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#1B4360]">
                  <Lock size={16} />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  className={`input-field pl-10 pr-10 bg-white/50 text-[#0B2545] border-white/70 focus:border-[#2F9E9A] ${showPasswordError ? 'error' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#1B4360] hover:text-[#0B2545] transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {isCapsLockOn && (
                <p className="text-[10px] font-bold mt-1 flex items-center gap-1 text-[#4A2503] animate-pulse">
                  ⚠️ Caps Lock is active
                </p>
              )}

              {showPasswordError && (
                <p className="field-error text-[#5A0F0F]">
                  <span>⚠️</span>
                  {passwordError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              aria-busy={isLoading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-white font-bold"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Authenticating…</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs font-semibold text-[#143552]">
              Having trouble? Contact your system administrator
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
