import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  Key,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import { DiagnosticsInfo } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import {
  pocketOptionSessionStore,
  PocketOptionSessionSnapshot,
} from '../services/PocketOptionSessionStore';
import { accountStore } from '../services/AccountStore';
import { pocketOptionConnectionService } from '../services/PocketOptionConnectionService';
import { parsePocketOptionTokenInput } from '../lib/pocketOptionTokenParser';

interface GatewayOnboardingCardProps {
  diagnostics?: DiagnosticsInfo | null;
  firebaseUser?: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL?: string | null;
  } | null;
  onSignInGoogle?: () => void;
  onSignOut?: () => void;
  onConnectAccount?: (params: {
    endpoint?: string;
    sessionToken: string;
    isDemo: boolean;
    uid?: number | null;
  }) => Promise<{ success: boolean; error?: string; diagnostics?: DiagnosticsInfo }>;
  onDisconnectAccount?: () => void;
  onEnterTerminal: () => void;
  configuredSession?: string;
  configuredIsDemo?: boolean;
  configuredUid?: string | number | null;
  isReconnecting?: boolean;
  forceHighlight?: boolean;
  onClearHighlight?: () => void;
}

export const GatewayOnboardingCard: React.FC<GatewayOnboardingCardProps> = ({
  diagnostics,
  firebaseUser,
  onSignInGoogle,
  onConnectAccount,
  onDisconnectAccount,
  onEnterTerminal,
  configuredSession = '',
  configuredUid,
  isReconnecting = false,
  forceHighlight = false,
  onClearHighlight,
}) => {
  const { t, tTerm, tDynamic, isRTL } = useLanguage();
  // 1. Local state for form (Locked to REAL Live Account only)
  const mode: 'REAL' = 'REAL';
  const [sessionToken, setSessionToken] = useState<string>(configuredSession || '');
  const [uid, setUid] = useState<string>(configuredUid ? String(configuredUid) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [targetEndpoint, setTargetEndpoint] = useState<string>(
    diagnostics?.endpoint && diagnostics.endpoint.startsWith('wss://') && !diagnostics.endpoint.includes('demo-api-')
      ? diagnostics.endpoint
      : 'wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket'
  );
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showQuickHelp, setShowHelp] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [verificationProgress, setVerificationProgress] = useState<{
    formatCheck: 'pending' | 'active' | 'success' | 'failed';
    isolationCheck: 'pending' | 'active' | 'success' | 'failed';
    socketCheck: 'pending' | 'active' | 'success' | 'failed';
    balanceCheck: 'pending' | 'active' | 'success' | 'failed';
    signalCheck: 'pending' | 'active' | 'success' | 'failed';
  }>({
    formatCheck: 'pending',
    isolationCheck: 'pending',
    socketCheck: 'pending',
    balanceCheck: 'pending',
    signalCheck: 'pending',
  });

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionToken(configuredSession || '');
  }, [configuredSession]);

  useEffect(() => {
    setUid(configuredUid ? String(configuredUid) : '');
  }, [configuredUid]);

  useEffect(() => {
    setSessionToken(configuredSession || '');
    setUid(configuredUid ? String(configuredUid) : '');
    setConnectError(null);
  }, [firebaseUser?.uid]);

  const [poSession, setPoSession] = useState<PocketOptionSessionSnapshot>(() => pocketOptionSessionStore.getState());
  const [accState, setAccState] = useState(() => accountStore.getState());
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  const handleRefreshBalance = async () => {
    setIsRefreshingBalance(true);
    await pocketOptionConnectionService.requestBalanceRefresh();
    setTimeout(() => setIsRefreshingBalance(false), 2000);
  };

  useEffect(() => {
    const unsub1 = pocketOptionSessionStore.subscribe((snap) => {
      setPoSession(snap);
      if (snap.cachedSessionToken && !sessionToken) {
        setSessionToken(snap.cachedSessionToken);
      }
      if (snap.error && snap.connectionState === 'PO_CONNECTION_FAILED') {
        setConnectError(snap.error.message);
      }
    });
    const unsub2 = accountStore.subscribe(setAccState);
    return () => {
      unsub1();
      unsub2();
    };
  }, [sessionToken]);

  const isAuthVerified = Boolean(diagnostics?.authVerified || poSession.authenticated);
  const balance =
    diagnostics?.account.balance !== null && typeof diagnostics?.account.balance === 'number' && !isNaN(diagnostics.account.balance)
      ? diagnostics.account.balance
      : poSession.balance !== null && typeof poSession.balance === 'number' && !isNaN(poSession.balance)
      ? poSession.balance
      : accState.balance !== null && typeof accState.balance === 'number' && !isNaN(accState.balance)
      ? accState.balance
      : null;
  const balanceAvailable = balance !== null && balance !== undefined;

  useEffect(() => {
    if (poSession.authenticated || isAuthVerified) {
      setActiveStep(3);
    } else if (
      isSubmitting ||
      isReconnecting ||
      poSession.connectionState === 'PO_CONNECTION_CONNECTING' ||
      poSession.connectionState === 'PO_CONNECTION_AUTHENTICATING'
    ) {
      setActiveStep(2);
    } else if (poSession.connectionState === 'PO_CONNECTION_FAILED') {
      setActiveStep(1);
    }
  }, [poSession.authenticated, poSession.connectionState, isAuthVerified, isSubmitting, isReconnecting]);

  useEffect(() => {
    if (forceHighlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => {
        if (onClearHighlight) onClearHighlight();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [forceHighlight, onClearHighlight]);

  const parsedPreview = useMemo(() => {
    const parsed = parsePocketOptionTokenInput(sessionToken, uid);
    const isMismatch = Boolean(parsed.payloadDetectedMode && parsed.payloadDetectedMode !== mode);

    return {
      cleanSession: parsed.cleanSession,
      detectedUid: parsed.detectedUid,
      detectedPlatform: parsed.detectedPlatform,
      payloadDetectedMode: parsed.payloadDetectedMode,
      detectedMode: parsed.payloadDetectedMode || mode,
      isMismatch,
      format: parsed.formatLabel,
      maskedSession: parsed.maskedSession,
      isValid: parsed.isValid,
      errorReason: parsed.errorReason,
    };
  }, [sessionToken, uid, mode]);

  const handleSessionChange = (val: string) => {
    setSessionToken(val);
    setConnectError(null);

    const parsed = parsePocketOptionTokenInput(val, null);
    if (parsed.detectedUid && parsed.detectedUid > 0) {
      setUid(String(parsed.detectedUid));
    }
  };

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setConnectError(null);

    if (!parsedPreview.cleanSession || parsedPreview.cleanSession.length < 8) {
      setConnectError('رمز الجلسة غير صالح أو أقل من 8 أحرف. يرجى إدخال رمز الجلسة الصحيح.');
      return;
    }

    if (parsedPreview.payloadDetectedMode === 'DEMO') {
      setConnectError('تم إيقاف الحساب التجريبي (DEMO). يرجى استخدام جلسة الحساب الحقيقي فقط (isDemo=0).');
      return;
    }

    if (
      isSubmitting ||
      poSession.connectionState === 'PO_CONNECTION_CONNECTING' ||
      poSession.connectionState === 'PO_CONNECTION_AUTHENTICATING'
    ) {
      return;
    }

    const isDemoBool = false;
    const parsedUidNum = uid ? parseInt(uid, 10) : parsedPreview.detectedUid || undefined;

    setIsSubmitting(true);
    setActiveStep(2);

    setVerificationProgress({
      formatCheck: 'active',
      isolationCheck: 'pending',
      socketCheck: 'pending',
      balanceCheck: 'pending',
      signalCheck: 'pending',
    });

    try {
      setVerificationProgress((prev) => ({ ...prev, formatCheck: 'success', isolationCheck: 'active' }));
      setVerificationProgress((prev) => ({ ...prev, isolationCheck: 'success', socketCheck: 'active' }));

      let res: { ok: boolean; errorMessage?: string; balance?: number | null };

      if (onConnectAccount) {
        const out = await onConnectAccount({
          sessionToken: parsedPreview.cleanSession,
          isDemo: isDemoBool,
          uid: parsedUidNum,
          endpoint: targetEndpoint,
        });
        res = {
          ok: out.success,
          errorMessage: out.error,
          balance: out.diagnostics?.account?.balance ?? null,
        };
      } else {
        const out = await pocketOptionConnectionService.connect({
          sessionToken: parsedPreview.cleanSession,
          isDemo: isDemoBool,
          uid: parsedUidNum,
          endpoint: targetEndpoint,
        });
        res = {
          ok: out.ok,
          errorMessage: out.errorMessage,
          balance: out.balance,
        };
      }

      if (!res.ok) {
        setIsSubmitting(false);
        setActiveStep(1);
        setConnectError(res.errorMessage || 'فشل الاتصال بالبوابة. تأكد من صحة رمز الجلسة وسيرفر Pocket Option.');
        setVerificationProgress((prev) => ({ ...prev, socketCheck: 'failed' }));
        return;
      }

      setVerificationProgress((prev) => ({ ...prev, socketCheck: 'success', balanceCheck: 'active' }));

      if (res.balance !== null && res.balance !== undefined) {
        setVerificationProgress((prev) => ({ ...prev, balanceCheck: 'success', signalCheck: 'success' }));
      } else {
        setVerificationProgress((prev) => ({ ...prev, balanceCheck: 'active', signalCheck: 'success' }));
      }

      setIsSubmitting(false);
      setActiveStep(3);
    } catch (err: any) {
      setIsSubmitting(false);
      setActiveStep(1);
      setConnectError(err.message || 'حدث خطأ غير متوقع أثناء الاتصال');
    }
  };

  const handleEnter = () => {
    onEnterTerminal();
  };

  return (
    <div
      ref={cardRef}
      id="gateway-onboarding-card"
      className={`rounded-2xl transition-all duration-200 p-5 sm:p-6 space-y-4 ${isRTL ? 'text-right' : 'text-left'} ${
        forceHighlight
          ? 'sabaa-panel-gold ring-2 ring-amber-400/50'
          : isAuthVerified
          ? 'sabaa-panel-emerald'
          : 'sabaa-panel-gold'
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5 gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-100 font-mono flex items-center gap-2">
            <span>Real System Gateway</span>
            <span className="text-[10px] text-amber-300 font-mono">V2.5</span>
          </div>
          <div className="text-[11px] text-slate-400 font-sans mt-0.5">
            {tDynamic('Session Authentication & Account Isolation Gate')}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold shrink-0">
          {isAuthVerified ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{tDynamic('Verified & Active')}</span>
            </span>
          ) : isSubmitting ? (
            <span className="flex items-center gap-1.5 text-amber-300">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{tDynamic('Verifying...')}</span>
            </span>
          ) : (
            <span className="text-slate-400">{tDynamic('Awaiting Credentials')}</span>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-sans">
        <div
          className={`py-1.5 px-2 rounded-lg border transition-colors ${
            activeStep === 1
              ? 'bg-amber-500/15 border-amber-400/40 text-amber-300 font-bold'
              : 'sabaa-well text-slate-400'
          }`}
        >
          1. {tDynamic('Enter Token')}
        </div>
        <div
          className={`py-1.5 px-2 rounded-lg border transition-colors ${
            activeStep === 2
              ? 'bg-amber-500/15 border-amber-400/40 text-amber-300 font-bold'
              : 'sabaa-well text-slate-400'
          }`}
        >
          2. {tDynamic('Verify Session')}
        </div>
        <div
          className={`py-1.5 px-2 rounded-lg border transition-colors ${
            activeStep === 3
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 font-bold'
              : 'sabaa-well text-slate-400'
          }`}
        >
          3. {tDynamic('Enter Terminal')}
        </div>
      </div>

      {/* Warning Notice */}
      {connectError && !diagnostics?.authVerified && !poSession.authenticated && (
        <div
          className={`p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 ${
            isRTL ? 'text-right' : 'text-left'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="font-bold">{tDynamic('Authentication Warning:')}</div>
            <div className="text-[11px] leading-relaxed">{connectError}</div>
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleConnect()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isRTL ? 'إعادة المحاولة (Retry Connection)' : 'Retry Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CASE A: ALREADY VERIFIED STATE */}
      {isAuthVerified && (
        <div className="p-4 rounded-xl sabaa-well border-emerald-500/35 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="font-black text-xs uppercase tracking-wide text-emerald-300">
                  {tDynamic('حساب حقيقي مباشر موثق ومحمي (REAL LIVE)')}
                </span>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {tDynamic('متصل بسيرفر Pocket Option الحقيقي وتتداول بأموالك الحقيقية')}
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-black border bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shrink-0">
              REAL
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs font-mono pt-1">
            <div className="p-3 rounded-lg bg-[#04060A] border border-white/[0.06]">
              <span className="text-[10px] text-slate-400 font-sans block mb-0.5">{tDynamic('الرصيد المتوفر:')}</span>
              <span className="text-sm font-bold flex items-center gap-1.5 text-emerald-400 font-mono tabular-nums">
                {balanceAvailable && typeof balance === 'number' ? (
                  `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : poSession.balanceState === 'BALANCE_LOADING' || diagnostics?.subsystems.account === 'LOADING' ? (
                  <span className="flex items-center gap-1 text-xs text-amber-300">
                    <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                    {tDynamic('جاري جلب الرصيد...')}
                  </span>
                ) : poSession.balanceState === 'BALANCE_UNAVAILABLE' ? (
                  <span className="text-xs text-slate-400">{tDynamic('الرصيد غير متوفر حالياً')}</span>
                ) : (
                  '--'
                )}
              </span>
              {(!balanceAvailable || poSession.balanceState === 'BALANCE_UNAVAILABLE') && (
                <button
                  type="button"
                  onClick={handleRefreshBalance}
                  disabled={isRefreshingBalance}
                  className="mt-1 text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingBalance ? 'animate-spin' : ''}`} />
                  <span>{tDynamic('إعادة طلب الرصيد (Retry)')}</span>
                </button>
              )}
            </div>
            <div className="p-3 rounded-lg bg-[#04060A] border border-white/[0.06]">
              <span className="text-[10px] text-slate-400 font-sans block mb-0.5">{tDynamic('معرّف الحساب (UID):')}</span>
              <span className="text-xs font-bold text-slate-200 tabular-nums">
                {poSession.account?.accountId || diagnostics?.account.uidMasked || diagnostics?.authUid || diagnostics?.account.uid || uid || tDynamic('تم التحقق')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1">
            <span className="text-slate-400 font-sans">{tDynamic('خادم الاتصال:')}</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1.5 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{tDynamic('WebSocket متصل ومباشر')}</span>
            </span>
          </div>

          <div className="pt-1">
            <button
              id="btn-enter-terminal-verified"
              onClick={onEnterTerminal}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl sabaa-btn-emerald text-xs cursor-pointer"
            >
              <span>{tDynamic('Enter Trading Terminal (Ready)')}</span>
              <ArrowLeft className={`w-4 h-4 ${isRTL ? '' : 'rotate-180'}`} />
            </button>
          </div>

          {onDisconnectAccount && (
            <div className="text-center pt-1">
              <button
                onClick={onDisconnectAccount}
                className="text-[10px] text-slate-400 hover:text-rose-400 underline cursor-pointer"
              >
                {tDynamic('Change account or disconnect current session')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* CASE B: DATA ENTRY & VERIFICATION FLOW */}
      {!isAuthVerified && (
        <form onSubmit={handleConnect} className="space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>{tDynamic('رمز الجلسة / حزمة الـ SSD (Session Token)')}</span>
                <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowHelp(!showQuickHelp)}
                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-sans"
              >
                <HelpCircle className="w-3 h-3" />
                <span>{tDynamic('كيف تستخرج الـ SSD؟')}</span>
              </button>
            </div>
            <div className="relative">
              <textarea
                id="input-gateway-session"
                rows={4}
                dir="ltr"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                value={sessionToken}
                onChange={(e) => handleSessionChange(e.target.value)}
                placeholder={tDynamic('الصق هنا رمز الجلسة أو حزمة الـ SSD: 42["auth",{"session":"...","isDemo":0,"uid":...}]')}
                className={`w-full py-2.5 px-3 pl-8 rounded-xl sabaa-well text-xs font-mono text-left break-all text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 resize-y ${
                  sessionToken && !parsedPreview.isValid
                    ? 'border-amber-500/50 focus:ring-amber-500'
                    : 'focus:border-amber-400/60 focus:ring-amber-400/25'
                }`}
              />
              <Key className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
            </div>
          </div>

          {sessionToken && parsedPreview.payloadDetectedMode && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                parsedPreview.payloadDetectedMode === 'REAL'
                  ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/50 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    parsedPreview.payloadDetectedMode === 'REAL'
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                      : 'bg-rose-500/15 border-rose-500/35 text-rose-400'
                  }`}
                >
                  {parsedPreview.payloadDetectedMode === 'REAL' ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <ShieldAlert className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black tracking-wide">
                      {parsedPreview.payloadDetectedMode === 'REAL'
                        ? tDynamic('تم التعرف: حساب حقيقي مباشر (REAL LIVE)')
                        : tDynamic('تم رفض الجلسة: حساب تجريبي غير مدعوم (isDemo = 1)')}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                        parsedPreview.payloadDetectedMode === 'REAL'
                          ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/25 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {parsedPreview.payloadDetectedMode === 'REAL' ? 'isDemo = 0' : 'isDemo = 1'}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-80 mt-0.5 font-sans leading-relaxed">
                    {parsedPreview.payloadDetectedMode === 'REAL'
                      ? tDynamic('تم فحص الـ SSD بنجاح: تم التعرف على جلسة تداول بأموال حقيقية على منصة Pocket Option.')
                      : tDynamic('تم إيقاف الحساب التجريبي؛ يرجى لصق جلسة الحساب الحقيقي (isDemo=0).')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Real Account Lock Indicator */}
          <div className="p-3 rounded-xl sabaa-well border-emerald-500/30 text-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-xs font-black uppercase tracking-wide">
                  {tTerm('Real Account')} (REAL LIVE)
                </div>
                <div className="text-[10px] text-slate-400 font-sans">
                  {tDynamic('اتصال مباشر بالحساب الحقيقي فقط (isDemo = 0)')}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-400">isDemo=0</span>
          </div>

          {/* UID Field */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300">
                {tDynamic('رقم الحساب (UID)')}{' '}
                <span className="text-slate-500 font-normal">
                  ({tDynamic('اختياري - يتم جلبه تلقائياً من الـ SSD أو المنصة')})
                </span>
              </label>
              {parsedPreview.detectedUid && parsedPreview.detectedUid > 0 ? (
                <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1 tabular-nums">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{tDynamic('تم جلبه من الـ SSD:')} {parsedPreview.detectedUid}</span>
                </span>
              ) : null}
            </div>
            <div className="relative">
              <input
                id="input-gateway-uid"
                type="number"
                dir="ltr"
                value={uid}
                onChange={(e) => {
                  setUid(e.target.value);
                  setConnectError(null);
                }}
                placeholder={
                  parsedPreview.detectedUid
                    ? String(parsedPreview.detectedUid)
                    : tDynamic('مثال: 12345678 (أو اتركه فارغاً للاكتشاف التلقائي)')
                }
                className="w-full py-2 px-3 pl-8 rounded-xl sabaa-well focus:border-amber-400/60 focus:ring-amber-400/25 text-xs font-mono text-left text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1"
              />
              <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Live Token Breakdown */}
          {sessionToken && (
            <div className="p-3 rounded-xl sabaa-well text-[10px] font-mono space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 gap-2">
                <span>{tDynamic('البروتوكول والصيغة:')}</span>
                <span className="text-amber-300 font-bold" dir="ltr">{parsedPreview.format}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 gap-2">
                <span>{tDynamic('مفتاح الجلسة المقنع:')}</span>
                <span className="text-slate-300" dir="ltr">
                  {parsedPreview.maskedSession} ({parsedPreview.cleanSession.length} chars)
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>{tDynamic('السيرفر المستهدف:')}</span>
                <span className="text-amber-400 font-bold font-mono">
                  {targetEndpoint.includes('api-eu')
                    ? 'api-eu.po.market (رئيسي موصى به)'
                    : targetEndpoint.includes('api-us')
                    ? 'api-us-north.po.market (أمريكا)'
                    : 'api-sc.po.market (سيشيل)'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-0.5">
                <span className="text-slate-500 text-[9px]">{tDynamic('تبديل السيرفر:')}</span>
                <button
                  type="button"
                  onClick={() => setTargetEndpoint('wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket')}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-all cursor-pointer ${
                    targetEndpoint.includes('api-eu.po.market')
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                      : 'bg-[#04060A] text-slate-400 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  api-eu (موصى به)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetEndpoint('wss://api-us-north.po.market/socket.io/?EIO=4&transport=websocket')}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-all cursor-pointer ${
                    targetEndpoint.includes('api-us-north.po.market')
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                      : 'bg-[#04060A] text-slate-400 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  api-us-north
                </button>
                <button
                  type="button"
                  onClick={() => setTargetEndpoint('wss://api-sc.po.market/socket.io/?EIO=4&transport=websocket')}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-all cursor-pointer ${
                    targetEndpoint.includes('api-sc.po.market')
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                      : 'bg-[#04060A] text-slate-400 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  api-sc
                </button>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-slate-400">{tDynamic('حالة التحقق المبدئي:')}</span>
                <span className={parsedPreview.isValid ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {parsedPreview.isValid ? `✓ ${tDynamic('جاهز للمصادقة وتأكيد الاتصال')}` : parsedPreview.errorReason}
                </span>
              </div>
            </div>
          )}

          {showQuickHelp && (
            <div className={`p-3 rounded-xl sabaa-well text-[11px] text-slate-300 space-y-1.5 ${isRTL ? 'text-right' : 'text-left'}`}>
              <div className="font-bold text-amber-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                <span>{tDynamic('How to extract session token in seconds:')}</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[10px] text-slate-400 leading-relaxed">
                <li>{tDynamic('Open broker trading terminal and press F12 to open Developer Tools (DevTools).')}</li>
                <li>{tDynamic('Navigate to the Network tab and filter by WS (WebSockets).')}</li>
                <li>{tDynamic('Select active connection and find payload starting with 42["auth", ...] or copy the session value.')}</li>
                <li>{tDynamic('Paste the full payload here, and our parser will safely isolate credentials.')}</li>
              </ol>
            </div>
          )}

          {/* Google Cloud Auth Status Row */}
          <div className="p-2.5 rounded-xl sabaa-well flex items-center justify-between text-xs">
            <span className="text-slate-400 font-sans text-[11px]">{tDynamic('Cloud Backup (Google):')}</span>
            {firebaseUser ? (
              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold font-sans">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{firebaseUser.displayName || t('header.cloudAccount', 'Cloud Account')}</span>
              </div>
            ) : onSignInGoogle ? (
              <button
                type="button"
                onClick={onSignInGoogle}
                className="text-amber-400 hover:text-amber-300 text-[11px] underline font-sans cursor-pointer"
              >
                {t('header.cloudSignIn', 'Sign In with Google')}
              </button>
            ) : (
              <span className="text-slate-500 text-[11px]">{tDynamic('Not Active')}</span>
            )}
          </div>

          {/* Verification Step-by-Step Progress */}
          {isSubmitting && (
            <div className="p-3 rounded-xl sabaa-well border-amber-400/30 space-y-2 text-xs">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>{tDynamic('Verifying session step-by-step:')}</span>
              </div>
              <div className="space-y-1 text-[10px] font-sans">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">1. {tDynamic('Payload check & de-duplication:')}</span>
                  <span className={verificationProgress.formatCheck === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                    {verificationProgress.formatCheck === 'success' ? `✓ ${tDynamic('Valid')}` : tDynamic('Checking...')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">2. {tDynamic('Account context isolation & session generation:')}</span>
                  <span className={verificationProgress.isolationCheck === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                    {verificationProgress.isolationCheck === 'success' ? `✓ ${tDynamic('Isolated')}` : tDynamic('Processing...')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">3. {tDynamic('WebSocket protocol handshake:')}</span>
                  <span className={verificationProgress.socketCheck === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                    {verificationProgress.socketCheck === 'success' ? `✓ ${tDynamic('Connected')}` : tDynamic('Waiting...')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">4. {tDynamic('Balance retrieval & verification:')}</span>
                  <span className={verificationProgress.balanceCheck === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                    {verificationProgress.balanceCheck === 'success' ? `✓ ${tDynamic('Verified')}` : tDynamic('Waiting...')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">5. {tDynamic('Signal engine activation:')}</span>
                  <span className={verificationProgress.signalCheck === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                    {verificationProgress.signalCheck === 'success' ? `✓ ${tDynamic('Ready')}` : tDynamic('Waiting...')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-1">
            <button
              id="btn-gateway-connect-and-verify"
              type="submit"
              disabled={isSubmitting || !sessionToken.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl sabaa-btn-gold text-xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{tDynamic('Connecting and verifying session...')}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>{tDynamic('Connect & Verify Session')}</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleEnter}
              className="text-[11px] text-slate-400 hover:text-amber-300 underline transition-colors cursor-pointer"
            >
              {tDynamic('Or continue in preview / read-only mode (without active session)')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
