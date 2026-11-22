import React from 'react';
import { ShieldCheck, ShieldAlert, Key, ArrowRight, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage, LanguageSwitcher } from '../i18n/LanguageContext';
import { BrandLogo } from './BrandLogo';
import heroArchitectureImg from '../assets/images/sabaa_hero_architecture_1795219098611.jpg';
import vaultCrestImg from '../assets/images/sabaa_vault_crest_1795219098899.jpg';

interface LoginPageProps {
  onOpenAdminLogin?: () => void;
  onOpenKeyRoom?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onOpenAdminLogin, onOpenKeyRoom }) => {
  const { signInWithGoogle, isAuthenticatingGoogle, errorMessage } = useAuth();
  const { isRTL } = useLanguage();

  return (
    <div
      className="min-h-screen sabaa-canvas text-slate-100 flex flex-col justify-between relative overflow-hidden"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Bespoke Architectural Liquidity Topography Backdrop */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <img
          src={heroArchitectureImg}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover opacity-20 mix-blend-lighten scale-105"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 35%, rgba(4,6,10,0.35) 0%, rgba(4,6,10,0.88) 65%, #04060A 100%)',
          }}
        />
      </div>

      {/* Minimal Top Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" />
          <span className="font-black text-base sm:text-lg tracking-tight sabaa-wordmark">
            SABAA QUANT
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline font-mono text-[11px] text-slate-400 tracking-wider uppercase">
            REAL LIVE TERMINAL
          </span>
          <LanguageSwitcher compact />
        </div>
      </header>

      {/* Main Split Editorial Gate */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Brand Sculpture & Architectural Summary (Desktop Focal Left/Right) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-6 pe-4">
            <div className="relative w-44 h-44 rounded-2xl overflow-hidden border border-amber-400/25 bg-[#04060A] shadow-2xl">
              <img
                src={vaultCrestImg}
                alt="SABAA QUANT Crest"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#04060A] via-transparent to-transparent opacity-60" />
            </div>

            <div className="space-y-3">
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-amber-400/90">
                {isRTL ? 'بوابة الأمان المؤسسية · 01 / 02' : 'INSTITUTIONAL ACCESS GATE · 01 / 02'}
              </div>
              <h1 className="text-3xl xl:text-4xl font-black leading-[1.2] text-white">
                {isRTL
                  ? 'التحليل الكمي الموثق وبث السيولة الفعلي'
                  : 'Verified Quantitative Analysis & Direct Liquidity Telemetry'}
              </h1>
              <p className="text-sm text-slate-300/90 leading-relaxed max-w-md">
                {isRTL
                  ? 'منظومة تنفيذ وتحليل خوارزمي متكاملة تعتمد على الشموع الحقيقية المغلقة وإدارة المخاطر الصارمة عبر الحساب الحقيقي فقط.'
                  : 'An algorithmic market engine anchored strictly on verified closed candles and institutional risk governance for live accounts.'}
              </p>
            </div>

            <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400 font-mono">
              <span>26 QUANT MODULES</span>
              <span className="text-amber-500/60">·</span>
              <span>SMC / ICT CONFLUENCE</span>
              <span className="text-amber-500/60">·</span>
              <span>REAL ACCOUNT ONLY</span>
            </div>
          </div>

          {/* Auth Action Vault Frame */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto sabaa-panel-gold rounded-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
            {/* Top gold specular hairline */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />

            {/* Mobile/Compact Crest Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="lg:hidden w-20 h-20 rounded-2xl overflow-hidden border border-amber-400/30 bg-[#04060A] shadow-xl">
                <img
                  src={vaultCrestImg}
                  alt="SABAA QUANT"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-400">
                  {isRTL ? 'المرحلة الأولى · التوثيق السحابي' : 'PHASE 01 · CLOUD IDENTITY'}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {isRTL ? 'تسجيل الدخول إلى المنصة' : 'Sign In to SABAA QUANT'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  {isRTL
                    ? 'يلزم توثيق حساب Google أولاً قبل الانتقال إلى شاشة كود التفعيل.'
                    : 'Google verification is required before proceeding to license activation.'}
                </p>
              </div>
            </div>

            {/* Clean 2-Step Verification Track */}
            <div className="grid grid-cols-2 gap-2.5 text-[11px]">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/40 text-emerald-200 space-y-0.5">
                <div className="font-mono text-[10px] font-bold uppercase text-emerald-400 flex items-center justify-between">
                  <span>{isRTL ? 'الخطوة 01' : 'STEP 01'}</span>
                  <span>{isRTL ? 'الآن' : 'ACTIVE'}</span>
                </div>
                <div className="font-bold text-slate-100">
                  {isRTL ? 'دخول بحساب Google' : 'Google Sign-In'}
                </div>
              </div>
              <div className="p-3 rounded-xl sabaa-well text-slate-400 space-y-0.5">
                <div className="font-mono text-[10px] font-bold uppercase text-amber-400/80">
                  {isRTL ? 'الخطوة 02' : 'STEP 02'}
                </div>
                <div className="font-bold text-slate-300">
                  {isRTL ? 'إدخال كود التفعيل' : 'Activation Key'}
                </div>
              </div>
            </div>

            {/* Error notice */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/35 text-rose-200 text-xs text-center">
                {errorMessage}
              </div>
            )}

            {/* Primary Google Sign In CTA */}
            <div className="space-y-3">
              <button
                onClick={() => signInWithGoogle()}
                disabled={isAuthenticatingGoogle}
                className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-950 font-extrabold text-xs sm:text-sm shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isAuthenticatingGoogle ? (
                  <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{isRTL ? 'تسجيل الدخول بحساب Google للمتابعة' : 'Sign in with Google to Continue'}</span>
                {!isAuthenticatingGoogle && <ArrowRight className={`w-4 h-4 shrink-0 ${isRTL ? 'rotate-180' : ''}`} />}
              </button>

              <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                {isRTL
                  ? 'بعد تسجيل الدخول بحساب Google سيتم نقلك مباشرة إلى شاشة إدخال كود التفعيل الصادر من غرفة المدير.'
                  : 'After Google authentication, enter your license key issued from the Admin Key Room.'}
              </p>
            </div>

            {/* Clean Unboxed Security Metadata */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-center gap-4 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isRTL ? 'توثيق Google إجباري' : 'Google Verified'}</span>
              </span>
              <span className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>{isRTL ? 'ترخيص مربوط بالجهاز' : 'Device Bound'}</span>
              </span>
            </div>

            {/* Administrator & Key Room Portals */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/5">
              {onOpenAdminLogin && (
                <button
                  onClick={onOpenAdminLogin}
                  className="text-[11px] text-slate-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'بوابة دخول المدير' : 'Admin Portal'}</span>
                </button>
              )}
              {onOpenKeyRoom && (
                <button
                  onClick={onOpenKeyRoom}
                  className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer font-bold whitespace-nowrap"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'غرفة توليد الأكواد (المدير)' : 'Admin Key Room'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-3 px-4 text-center font-mono text-[10px] text-slate-500">
        SABAA QUANT · INSTITUTIONAL QUANTITATIVE INFRASTRUCTURE
      </footer>
    </div>
  );
};
