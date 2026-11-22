import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Key,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Plus,
  Copy,
  Check,
  Send,
  RefreshCw,
  Search,
  Filter,
  Clock,
  Smartphone,
  AlertCircle,
  X,
  CheckCircle2,
  Trash2,
  ExternalLink,
  MessageSquare,
  Bot,
  Sliders,
  Settings,
  Cloud,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, getCurrentIdToken, signInWithGoogle } from '../../lib/firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import { telegramService, TelegramStatus } from '../../services/TelegramService';

import { safeStorage } from '../../lib/safeStorage';
import { safeFetchJson } from '../../lib/safeFetchJson';

interface KeyGenerationRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminToken?: string | null;
  bypassGate?: boolean;
  onAdminAuthenticated?: (token: string) => void;
  onOpenAdminDashboard?: () => void;
}

export const KeyGenerationRoomModal: React.FC<KeyGenerationRoomModalProps> = ({
  isOpen,
  onClose,
  adminToken: initialAdminToken,
  bypassGate = false,
  onAdminAuthenticated,
  onOpenAdminDashboard,
}) => {
  const { isRTL } = useLanguage();

  // Security Gate State
  const [roomPassword, setRoomPassword] = useState('');
  const [token, setToken] = useState<string | null>(() => {
    return bypassGate && initialAdminToken ? initialAdminToken : null;
  });
  const [isUnlocked, setIsUnlocked] = useState<boolean>(Boolean(bypassGate && initialAdminToken));
  const [gateError, setGateError] = useState<string | null>(null);
  const [isVerifyingGate, setIsVerifyingGate] = useState(false);

  // Room Content States
  const [activeTab, setActiveTab] = useState<'generate' | 'keys' | 'telegram'>('generate');
  const [codes, setCodes] = useState<any[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Generation Form
  const [durationType, setDurationType] = useState<string>('720'); // Default 30 days
  const [customUnit, setCustomUnit] = useState<'hours' | 'days'>('days');
  const [customValue, setCustomValue] = useState<number>(30);
  const [exactExpiration, setExactExpiration] = useState<string>('');
  const [maxDevices, setMaxDevices] = useState<number>(1);
  const [count, setCount] = useState<number>(1);
  const [boundEmail, setBoundEmail] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [newlyGenerated, setNewlyGenerated] = useState<any[]>([]);
  const [roomSuccessMessage, setRoomSuccessMessage] = useState<string | null>(null);
  const [roomErrorMessage, setRoomErrorMessage] = useState<string | null>(null);
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Telegram Bot State
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramAutoBroadcast, setTelegramAutoBroadcast] = useState(true);
  const [telegramMinConfidence, setTelegramMinConfidence] = useState(70);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [telegramTestMessage, setTelegramTestMessage] = useState<string | null>(null);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [sharingCodeId, setSharingCodeId] = useState<string | null>(null);

  // Cloud Sync State (Firestore cross-instance persistence)
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(() => auth.currentUser?.email || null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudConnected, setCloudConnected] = useState<boolean>(false);
  const cloudSyncDoneRef = useRef<boolean>(false);

  const lockGate = useCallback(() => {
    setIsUnlocked(false);
    setToken(null);
    setRoomPassword('');
    setGateError(null);
    safeStorage.removeSessionItem('sabaa_keyroom_unlocked');
    safeStorage.removeSessionItem('sabaa_admin_token');
  }, []);

  const wasOpenRef = useRef(false);

  // Require password gate every time Key Room opens unless explicitly entered from authenticated AdminDashboard
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setIsUnlocked(false);
      setToken(null);
      setRoomPassword('');
      setGateError(null);
      setNewlyGenerated([]);
      setRoomSuccessMessage(null);
      setRoomErrorMessage(null);
      setConfirmingRevokeId(null);
      setConfirmingDeleteId(null);
      safeStorage.removeSessionItem('sabaa_keyroom_unlocked');
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    // Only enforce initial gate on open (or when switching to bypassGate with a dashboard token)
    if (!justOpened && (!bypassGate || isUnlocked)) {
      return;
    }

    if (!bypassGate || !initialAdminToken) {
      lockGate();
      return;
    }

    let cancelled = false;
    fetch('/api/admin/verify', {
      headers: { 'x-admin-token': initialAdminToken },
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setToken(initialAdminToken);
          setIsUnlocked(true);
        } else {
          lockGate();
        }
      })
      .catch(() => {
        if (!cancelled) lockGate();
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, bypassGate, initialAdminToken, isUnlocked, lockGate]);

  // Track Firebase Google session for cross-instance Firestore sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setCloudUserEmail(fbUser?.email || null);
      if (!fbUser) {
        setCloudConnected(false);
        cloudSyncDoneRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  const buildAdminHeaders = useCallback(
    async (withJsonContentType = false): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {};
      if (withJsonContentType) headers['Content-Type'] = 'application/json';
      if (token) headers['x-admin-token'] = token;
      const fbToken = await getCurrentIdToken(false);
      if (fbToken) headers['x-firebase-id-token'] = fbToken;
      return headers;
    },
    [token]
  );

  // Load Telegram status
  const loadTelegramStatus = useCallback(async () => {
    const status = await telegramService.getStatus();
    setTelegramStatus(status);
    if (status.chatId) setTelegramChatId(status.chatId);
    setTelegramAutoBroadcast(status.autoBroadcastSignals);
    setTelegramMinConfidence(status.minConfidence || 70);
  }, []);

  // Fetch codes list
  const loadCodes = useCallback(async () => {
    if (!token) return;
    setIsLoadingCodes(true);
    try {
      const headers = await buildAdminHeaders(false);
      const result = await safeFetchJson<any>(
        `/api/admin/codes?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`,
        { headers, retryOnRateLimit: true, maxRetries: 2 }
      );
      if (result.status === 401) {
        lockGate();
        return;
      }
      if (result.ok && result.data?.success) {
        setCodes(result.data.codes || []);
        setCloudConnected(Boolean(result.data.cloudConnected));
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingCodes(false);
    }
  }, [token, searchQuery, statusFilter, lockGate, buildAdminHeaders]);

  const syncCloudBidirectional = useCallback(
    async (silent = false) => {
      if (!token) return;
      const fbToken = await getCurrentIdToken(false);
      if (!fbToken) return;
      setIsSyncingCloud(true);
      try {
        const result = await safeFetchJson<any>('/api/admin/codes/sync-cloud', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': token,
            'x-firebase-id-token': fbToken,
          },
          retryOnRateLimit: true,
          maxRetries: 2,
        });
        const data = result.data;
        if (result.ok && data?.success) {
          setCloudConnected(true);
          if (!silent) {
            setRoomSuccessMessage(
              isRTL
                ? `تمت المزامنة السحابية بنجاح (تم رفع ${data.pushedCodes} وتحديث ${data.pulledCodes} كود عبر Firestore).`
                : `Cloud sync complete (${data.pushedCodes} pushed, ${data.pulledCodes} pulled).`
            );
          }
          await loadCodes();
        } else if (!silent) {
          setCloudConnected(false);
          setRoomErrorMessage(
            data?.error ||
              result.errorMessage ||
              (isRTL
                ? 'الحساب المرتبط حالياً ليس حساب المالك المعتمد للمزامنة السحابية.'
                : 'Current Google account is not authorized for admin cloud sync.')
          );
        }
      } catch {
        if (!silent) {
          setRoomErrorMessage(isRTL ? 'تعذر الاتصال بالسحابة للمزامنة.' : 'Cloud sync failed.');
        }
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [token, isRTL, loadCodes]
  );

  const handleConnectGoogleCloudSync = async () => {
    setRoomErrorMessage(null);
    setRoomSuccessMessage(null);
    setIsSyncingCloud(true);
    try {
      const fbTokenExisting = await getCurrentIdToken(false);
      if (!fbTokenExisting) {
        const res = await signInWithGoogle();
        if (res.error || !res.user) {
          setRoomErrorMessage(res.error || (isRTL ? 'لم يكتمل تسجيل الدخول بحساب Google.' : 'Google sign-in was not completed.'));
          setIsSyncingCloud(false);
          return;
        }
        setCloudUserEmail(res.user.email || null);
      }
      await syncCloudBidirectional(false);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  useEffect(() => {
    if (isOpen && isUnlocked && token) {
      loadCodes();
      loadTelegramStatus();
      if (auth.currentUser && !cloudSyncDoneRef.current) {
        cloudSyncDoneRef.current = true;
        void syncCloudBidirectional(true);
      }
    }
  }, [isOpen, isUnlocked, token, loadCodes, loadTelegramStatus, syncCloudBidirectional]);

  if (!isOpen) return null;

  // Handle Room Password Submission (Verified via /api/admin/login)
  const handleGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);
    setIsVerifyingGate(true);

    const clean = roomPassword
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .trim();
    if (!clean) {
      setIsVerifyingGate(false);
      return;
    }

    try {
      const result = await safeFetchJson<any>('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: clean }),
        retryOnRateLimit: true,
        maxRetries: 2,
      });
      const data = result.data;
      setIsVerifyingGate(false);

      if (result.ok && data?.success && data?.token) {
        setToken(data.token);
        setIsUnlocked(true);
        setRoomPassword('');
        if (onAdminAuthenticated) {
          onAdminAuthenticated(data.token);
        }
      } else {
        setGateError(
          data?.error ||
            result.errorMessage ||
            (isRTL
              ? 'كلمة مرور غرفة المدير غير صحيحة. يرجى التأكد والمحاولة مرة أخرى.'
              : 'Access Denied! Incorrect administrator password.')
        );
      }
    } catch {
      setIsVerifyingGate(false);
      setGateError(isRTL ? 'تعذر الاتصال بخادم التحقق الإداري' : 'Unable to reach admin authentication server');
    }
  };

  // Handle Code Generation
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setRoomSuccessMessage(null);
    setRoomErrorMessage(null);

    let durationHours = 720;
    let exactDateIso: string | undefined = undefined;

    if (durationType === 'exact') {
      if (!exactExpiration) {
        setIsGenerating(false);
        setRoomErrorMessage(isRTL ? 'يرجى تحديد تاريخ ووقت الانتهاء.' : 'Please select expiration date and time.');
        return;
      }
      exactDateIso = new Date(exactExpiration).toISOString();
    } else if (durationType === 'custom') {
      durationHours = customUnit === 'days' ? customValue * 24 : customValue;
    } else {
      durationHours = Number(durationType);
    }

    try {
      const headers = await buildAdminHeaders(true);

      const result = await safeFetchJson<any>('/api/admin/codes/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          count,
          durationHours,
          exactExpiration: exactDateIso,
          maxDevices,
          boundUserEmail: boundEmail ? boundEmail.trim().toLowerCase() : undefined,
        }),
        retryOnRateLimit: true,
        maxRetries: 2,
      });

      if (result.status === 401) {
        lockGate();
        return;
      }
      const data = result.data;
      setIsGenerating(false);

      if (result.ok && data?.success && data?.codes) {
        setNewlyGenerated(data.codes);
        setCloudConnected(Boolean(data.cloudSynced));
        setRoomSuccessMessage(
          data.cloudSynced
            ? isRTL
              ? `تم توليد ${data.codes.length} مفتاح ترخيص ومزامنتها سحابياً بنجاح (تعمل الآن على كل الروابط والأجهزة + بوت التلجرام)!`
              : `Successfully generated ${data.codes.length} license key(s) synced to cloud & Telegram Bot API!`
            : isRTL
            ? `تم توليد ${data.codes.length} مفتاح محلياً. اضغط (ربط المزامنة السحابية بحساب Google) أعلاه لتعمل على الرابط المشترك وكل الأجهزة فوراً!`
            : `Generated ${data.codes.length} key(s) locally. Connect Google Cloud Sync above so external links can redeem them.`
        );
        loadCodes();
      } else {
        setRoomErrorMessage(data?.error || result.errorMessage || (isRTL ? 'فشل توليد المفاتيح' : 'Failed to generate codes'));
      }
    } catch (err: any) {
      setIsGenerating(false);
      setRoomErrorMessage(err?.message || (isRTL ? 'خطأ أثناء الاتصال بمولد المفاتيح' : 'Error communicating with key generator service'));
    }
  };

  // Copy code or deep link
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Share key to Telegram
  const handleShareKeyToTelegram = async (codeItem: any) => {
    setSharingCodeId(codeItem.id);
    setRoomSuccessMessage(null);
    setRoomErrorMessage(null);
    const res = await telegramService.shareKeyToTelegram({
      code: codeItem.code,
      durationLabel: codeItem.durationLabel,
      maxDevices: codeItem.maxDevices,
      expiresAt: codeItem.expiresAt,
      adminToken: token || undefined,
    });
    setSharingCodeId(null);
    if (res.success) {
      setRoomSuccessMessage(isRTL ? 'تم نشر المفتاح في قناة / بوت التلجرام بنجاح!' : 'Key posted to Telegram successfully!');
    } else {
      setRoomErrorMessage(res.message || (isRTL ? 'فشل النشر في التلجرام' : 'Failed to share to Telegram'));
    }
  };

  // Toggle code status
  const handleToggleCode = async (codeItem: any) => {
    const nextEnabled = codeItem.status !== 'ACTIVE' && codeItem.status !== 'UNUSED';
    const headers = await buildAdminHeaders(true);

    const res = await fetch(`/api/admin/codes/${codeItem.id}/toggle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ enabled: nextEnabled }),
    });
    if (res.status === 401) {
      lockGate();
      return;
    }
    if (res.ok) {
      setRoomSuccessMessage(nextEnabled ? (isRTL ? 'تم تفعيل الكود بنجاح' : 'Key enabled') : (isRTL ? 'تم تعطيل الكود' : 'Key disabled'));
      loadCodes();
    } else {
      setRoomErrorMessage(isRTL ? 'تعذر تحديث حالة الكود' : 'Failed to update key');
    }
  };

  // Unbind code from current Google user
  const handleUnbindCode = async (codeId: string) => {
    const headers = await buildAdminHeaders(true);

    const result = await safeFetchJson<any>(`/api/admin/codes/${codeId}/unbind`, {
      method: 'POST',
      headers,
      retryOnRateLimit: true,
      maxRetries: 2,
    });
    if (result.status === 401) {
      lockGate();
      return;
    }
    const data = result.data;
    if (result.ok && data?.success) {
      setRoomSuccessMessage(isRTL ? 'تم فك ربط الكود عن المستخدم وإتاحته لإعادة التفعيل' : 'Key unbound and available');
      loadCodes();
    } else {
      setRoomErrorMessage(data?.error || result.errorMessage || (isRTL ? 'تعذر فك ربط الكود' : 'Failed to unbind key'));
    }
  };

  // Delete code permanently
  const handleDeleteCode = async (codeId: string) => {
    setConfirmingDeleteId(null);
    const headers = await buildAdminHeaders(false);

    const result = await safeFetchJson<any>(`/api/admin/codes/${codeId}`, {
      method: 'DELETE',
      headers,
      retryOnRateLimit: true,
      maxRetries: 2,
    });
    if (result.status === 401) {
      lockGate();
      return;
    }
    const data = result.data;
    if (result.ok && data?.success) {
      setRoomSuccessMessage(isRTL ? 'تم حذف المفتاح نهائياً من قاعدة البيانات' : 'Activation key deleted');
      loadCodes();
    } else {
      setRoomErrorMessage(data?.error || result.errorMessage || (isRTL ? 'تعذر حذف المفتاح' : 'Failed to delete key'));
    }
  };

  // Revoke code
  const handleRevoke = async (codeId: string) => {
    setConfirmingRevokeId(null);
    const headers = await buildAdminHeaders(true);

    const res = await fetch(`/api/admin/codes/${codeId}/revoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Revoked from Key Room' }),
    });
    if (res.status === 401) {
      lockGate();
      return;
    }
    if (res.ok) {
      setRoomSuccessMessage(isRTL ? 'تم إلغاء المفتاح بنجاح' : 'Activation key revoked');
      loadCodes();
    } else {
      setRoomErrorMessage(isRTL ? 'تعذر إلغاء المفتاح' : 'Failed to revoke key');
    }
  };

  // Save Telegram config
  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTelegram(true);
    setTelegramTestMessage(null);

    const res = await telegramService.updateConfig({
      botToken: telegramToken.trim() || undefined,
      chatId: telegramChatId.trim() || undefined,
      enabled: true,
      autoBroadcastSignals: telegramAutoBroadcast,
      autoBroadcastTrades: telegramAutoBroadcast,
      displayTimezone: 'UTC+3',
      minConfidence: telegramMinConfidence,
      adminToken: token || undefined,
    });

    setIsSavingTelegram(false);
    if (res.success) {
      setTelegramTestMessage(isRTL ? '✅ تم حفظ إعدادات بوت التلجرام بنجاح!' : 'Telegram settings updated successfully!');
      loadTelegramStatus();
    } else {
      setTelegramTestMessage(`❌ ${res.error || 'Failed to update'}`);
    }
  };

  // Test Telegram connection
  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramTestMessage(null);
    const res = await telegramService.testConnection(telegramChatId);
    setIsTestingTelegram(false);
    setTelegramTestMessage(res.message);
    loadTelegramStatus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md animate-in fade-in duration-200" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="relative w-full max-w-4xl sabaa-panel-gold rounded-2xl sm:rounded-3xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        {/* ================= PASSWORD GATE ================= */}
        {!isUnlocked ? (
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6">
            <div className="p-4 rounded-2xl bg-amber-500/12 text-amber-400 border border-amber-500/35 shadow-[0_0_28px_rgba(245,183,73,0.16)]">
              <Lock className="w-10 h-10" />
            </div>

            <div className="max-w-md space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-50">
                {isRTL ? 'غرفة توليد المفاتيح المشفرة' : 'Encrypted Key Generator Room'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                {isRTL
                  ? 'هذه الغرفة مخصصة حصرياً للمدير العام لتوليد مفاتيح المنصة وربطها مع بوت التلجرام عبر API. ممنوع الدخول بدون كلمة المرور الرسمية.'
                  : 'Restricted room for the Master Administrator to generate real platform keys and integrate with Telegram Bot API.'}
              </p>
            </div>

            {gateError && (
              <div className="p-3.5 rounded-xl bg-rose-500/12 border border-rose-500/35 text-rose-300 text-xs flex items-center gap-2 max-w-md w-full">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{gateError}</span>
              </div>
            )}

            <form onSubmit={handleGateSubmit} className="w-full max-w-md space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 text-left">
                  {isRTL ? 'كلمة المرور الرسمية للغرفة:' : 'Room Password:'}
                </label>
                <input
                  type="password"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 sabaa-well rounded-xl text-amber-300 font-mono text-center tracking-widest focus:outline-none focus:border-amber-400 text-base"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isVerifyingGate || !roomPassword.trim()}
                  className="sabaa-btn-gold flex-1 py-3 px-4 rounded-xl text-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isVerifyingGate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>{isRTL ? 'فتح الغرفة' : 'Unlock Room'}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-4 rounded-xl sabaa-well hover:bg-white/[0.06] text-slate-300 text-xs font-bold cursor-pointer transition-all"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ================= UNLOCKED ROOM ================= */
          <>
            {/* Top Bar */}
            <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#060A12]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/12 text-amber-400 border border-amber-500/35">
                  <Key className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-slate-50">
                      {isRTL ? 'غرفة توليد المفاتيح والربط بالبوت' : 'Key Generator & Bot Room'}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35">
                      {isRTL ? 'مشفّر عبر API' : 'API SECURED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {isRTL
                      ? 'توليد مفاتيح حقيقية (ساعة إلى سنة) ومربوطة فورياً مع بوت التلجرام عبر API'
                      : 'Generate real keys (1h to 1y) with instant Telegram Bot API synchronization'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onOpenAdminDashboard && (
                  <button
                    type="button"
                    onClick={onOpenAdminDashboard}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isRTL ? 'لوحة المدير الكاملة' : 'Admin Dashboard'}</span>
                  </button>
                )}

                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl sabaa-well text-xs">
                  <Bot className={`w-3.5 h-3.5 ${telegramStatus?.configured ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className="text-[11px] text-slate-300">
                    {telegramStatus?.botUsername ? `@${telegramStatus.botUsername}` : isRTL ? 'البوت غير مربوط' : 'Bot Offline'}
                  </span>
                </div>

                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Cloud Sync Status Strip */}
            <div
              className={`px-4 sm:px-6 py-2.5 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs ${
                cloudConnected
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'bg-amber-500/10 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Cloud className={`w-4 h-4 shrink-0 ${cloudConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span>
                  {cloudConnected
                    ? isRTL
                      ? `المزامنة السحابية متصلة (${cloudUserEmail || 'Google'}) — كل الأكواد تعمل على رابط المشاركة وجميع الأجهزة.`
                      : `Cloud Sync Active (${cloudUserEmail || 'Google'}) — keys work across all links & devices.`
                    : isRTL
                    ? 'لضمان عمل الأكواد على الرابط المشترك وكل الأجهزة، اربط المزامنة السحابية بحساب Google المعتمد.'
                    : 'Connect authorized Google Cloud Sync so generated keys work across shared links & devices.'}
                </span>
              </div>
              <button
                type="button"
                onClick={cloudUserEmail ? () => void syncCloudBidirectional(false) : handleConnectGoogleCloudSync}
                disabled={isSyncingCloud}
                className="px-3 py-1 rounded-lg bg-black/40 hover:bg-black/60 border border-current/25 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                <span>
                  {cloudUserEmail
                    ? isRTL
                      ? 'مزامنة السحابة الآن'
                      : 'Sync Cloud Now'
                    : isRTL
                    ? 'ربط المزامنة السحابية (Google)'
                    : 'Connect Cloud Sync (Google)'}
                </span>
              </button>
            </div>

            {/* Error Notification Banner */}
            {roomErrorMessage && (
              <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center justify-between gap-2">
                <span>{roomErrorMessage}</span>
                <button onClick={() => setRoomErrorMessage(null)} className="text-rose-400 hover:text-rose-200 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 border-b border-white/[0.07] bg-[#05080F] text-xs font-bold overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('generate')}
                className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'generate'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>{isRTL ? 'توليد مفاتيح جديدة' : 'Generate Keys'}</span>
              </button>

              <button
                onClick={() => setActiveTab('keys')}
                className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'keys'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-4 h-4" />
                <span>{isRTL ? 'إدارة وسجل المفاتيح' : 'Keys Database'}</span>
                <span className="px-1.5 py-0.5 rounded-md sabaa-well text-[10px] font-mono tabular-nums text-slate-300">
                  {codes.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('telegram')}
                className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'telegram'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>{isRTL ? 'إعدادات بوت التلجرام' : 'Telegram Bot API'}</span>
                {telegramStatus?.configured && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
              </button>
            </div>

            {/* Body Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* ================= TAB 1: GENERATE KEYS ================= */}
              {activeTab === 'generate' && (
                <div className="space-y-6">
                  {roomSuccessMessage && (
                    <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span>{roomSuccessMessage}</span>
                    </div>
                  )}

                  <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 sabaa-well p-4 sm:p-6 rounded-2xl">
                    {/* Duration Picker */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="block text-xs font-bold text-slate-200">
                        {isRTL ? 'مدة صلاحية المفتاح (تبدأ من ساعة حتى سنة):' : 'Key Duration (1 Hour to 1 Year):'}
                      </label>
                      <select
                        value={durationType}
                        onChange={(e) => setDurationType(e.target.value)}
                        className="w-full py-2.5 px-3 bg-[#060A12] border border-white/[0.1] rounded-xl text-slate-100 font-mono text-xs sm:text-sm focus:outline-none focus:border-amber-400"
                      >
                        <option value="1">⏱ 1 Hour (ساعة واحدة - تجربة فورية)</option>
                        <option value="24">📅 24 Hours (يوم كامل - 24 ساعة)</option>
                        <option value="168">🗓 7 Days (أسبوع كامل - 7 أيام)</option>
                        <option value="720">⭐️ 30 Days (شهر كامل - 30 يوماً)</option>
                        <option value="2160">⚡️ 90 Days (3 أشهر - 90 يوماً)</option>
                        <option value="4320">💎 180 Days (6 أشهر - نصف سنة)</option>
                        <option value="8760">👑 1 Year (سنة كاملة - 365 يوماً - VIP)</option>
                        <option value="custom">⚙️ Custom Duration (تحديد عدد مخصص من الساعات أو الأيام)</option>
                        <option value="exact">🎯 Exact Date & Time (تحديد تاريخ ووقت دقيق للانتهاء)</option>
                      </select>
                    </div>

                    {/* Custom Duration Sub-form */}
                    {durationType === 'custom' && (
                      <div className="md:col-span-2 p-3.5 rounded-xl bg-[#060A12] border border-white/[0.1] flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          max="87600"
                          value={customValue}
                          onChange={(e) => setCustomValue(Number(e.target.value))}
                          className="w-32 py-2 px-3 bg-[#04060A] border border-white/[0.1] rounded-lg text-slate-100 font-mono tabular-nums text-sm"
                        />
                        <select
                          value={customUnit}
                          onChange={(e) => setCustomUnit(e.target.value as any)}
                          className="py-2 px-3 bg-[#04060A] border border-white/[0.1] rounded-lg text-slate-100 text-xs font-mono"
                        >
                          <option value="hours">{isRTL ? 'ساعات' : 'Hours'}</option>
                          <option value="days">{isRTL ? 'أيام' : 'Days'}</option>
                        </select>
                        <span className="text-xs text-slate-400">
                          = {customUnit === 'days' ? customValue * 24 : customValue} {isRTL ? 'ساعة إجمالية' : 'total hours'}
                        </span>
                      </div>
                    )}

                    {/* Exact Date & Time */}
                    {durationType === 'exact' && (
                      <div className="md:col-span-2 p-3.5 rounded-xl bg-[#060A12] border border-white/[0.1]">
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          {isRTL ? 'تاريخ ووقت الانتهاء الدقيق:' : 'Exact Expiration Date & Time:'}
                        </label>
                        <input
                          type="datetime-local"
                          value={exactExpiration}
                          onChange={(e) => setExactExpiration(e.target.value)}
                          className="w-full py-2 px-3 bg-[#04060A] border border-white/[0.1] rounded-lg text-slate-100 font-mono text-xs"
                          required
                        />
                      </div>
                    )}

                    {/* Max Devices */}
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        {isRTL ? 'حد الأجهزة المسموحة لكل كود:' : 'Max Devices per Key:'}
                      </label>
                      <select
                        value={maxDevices}
                        onChange={(e) => setMaxDevices(Number(e.target.value))}
                        className="w-full py-2.5 px-3 bg-[#060A12] border border-white/[0.1] rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-400"
                      >
                        <option value="1">1 Device (جهاز واحد فقط)</option>
                        <option value="2">2 Devices (جهازان)</option>
                        <option value="3">3 Devices (3 أجهزة)</option>
                        <option value="5">5 Devices (5 أجهزة)</option>
                        <option value="10">10 Devices (10 أجهزة)</option>
                      </select>
                    </div>

                    {/* Batch Count */}
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        {isRTL ? 'عدد المفاتيح المطلوب توليدها دفعة واحدة:' : 'Number of Keys to Generate:'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={count}
                        onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                        className="w-full py-2.5 px-3 bg-[#060A12] border border-white/[0.1] rounded-xl text-slate-100 font-mono tabular-nums text-xs focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    {/* Optional Bound User Email */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        {isRTL ? 'ربط بحساب Google محدد (اختياري - اتركه فارغاً ليكون متاحاً لأي حساب):' : 'Optional Bound Google Email (leave blank for any user):'}
                      </label>
                      <input
                        type="email"
                        value={boundEmail}
                        onChange={(e) => setBoundEmail(e.target.value)}
                        placeholder="trader@example.com"
                        className="w-full py-2.5 px-3 bg-[#060A12] border border-white/[0.1] rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="md:col-span-2 pt-2">
                      <button
                        type="submit"
                        disabled={isGenerating}
                        className="sabaa-btn-gold w-full py-3 px-4 rounded-xl text-xs sm:text-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        <span>{isRTL ? 'توليد المفاتيح الآن وربطها بالبوت' : 'Generate Keys & Link to Bot'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Newly Generated Keys Grid */}
                  {newlyGenerated.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <span>{isRTL ? 'المفاتيح المولدة حديثاً:' : 'Recently Generated Keys:'}</span>
                        <span className="text-[11px] text-amber-400">{newlyGenerated.length} مفتاح</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {newlyGenerated.map((c) => {
                          const botUser = telegramStatus?.botUsername || '';
                          const deepLink = botUser ? `https://t.me/${botUser}?start=${encodeURIComponent(c.code)}` : '';

                          return (
                            <div key={c.id} className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 flex flex-col justify-between gap-3 text-xs">
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-amber-300 text-sm">{c.code}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">
                                    {c.status}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  {c.durationLabel} • {c.maxDevices} {isRTL ? 'أجهزة' : 'Devices'}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(c.code, c.id)}
                                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 border border-slate-700 cursor-pointer"
                                >
                                  {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  <span>{isRTL ? 'نسخ الكود' : 'Copy'}</span>
                                </button>

                                {deepLink && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(deepLink, `dl_${c.id}`)}
                                    className="flex-1 py-1.5 px-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-[11px] font-bold flex items-center justify-center gap-1 border border-blue-500/30 cursor-pointer"
                                    title="Copy Telegram Deep Link"
                                  >
                                    {copiedId === `dl_${c.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Bot className="w-3.5 h-3.5" />}
                                    <span>{isRTL ? 'رابط البوت' : 'Bot Link'}</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleShareKeyToTelegram(c)}
                                  disabled={sharingCodeId === c.id}
                                  className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 cursor-pointer"
                                  title={isRTL ? 'إرسال إلى قناة التلجرام' : 'Send to Telegram'}
                                >
                                  {sharingCodeId === c.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ================= TAB 2: KEYS DATABASE ================= */}
              {activeTab === 'keys' && (
                <div className="space-y-4">
                  {/* Filters & Search */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    <div className="relative flex-1">
                      <Search className={`w-4 h-4 text-slate-500 absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'}`} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={isRTL ? 'بحث برمز الكود أو البريد الإلكتروني...' : 'Search by code or email...'}
                        className={`w-full py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500 ${
                          isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                        }`}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="py-1.5 px-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="UNUSED">UNUSED</option>
                        <option value="EXPIRED">EXPIRED</option>
                        <option value="REVOKED">REVOKED</option>
                      </select>

                      <button
                        onClick={loadCodes}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                        title="Refresh"
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoadingCodes ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">{isRTL ? 'رمز الكود' : 'Code'}</th>
                            <th className="py-2.5 px-2">{isRTL ? 'الحالة' : 'Status'}</th>
                            <th className="py-2.5 px-2">{isRTL ? 'المدة' : 'Duration'}</th>
                            <th className="py-2.5 px-2">{isRTL ? 'الأجهزة' : 'Devices'}</th>
                            <th className="py-2.5 px-2">{isRTL ? 'المستخدم' : 'Bound User'}</th>
                            <th className="py-2.5 px-3 text-right">{isRTL ? 'الإجراءات' : 'Actions'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {codes.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500">
                                {isRTL ? 'لا توجد مفاتيح مسجلة' : 'No activation codes found'}
                              </td>
                            </tr>
                          ) : (
                            codes.map((c) => (
                              <tr key={c.id} className="hover:bg-slate-900/50 transition-colors">
                                <td className="py-2.5 px-3 font-bold text-amber-300 flex items-center gap-1.5">
                                  <span>{c.id === 'code_master_sbaa0000' ? '••••••••' : c.code}</span>
                                  {c.id !== 'code_master_sbaa0000' && (
                                    <button
                                      onClick={() => handleCopy(c.code, c.id)}
                                      className="p-1 text-slate-500 hover:text-amber-300 cursor-pointer"
                                    >
                                      {copiedId === c.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  )}
                                </td>
                                <td className="py-2.5 px-2">
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                      c.status === 'ACTIVE'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : c.status === 'UNUSED'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-rose-500/20 text-rose-400'
                                    }`}
                                  >
                                    {c.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-slate-300 truncate max-w-[140px]">{c.durationLabel}</td>
                                <td className="py-2.5 px-2">
                                  {c.id === 'code_master_sbaa0000' ? (
                                    <span className="text-emerald-400 font-bold">{c.activeDevicesCount || 0} / ∞</span>
                                  ) : (
                                    <span>{c.activeDevicesCount || 0} / {c.maxDevices}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-slate-400 truncate max-w-[140px]">
                                  {c.id === 'code_master_sbaa0000' ? (
                                    <span className="text-emerald-400 font-semibold">
                                      {isRTL ? 'متاح للجميع (دائم)' : 'Open to All (Lifetime)'}
                                    </span>
                                  ) : (
                                    c.boundUserEmail || (isRTL ? 'متاح' : 'Unbound')
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {c.id !== 'code_master_sbaa0000' && (
                                      <button
                                        onClick={() => handleShareKeyToTelegram(c)}
                                        disabled={sharingCodeId === c.id}
                                        className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded cursor-pointer"
                                        title={isRTL ? 'نشر في التلجرام' : 'Send to Telegram'}
                                      >
                                        <Send className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {c.id !== 'code_master_sbaa0000' && (
                                      <button
                                        onClick={() => handleToggleCode(c)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                          c.status === 'DISABLED'
                                            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                            : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                        }`}
                                      >
                                        {c.status === 'DISABLED' ? (isRTL ? 'تفعيل' : 'Enable') : (isRTL ? 'تعطيل' : 'Disable')}
                                      </button>
                                    )}
                                    {c.id !== 'code_master_sbaa0000' && c.boundUserEmail && (
                                      <button
                                        onClick={() => handleUnbindCode(c.id)}
                                        className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-bold cursor-pointer"
                                        title={isRTL ? 'فك ربط الحساب' : 'Unbind Account'}
                                      >
                                        {isRTL ? 'فك الربط' : 'Unbind'}
                                      </button>
                                    )}
                                    {c.status !== 'REVOKED' && c.id !== 'code_master_sbaa0000' && (
                                      confirmingRevokeId === c.id ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => handleRevoke(c.id)}
                                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                                          >
                                            {isRTL ? 'تأكيد' : 'Yes'}
                                          </button>
                                          <button
                                            onClick={() => setConfirmingRevokeId(null)}
                                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                                          >
                                            {isRTL ? 'إلغاء' : 'No'}
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setConfirmingRevokeId(c.id)}
                                          className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold cursor-pointer"
                                          title={isRTL ? 'إلغاء المفتاح' : 'Revoke'}
                                        >
                                          {isRTL ? 'إلغاء' : 'Revoke'}
                                        </button>
                                      )
                                    )}
                                    {c.id !== 'code_master_sbaa0000' && (
                                      confirmingDeleteId === c.id ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => handleDeleteCode(c.id)}
                                            className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                          >
                                            {isRTL ? 'حذف' : 'Del'}
                                          </button>
                                          <button
                                            onClick={() => setConfirmingDeleteId(null)}
                                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                                          >
                                            {isRTL ? 'لا' : 'No'}
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setConfirmingDeleteId(c.id)}
                                          className="p-1 text-rose-400 hover:bg-rose-500/20 rounded cursor-pointer"
                                          title={isRTL ? 'حذف نهائي' : 'Delete Key'}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= TAB 3: TELEGRAM BOT API ================= */}
              {activeTab === 'telegram' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs flex items-start gap-3">
                    <Bot className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-blue-100">
                        {isRTL ? 'ربط المفاتيح مع بوت التلجرام الرسمي عبر API' : 'Telegram Bot API Key Integration'}
                      </p>
                      <p className="text-[11px] text-blue-300/80 mt-1 leading-relaxed">
                        {isRTL
                          ? 'يقوم البوت باستقبال أوامر التفعيل (/activate) والتحقق من صلاحية المفاتيح ومدة الاشتراك، وبث إشارات التداول الحية مباشرة للقناة. تم إلغاء أي ارتباط بتحميل تطبيقات الهواتف؛ التركيز بالكامل على منصة الويب الحقيقية.'
                          : 'The bot verifies license keys (/activate), subscription time, and broadcasts confirmed algorithmic signals. Completely isolated from phone APK downloads; purely focused on real web platform access.'}
                      </p>
                    </div>
                  </div>

                  {telegramTestMessage && (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono">
                      {telegramTestMessage}
                    </div>
                  )}

                  <form onSubmit={handleSaveTelegram} className="space-y-4 bg-slate-950/60 p-4 sm:p-6 rounded-2xl border border-slate-800 text-xs">
                    <div>
                      <label className="block font-bold text-slate-200 mb-1">
                        {isRTL ? 'رمز توكن البوت (Bot Token from @BotFather):' : 'Telegram Bot Token:'}
                      </label>
                      <input
                        type="password"
                        value={telegramToken}
                        onChange={(e) => setTelegramToken(e.target.value)}
                        placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                        className="w-full py-2.5 px-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-200 mb-1">
                        {isRTL ? 'معرف القناة أو المجموعة للبث (Channel / Chat ID):' : 'Target Chat / Channel ID:'}
                      </label>
                      <input
                        type="text"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="@SabaaSignalsChannel or -1001234567890"
                        className="w-full py-2.5 px-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="autoBroadcast"
                          checked={telegramAutoBroadcast}
                          onChange={(e) => setTelegramAutoBroadcast(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor="autoBroadcast" className="text-slate-300 font-bold cursor-pointer">
                          {isRTL ? 'بث الإشارات المؤكدة تلقائياً للبوت/القناة' : 'Auto-broadcast confirmed signals'}
                        </label>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-300 mb-1">
                          {isRTL ? 'الحد الأدنى لقوة الإشارة للبث (%):' : 'Minimum Confidence for Broadcast (%):'}
                        </label>
                        <input
                          type="number"
                          min="50"
                          max="95"
                          value={telegramMinConfidence}
                          onChange={(e) => setTelegramMinConfidence(Number(e.target.value))}
                          className="w-full py-2 px-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-800">
                      <button
                        type="submit"
                        disabled={isSavingTelegram}
                        className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition-all flex items-center justify-center gap-2"
                      >
                        {isSavingTelegram ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                        <span>{isRTL ? 'حفظ إعدادات البوت' : 'Save Telegram Settings'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={isTestingTelegram || !telegramChatId}
                        className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isTestingTelegram ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>{isRTL ? 'إرسال رسالة تجريبية' : 'Send Test Alert'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
