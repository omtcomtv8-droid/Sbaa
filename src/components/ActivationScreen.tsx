import React, { useState } from 'react';
import { ShieldAlert, Key, CheckCircle2, LogOut, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage, LanguageSwitcher } from '../i18n/LanguageContext';
import { BrandLogo } from './BrandLogo';
import { sanitizeActivationCodeInput } from '../utils/codeNormalizer';
import heroArchitectureImg from '../assets/images/sabaa_hero_architecture_1795219098611.jpg';
import vaultCrestImg from '../assets/images/sabaa_vault_crest_1795219098899.jpg';

interface ActivationScreenProps {
  onOpenAdminLogin?: () => void;
  onOpenKeyRoom?: () => void;
}

export const ActivationScreen: React.FC<ActivationScreenProps> = ({
  onOpenAdminLogin,
  onOpenKeyRoom,
}) => {
  const { authState, user, activateCode, logOut, isActivating, errorMessage } = useAuth();
  const { isRTL } = useLanguage();
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeActivationCodeInput(code);
    if (!cleaned) return;
    setLocalError(null);
    const res = await activateCode(cleaned);
    if (!res.success) {
      setLocalError(res.error || (isRTL ? 'فشل التحقق من كود التفعيل' : 'Invalid activation code'));
    }
  };

  const isStatusWarning =
    authState === 'EXPIRED' || authState === 'REVOKED' || authState === 'DEVICE_LIMIT_REACHED';

  const getStatusBannerText = () => {
    if (authState === 'EXPIRED') {
      return isRTL
        ? 'انتهت صلاحية كود التفعيل السابق لهذا الحساب. أدخل كوداً جديداً من غرفة المدير للمتابعة.'
        : 'Your previous activation key has expired. Enter a new activation key from the Admin Key Room.';
    }
    if (authState === 'REVOKED') {
      return isRTL
        ? 'تم إلغاء أو تعطيل الترخيص السابق. يرجى التواصل مع المدير أو إدخال كود تفعيل نشط.'
        : 'Your license or account access was revoked/disabled. Contact the admin or enter an active key.';
    }
    if (authState === 'DEVICE_LIMIT_REACHED') {
      return isRTL
        ? 'تم الوصول للحد الأقصى للأجهزة المسموحة لهذا الكود. استخدم كوداً آخر أو اطلب توسيع الحد من المدير.'
        : 'Device limit reached for this activation code.';
    }
    return isRTL
      ? 'تم توثيق حساب Google بنجاح. أدخل الآن كود التفعيل الصادر من غرفة المدير لفتح المنصة وربط حسابك.'
      : 'Google account verified. Enter your activation key from the Admin Key Room to unlock the terminal.';
  };

  return (
    <div
      className="min-h-screen sabaa-canvas text-slate-100 flex flex-col justify-between relative overflow-hidden"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Bespoke Architectural Backdrop */}
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
              'radial-gradient(circle at 50% 35%, rgba(4,6,10,0.35) 0%, rgba(4,6,10,0.9) 68%, #04060A 100%)',
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
          <span className="hidden sm:inline font-mono text-[11px] text-amber-400/90 tracking-wider uppercase">
            STEP 02 / LICENSE GATE
          </span>
          <LanguageSwitcher compact />
        </div>
      </header>

      {/* Main Activation Vault */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left Desktop Crest & Verification Overview */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-6 pe-4">
            <div className="relative w-44 h-44 rounded-2xl overflow-hidden border border-amber-400/25 bg-[#04060A] shadow-2xl">
              <img
                src={vaultCrestImg}
                alt="SABAA QUANT Vault"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#04060A] via-transparent to-transparent opacity-60" />
            </div>

            <div className="space-y-3">
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-emerald-400">
                {isRTL ? 'المرحلة الثانية · تفعيل الترخيص' : 'LICENSE VERIFICATION · 02 / 02'}
              </div>
              <h1 className="text-3xl xl:text-4xl font-black leading-[1.2] text-white">
                {isRTL
                  ? 'ربط حسابك بكود التفعيل الرسمي'
                  : 'Bind Your Session with an Authorized License Key'}
              </h1>
              <p className="text-sm text-slate-300/90 leading-relaxed max-w-md">
                {isRTL
                  ? 'تتحقق هذه البوابة من صلاحية كود التفعيل، المدة الزمنية المحددة، وربط الحساب بحساب Google وجهازك بأمان تام.'
                  : 'License duration, single-use rules, and device binding are enforced directly through the authenticated server vault.'}
              </p>
            </div>

            <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400 font-mono">
              <span className="text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> GOOGLE VERIFIED
              </span>
              <span className="text-amber-500/60">·</span>
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" /> ENCRYPTED KEY CHECK
              </span>
            </div>
          </div>

          {/* Right Form Container */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto sabaa-panel-gold rounded-2xl p-6 sm:p-8 space-y-5 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />

            {/* Header */}
            <div className="flex flex-col items-center text-center space-y-2.5">
              <div className="lg:hidden w-16 h-16 rounded-2xl overflow-hidden border border-amber-400/30 bg-[#04060A]">
                <img src={vaultCrestImg} alt="SABAA QUANT" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-amber-400">
                  {isRTL ? 'بوابة التحقق من الترخيص' : 'ACTIVATION TERMINAL'}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                  SABAA QUANT
                </h2>
              </div>
            </div>

            {/* 2-Step Track */}
            <div className="grid grid-cols-2 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded-xl bg-emerald-500/12 border border-emerald-400/40 text-emerald-200 space-y-0.5">
                <div className="font-mono text-[10px] font-bold uppercase text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{isRTL ? 'الخطوة 01 · مكتملة' : 'STEP 01 · DONE'}</span>
                </div>
                <div className="font-bold truncate text-slate-100">
                  {isRTL ? 'تم دخول Google' : 'Google Verified'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/12 border border-amber-400/45 text-amber-200 space-y-0.5">
                <div className="font-mono text-[10px] font-bold uppercase text-amber-400">
                  {isRTL ? 'الخطوة 02 · الحالية' : 'STEP 02 · CURRENT'}
                </div>
                <div className="font-bold text-slate-100">
                  {isRTL ? 'إدخال كود التفعيل' : 'Activation Key'}
                </div>
              </div>
            </div>

            {/* Verified Google Account Strip */}
            {user && (
              <div className="p-3 rounded-xl sabaa-well flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 text-start">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full border border-emerald-400/40 shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center justify-center font-black text-sm shrink-0">
                      {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-100 truncate">{user.displayName}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{user.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => logOut()}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                  title={isRTL ? 'تغيير حساب Google' : 'Switch Google Account'}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'تبديل' : 'Switch'}</span>
                </button>
              </div>
            )}

            {/* Status Notice */}
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs text-start ${
                isStatusWarning
                  ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
                  : 'bg-amber-500/10 border-amber-400/25 text-amber-200'
              }`}
            >
              {isStatusWarning ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <p className="leading-relaxed">{getStatusBannerText()}</p>
            </div>

            {(localError || errorMessage) && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs text-center">
                {localError || errorMessage}
              </div>
            )}

            {/* Activation Code Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(sanitizeActivationCodeInput(e.target.value));
                    setLocalError(null);
                  }}
                  placeholder="SABAA-XXXX-XXXX-XXXX"
                  dir="ltr"
                  className="w-full py-3.5 px-4 sabaa-well rounded-xl text-slate-100 placeholder-slate-500 font-mono text-sm tracking-[0.18em] text-center focus:outline-none focus:border-amber-400/70 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isActivating || !code.trim()}
                className="w-full py-3.5 px-4 rounded-xl sabaa-btn-gold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isActivating ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{isRTL ? 'تفعيل الكود ودخول المنصة' : 'Activate Key & Enter Terminal'}</span>
              </button>
            </form>

            {/* Footer Admin Links */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-center gap-5 text-xs">
              {onOpenAdminLogin && (
                <button
                  onClick={onOpenAdminLogin}
                  className="text-slate-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'بوابة المدير' : 'Admin Portal'}</span>
                </button>
              )}

              {onOpenKeyRoom && (
                <button
                  onClick={onOpenKeyRoom}
                  className="text-amber-400 hover:text-amber-300 font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'غرفة توليد الأكواد' : 'Key Room'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-3 px-4 text-center font-mono text-[10px] text-slate-500">
        SABAA QUANT · LICENSED REAL-ACCOUNT ACCESS ONLY
      </footer>
    </div>
  );
};
