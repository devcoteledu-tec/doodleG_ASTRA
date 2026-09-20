'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, User, Mail, Phone, Lock, ArrowRight, CheckCircle,
  Loader2, ChevronLeft, ShieldCheck, RotateCw, Sparkles, MapPin, XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

type Tab = 'signin' | 'signup';
type Step = 'form' | 'otp' | 'mobile' | 'success';

const SIGNUP_IMAGE = 'https://maacedu.top3danimation.com/images/ad3d-about.webp';
const SIGNIN_IMAGE =
  'https://img.magnific.com/free-photo/cute-cartoon-background-children_23-2150169923.jpg?semt=ais_hybrid&w=740&q=80';

const RESEND_COOLDOWN_SECONDS = 45;

/* ── Google Identity Services minimal typings (no `any`) ── */
interface GoogleCredentialResponse {
  credential: string;
}
interface GoogleIdConfig {
  client_id: string;
  callback: (resp: GoogleCredentialResponse) => void;
  ux_mode?: 'popup' | 'redirect';
}
interface GoogleButtonOptions {
  theme?: 'outline' | 'filled_black' | 'filled_blue';
  size?: 'small' | 'medium' | 'large';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}
interface GoogleAccountsId {
  initialize: (config: GoogleIdConfig) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

/* ── Floating doodle shapes — pure black/white/green/blue/yellow accents ── */
function DoodleShapes({ variant }: { variant: Tab }) {
  const palette = variant === 'signup'
    ? ['bg-[#facc15]', 'bg-white', 'bg-[#16a34a]', 'bg-white']
    : ['bg-[#facc15]', 'bg-white', 'bg-[#2563eb]', 'bg-white'];
  const shapes = [
    { top: '8%', left: '10%', size: 'w-4 h-4 rounded-sm rotate-12', delay: 0, dur: 7 },
    { top: '18%', left: '78%', size: 'w-3 h-3 rounded-full', delay: 0.6, dur: 6 },
    { top: '70%', left: '14%', size: 'w-6 h-6 rounded-full', delay: 1.1, dur: 8 },
    { top: '82%', left: '68%', size: 'w-4 h-4 rounded-sm -rotate-6', delay: 0.3, dur: 6.5 },
    { top: '45%', left: '88%', size: 'w-2.5 h-2.5 rounded-full', delay: 0.9, dur: 5.5 },
    { top: '30%', left: '4%', size: 'w-3 h-3 rounded-sm rotate-45', delay: 1.4, dur: 7.5 },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {shapes.map((s, i) => (
        <motion.span
          key={i}
          className={`absolute ${s.size} ${palette[i % palette.length]} opacity-70 shadow-sm`}
          style={{ top: s.top, left: s.left }}
          animate={{ y: [0, -16, 0], rotate: [0, 10, 0] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ── Shared visual/hero panel: full-height on desktop (right side), compact banner on mobile (top) ── */
function VisualPanel({ tab }: { tab: Tab }) {
  const isSignup = tab === 'signup';
  const image = isSignup ? SIGNUP_IMAGE : SIGNIN_IMAGE;
  const gradient = isSignup
    ? 'from-[#0a0a0a]/80 via-[#0a0a0a]/50 to-[#16a34a]/70'
    : 'from-[#0a0a0a]/80 via-[#0a0a0a]/50 to-[#2563eb]/70';
  const badgeColor = isSignup ? 'text-[#16a34a] bg-[#16a34a]/10 border-[#16a34a]/30' : 'text-[#2563eb] bg-[#2563eb]/10 border-[#2563eb]/30';

  const perks = isSignup
    ? ['AI-curated surprise gift packages', 'Track & manage every order', 'Exclusive subscriber pricing', 'Build a loved-ones wishlist']
    : ['Pick up right where you left off', 'See your saved gift ideas', 'Manage past & upcoming orders', 'Chat with your gifting concierge'];

  return (
    <div className="relative order-1 lg:order-2 w-full h-56 sm:h-64 lg:h-auto lg:w-[52%] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external, non-configured domain */}
          <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        </motion.div>
      </AnimatePresence>

      <DoodleShapes variant={tab} />

      <div className="relative z-10 h-full flex flex-col justify-end lg:justify-between p-6 sm:p-8 lg:p-12">
        <Link href="/" className="hidden lg:flex items-center gap-2.5 w-fit group">
          <Image
            src="/icon-512.png"
            alt="doodle_G logo"
            width={32}
            height={32}
            className="w-8 h-8 rounded-lg object-cover"
          />
          <span className="font-display text-xl font-bold tracking-wide text-white">
            doodle_<span className="text-[#facc15]">G</span>
          </span>
        </Link>

        <div className="space-y-4 lg:space-y-6">
          <div className={`hidden lg:inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest border ${badgeColor} bg-white`}>
            <Sparkles className="w-3 h-3" /> {isSignup ? 'Frictionless Sentimentality' : 'Welcome back'}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight">
            {isSignup ? <>Gift smarter.<br className="hidden lg:block" /> Feel deeper.</> : <>Good to<br className="hidden lg:block" /> see you again.</>}
          </h1>
          <ul className="hidden lg:block space-y-2.5">
            {perks.map(p => (
              <li key={p} className="flex items-center gap-2.5 text-sm text-white/90">
                <CheckCircle className={`w-4 h-4 flex-shrink-0 ${isSignup ? 'text-[#4ade80]' : 'text-[#93c5fd]'}`} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ── Text input ── */
function InputField({
  icon: Icon, label, type = 'text', value, onChange, placeholder, error, rightEl, accent, autoComplete,
}: {
  icon: React.ElementType; label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder: string; error?: string; rightEl?: React.ReactNode;
  accent: 'blue' | 'green'; autoComplete?: string;
}) {
  const ring = accent === 'blue' ? 'focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15'
    : 'focus-within:border-[#16a34a] focus-within:ring-2 focus-within:ring-[#16a34a]/15';
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-black/70 uppercase tracking-wider">{label}</label>
      <div className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 transition-all ${
        error ? 'border-red-500/70' : `border-black/10 ${ring}`
      }`}>
        <Icon className="w-4 h-4 text-black/40 flex-shrink-0" />
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 bg-transparent text-sm text-black placeholder:text-black/35 outline-none min-w-0"
        />
        {rightEl}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* ── Google button ── */
function GoogleButton({ onResult }: { onResult: (result: import('@/lib/AuthContext').AuthActionResult) => void }) {
  const { googleSignIn } = useAuth();
  const boxRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredential = useCallback(async (resp: GoogleCredentialResponse) => {
    const result = await googleSignIn(resp.credential);
    onResult(result);
  }, [googleSignIn, onResult]);

  useEffect(() => {
    if (!clientId || !ready || !boxRef.current) return;
    if (!window.google) return;
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential, ux_mode: 'popup' });
    boxRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(boxRef.current, {
      theme: 'outline', size: 'large', shape: 'pill', width: 320, text: 'continue_with',
    });
  }, [clientId, ready, handleCredential]);

  if (!clientId) return null;

  return (
    <div className="space-y-2">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div className="relative flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-black/10" />
        <span className="text-[11px] font-medium text-black/40 uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-black/10" />
      </div>
      <div className="flex justify-center [&>div]:!w-full" ref={boxRef} />
    </div>
  );
}

/* ── 6-digit OTP input ── */
function OtpInput({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const setDigit = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array.from({ length: 6 }, (_, i) => text[i] || '');
    onChange(next);
    refs.current[Math.min(text.length, 5)]?.focus();
  };

  return (
    <div>
      <div className="flex justify-center gap-2 sm:gap-3">
        {value.map((d, i) => (
          <motion.input
            key={i}
            ref={el => { refs.current[i] = el; }}
            value={d}
            onChange={e => setDigit(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="numeric"
            maxLength={1}
            animate={error ? { x: [0, -6, 6, -6, 6, 0] } : {}}
            transition={{ duration: 0.35 }}
            className={`w-10 h-12 sm:w-12 sm:h-14 text-center text-lg font-bold rounded-xl border bg-white text-black outline-none transition-all ${
              error ? 'border-red-500/70' : 'border-black/15 focus:border-[#facc15] focus:ring-2 focus:ring-[#facc15]/30'
            }`}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-500 text-center mt-2">{error}</p>}
    </div>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, signIn, signUp, verifyEmail, resendCode, completeProfile } = useAuth();

  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'signin');
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Sign-in state
  const [siUser, setSiUser] = useState('');
  const [siPass, setSiPass] = useState('');
  const [siErrors, setSiErrors] = useState<Record<string, string>>({});

  // Sign-up state
  const [suUser, setSuUser] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suMobile, setSuMobile] = useState('');
  const [suPincode, setSuPincode] = useState('');
  const [suPass, setSuPass] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [suErrors, setSuErrors] = useState<Record<string, string>>({});

  // PIN code live lookup (India Post) — 'idle' before 6 digits are typed,
  // then 'checking' -> 'valid' | 'invalid'. Signup is blocked while
  // 'checking' or 'invalid' so a made-up PIN can't slip through.
  const [pincodeStatus, setPincodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'unverifiable'>('idle');
  const [pincodePlace, setPincodePlace] = useState<{ district: string; state: string } | null>(null);

  // OTP / verification state
  const [pendingVerificationToken, setPendingVerificationToken] = useState('');
  const [pendingCompletionToken, setPendingCompletionToken] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSending, setResendSending] = useState(false);

  // Google "complete your profile" step — Google never gives us a phone
  // number, so a new/linking Google account is routed here to supply one
  // before it gets a session (see /api/auth/google's needsMobileNumber).
  const [pendingName, setPendingName] = useState('');
  const [profileMobile, setProfileMobile] = useState('');
  const [profileMobileError, setProfileMobileError] = useState('');

  // Already logged in → redirect
  useEffect(() => {
    if (user) router.replace(params.get('redirect') || '/shop');
  }, [user, router, params]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // PIN code lookup — debounced so we only call India Post once the user
  // has stopped typing, and once we actually have 6 digits.
  useEffect(() => {
    if (!/^\d{6}$/.test(suPincode)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setPincodeStatus('idle');
       
      setPincodePlace(null);
      return;
    }
     
    setPincodeStatus('checking');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/verify-pincode?pincode=${suPincode}`);
        const data = await res.json();
        if (!res.ok) {
           
          setPincodeStatus('unverifiable');
           
          setPincodePlace(null);
          return;
        }
        if (data.valid) {
           
          setPincodeStatus('valid');
           
          setPincodePlace({ district: data.district, state: data.state });
        } else {
           
          setPincodeStatus('invalid');
           
          setPincodePlace(null);
        }
      } catch {
         
        setPincodeStatus('unverifiable');
         
        setPincodePlace(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [suPincode]);

  const enterOtpStep = (verificationToken: string, email: string) => {
    setPendingVerificationToken(verificationToken);
    setPendingEmail(email);
    setOtp(['', '', '', '', '', '']);
    setOtpError('');
    setStep('otp');
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const goToSuccess = () => {
    setStep('success');
    setTimeout(() => router.push(params.get('redirect') || '/shop'), 900);
  };

  const handleGoogleResult = (result: import('@/lib/AuthContext').AuthActionResult) => {
    setGlobalError('');
    if (result.needsMobileNumber && result.completionToken && result.email) {
      setPendingCompletionToken(result.completionToken);
      setPendingEmail(result.email);
      setPendingName(result.name || '');
      setProfileMobile('');
      setProfileMobileError('');
      setStep('mobile');
      return;
    }
    if (result.error) { setGlobalError(result.error); return; }
    goToSuccess();
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMobileError('');
    if (!/^\d{10}$/.test(profileMobile)) {
      setProfileMobileError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    const result = await completeProfile({ completionToken: pendingCompletionToken, mobileNumber: profileMobile });
    setLoading(false);
    if (result.error) { setProfileMobileError(result.error); return; }
    goToSuccess();
  };

  const validateSignIn = () => {
    const e: Record<string, string> = {};
    if (!siUser.trim()) e.user = 'Username is required.';
    if (!siPass) e.pass = 'Password is required.';
    setSiErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateSignUp = () => {
    const e: Record<string, string> = {};
    if (!suUser.trim()) e.user = 'Username is required.';
    else if (suUser.length < 3) e.user = 'Username must be at least 3 characters.';
    if (!suEmail.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suEmail)) e.email = 'Enter a valid email address.';
    if (!suMobile.trim()) e.mobile = 'Mobile number is required.';
    else if (!/^\d{10}$/.test(suMobile.trim())) e.mobile = 'Enter a valid 10-digit mobile number.';
    if (!suPincode.trim()) e.pincode = 'PIN code is required.';
    else if (!/^[1-9][0-9]{5}$/.test(suPincode.trim())) e.pincode = 'Enter a valid 6-digit PIN code.';
    else if (pincodeStatus === 'checking') e.pincode = 'Still checking that PIN code — one moment.';
    else if (pincodeStatus === 'invalid') e.pincode = "That PIN code doesn't exist. Please check it.";
    if (!suPass) e.pass = 'Password is required.';
    else if (suPass.length < 8) e.pass = 'Password must be at least 8 characters.';
    if (suConfirm !== suPass) e.confirm = 'Passwords do not match.';
    setSuErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError('');
    if (!validateSignIn()) return;
    setLoading(true);
    const result = await signIn({ userName: siUser.trim(), password: siPass });
    setLoading(false);
    if (result.needsVerification && result.verificationToken && result.email) {
      enterOtpStep(result.verificationToken, result.email);
      // The stored code may be stale/expired for an old unverified account —
      // send a fresh one the moment they land on the OTP step.
      resendCode({ verificationToken: result.verificationToken });
      return;
    }
    if (result.error) { setGlobalError(result.error); return; }
    goToSuccess();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError('');
    if (!validateSignUp()) return;
    setLoading(true);
    const result = await signUp({
      userName: suUser.trim(), email: suEmail.trim(),
      mobileNumber: suMobile.trim(), pincode: suPincode.trim(), password: suPass,
    });
    setLoading(false);
    if (result.needsVerification && result.verificationToken && result.email) {
      enterOtpStep(result.verificationToken, result.email);
      return;
    }
    if (result.error) { setGlobalError(result.error); return; }
    goToSuccess();
  };

  const handleOtpSubmit = useCallback(async (code: string) => {
    setOtpError('');
    setLoading(true);
    const result = await verifyEmail({ verificationToken: pendingVerificationToken, code });
    setLoading(false);
    if (result.error) { setOtpError(result.error); return; }
    goToSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEmail, pendingVerificationToken]);

  // Auto-submit once all 6 digits are filled.
  //
  // The submit is queued via queueMicrotask so the state writes it
  // triggers (setLoading, setUser, etc.) don't happen synchronously
  // inside the effect body — synchronously nesting a setState inside a
  // useEffect is what the react-hooks/set-state-in-effect rule flags,
  // because it can cause cascading re-renders in the same commit phase.
  // Deferring by a microtask keeps the "submit the moment the box is
  // full" UX identical while letting React finish this render first.
  useEffect(() => {
    const code = otp.join('');
    if (code.length === 6 && step === 'otp' && !loading) {
      queueMicrotask(() => handleOtpSubmit(code));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleResend = async () => {
    if (resendCooldown > 0 || resendSending) return;
    setResendSending(true);
    setOtpError('');
    const result = await resendCode({ verificationToken: pendingVerificationToken });
    setResendSending(false);
    if (result.error) { setOtpError(result.error); return; }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setOtp(['', '', '', '', '', '']);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setStep('form');
    setGlobalError('');
    setSiErrors({});
    setSuErrors({});
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      <VisualPanel tab={tab} />

      {/* ── Form panel ── */}
      <div className="order-2 lg:order-1 flex-1 flex flex-col justify-center items-center px-5 sm:px-8 py-10 lg:px-16 lg:w-[48%]">
        <div className="w-full max-w-md">
          {/* Mobile logo + back link */}
          <div className="flex items-center justify-between mb-6 lg:mb-8">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/icon-512.png"
                alt="doodle_G logo"
                width={28}
                height={28}
                className="w-7 h-7 rounded-lg object-cover"
              />
              <span className="font-display text-lg font-bold text-black">
                doodle_<span className="text-[#2563eb]">G</span>
              </span>
            </Link>
            <Link href="/shop" className="inline-flex items-center gap-1 text-xs text-black/50 hover:text-black transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Back to shop
            </Link>
          </div>

          {/* Tab switcher — hidden mid-flow */}
          {step === 'form' && (
            <div className="flex bg-black/[0.04] border border-black/10 rounded-2xl p-1 mb-8">
              {(['signin', 'signup'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                    tab === t
                      ? t === 'signin' ? 'bg-[#2563eb] text-white shadow-sm' : 'bg-[#16a34a] text-white shadow-sm'
                      : 'text-black/50 hover:text-black'
                  }`}
                >
                  {t === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ── SUCCESS ── */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16 space-y-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                  className="w-16 h-16 bg-[#16a34a]/10 border border-[#16a34a]/30 rounded-full flex items-center justify-center mx-auto"
                >
                  <CheckCircle className="w-8 h-8 text-[#16a34a]" />
                </motion.div>
                <h2 className="font-display text-xl font-bold text-black">
                  {tab === 'signin' ? 'Welcome back!' : 'You\u2019re verified!'}
                </h2>
                <p className="text-sm text-black/50">Redirecting you to the shop…</p>
              </motion.div>
            )}

            {/* ── OTP STEP ── */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="inline-flex items-center gap-1 text-xs text-black/50 hover:text-black transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>

                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-[#facc15]/15 border border-[#facc15]/40 flex items-center justify-center mx-auto">
                    <ShieldCheck className="w-7 h-7 text-black" />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-black">Check your email</h2>
                  <p className="text-sm text-black/50">
                    We sent a 6-digit code to <span className="font-semibold text-black">{pendingEmail}</span>
                  </p>
                </div>

                <OtpInput value={otp} onChange={setOtp} error={otpError} />

                {loading && (
                  <div className="flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-black/40" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resendSending}
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#2563eb] disabled:text-black/30 transition-colors py-2"
                >
                  {resendSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>
              </motion.div>
            )}

            {/* ── MOBILE NUMBER STEP (Google accounts only — Google never gives us a phone number) ── */}
            {step === 'mobile' && (
              <motion.form
                key="mobile"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleCompleteProfile}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-[#2563eb]/10 border border-[#2563eb]/30 flex items-center justify-center mx-auto">
                    <Phone className="w-7 h-7 text-[#2563eb]" />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-black">
                    {pendingName ? `One last thing, ${pendingName.split(' ')[0]}` : 'One last thing'}
                  </h2>
                  <p className="text-sm text-black/50">
                    Add your mobile number to finish setting up your account.
                  </p>
                </div>

                <InputField
                  icon={Phone} label="Mobile number *" type="tel" value={profileMobile}
                  onChange={v => setProfileMobile(v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number" error={profileMobileError} accent="blue" autoComplete="tel"
                />

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#2563eb] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#1d4ed8] transition-all disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><span>Finish setting up</span><ArrowRight className="w-4 h-4" /></>
                  )}
                </motion.button>
              </motion.form>
            )}

            {/* ── SIGN IN form ── */}
            {step === 'form' && tab === 'signin' && (
              <motion.form
                key="signin"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSignIn}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-display text-2xl font-bold text-black">Welcome back</h2>
                  <p className="text-sm text-black/50 mt-1">Sign in to your doodle_G account.</p>
                </div>

                {globalError && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                    {globalError}
                  </motion.div>
                )}

                <InputField
                  icon={User} label="Username" value={siUser} onChange={setSiUser}
                  placeholder="your_username" error={siErrors.user} accent="blue" autoComplete="username"
                />
                <InputField
                  icon={Lock} label="Password" type={showPwd ? 'text' : 'password'}
                  value={siPass} onChange={setSiPass} placeholder="••••••••"
                  error={siErrors.pass} accent="blue" autoComplete="current-password"
                  rightEl={
                    <button type="button" onClick={() => setShowPwd(p => !p)} className="text-black/40 hover:text-black transition-colors">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#2563eb] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#1d4ed8] transition-all disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>
                  )}
                </motion.button>

                <GoogleButton onResult={handleGoogleResult} />

                <p className="text-center text-xs text-black/50">
                  Don&apos;t have an account?{' '}
                  <button type="button" onClick={() => switchTab('signup')} className="text-[#16a34a] font-semibold hover:underline">
                    Create one free
                  </button>
                </p>
              </motion.form>
            )}

            {/* ── SIGN UP form ── */}
            {step === 'form' && tab === 'signup' && (
              <motion.form
                key="signup"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSignUp}
                className="space-y-4"
              >
                <div>
                  <h2 className="font-display text-2xl font-bold text-black">Create account</h2>
                  <p className="text-sm text-black/50 mt-1">Join doodle_G and start gifting with intention.</p>
                </div>

                {globalError && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                    {globalError}
                  </motion.div>
                )}

                <InputField
                  icon={User} label="Username *" value={suUser} onChange={setSuUser}
                  placeholder="choose_a_username" error={suErrors.user} accent="green" autoComplete="username"
                />
                <InputField
                  icon={Mail} label="Email address *" type="email" value={suEmail} onChange={setSuEmail}
                  placeholder="you@email.com" error={suErrors.email} accent="green" autoComplete="email"
                />
                <InputField
                  icon={Phone} label="Mobile number *" type="tel" value={suMobile}
                  onChange={v => setSuMobile(v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number" error={suErrors.mobile} accent="green" autoComplete="tel"
                />
                <div>
                  <InputField
                    icon={MapPin} label="PIN code *" type="text" value={suPincode}
                    onChange={v => setSuPincode(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit postal PIN code" error={suErrors.pincode} accent="green" autoComplete="postal-code"
                    rightEl={
                      pincodeStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin text-black/40" />
                        : pincodeStatus === 'valid' ? <CheckCircle className="w-4 h-4 text-[#16a34a]" />
                        : pincodeStatus === 'invalid' ? <XCircle className="w-4 h-4 text-red-500" />
                        : undefined
                    }
                  />
                  {pincodeStatus === 'valid' && pincodePlace && !suErrors.pincode && (
                    <p className="text-xs text-[#16a34a] mt-1.5 pl-1">
                      {pincodePlace.district}, {pincodePlace.state}
                    </p>
                  )}
                  {pincodeStatus === 'unverifiable' && !suErrors.pincode && (
                    <p className="text-xs text-black/40 mt-1.5 pl-1">
                      Couldn&apos;t verify right now — you can still continue.
                    </p>
                  )}
                </div>
                <InputField
                  icon={Lock} label="Password *" type={showPwd ? 'text' : 'password'}
                  value={suPass} onChange={setSuPass} placeholder="Min. 8 characters"
                  error={suErrors.pass} accent="green" autoComplete="new-password"
                  rightEl={
                    <button type="button" onClick={() => setShowPwd(p => !p)} className="text-black/40 hover:text-black transition-colors">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
                <InputField
                  icon={Lock} label="Confirm Password *" type={showConfirm ? 'text' : 'password'}
                  value={suConfirm} onChange={setSuConfirm} placeholder="Repeat password"
                  error={suErrors.confirm} accent="green" autoComplete="new-password"
                  rightEl={
                    <button type="button" onClick={() => setShowConfirm(p => !p)} className="text-black/40 hover:text-black transition-colors">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#16a34a] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#15803d] transition-all disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><Sparkles className="w-4 h-4" /><span>Create My Account</span></>
                  )}
                </motion.button>

                <GoogleButton onResult={handleGoogleResult} />

                <p className="text-center text-xs text-black/40">
                  By creating an account you agree to our{' '}
                  <span className="text-black/60 font-medium">Terms of Service</span>. We&apos;ll email you a 6-digit code to confirm your address.
                </p>

                <p className="text-center text-xs text-black/50">
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchTab('signin')} className="text-[#2563eb] font-semibold hover:underline">
                    Sign in
                  </button>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />
      </div>
    }>
      <AuthPageContent />
    </Suspense>
  );
}
