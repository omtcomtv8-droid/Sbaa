import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Clock,
  Key,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Wifi,
  WifiOff,
  Bot,
} from 'lucide-react';
import { DiagnosticsInfo, Signal } from '../types';
import { useLanguage, LanguageSwitcher } from '../i18n/LanguageContext';
import { pocketOptionSessionStore } from '../services/PocketOptionSessionStore';
import { accountStore } from '../services/AccountStore';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  diagnostics: DiagnosticsInfo | null;
  activeSignal?: Signal | null;
  onSelectSignal?: (signal: Signal) => void;
  selectedAsset?: string;
  selectedTimeframe?: number;
  onOpenSettings: () => void;
  onReconnect: () => void;
  isReconnecting: boolean;
  firebaseUser?: {
    uid?: string;
    id?: string;
    displayName: string | null;
    email: string | null;
    photoURL?: string | null;
  } | null;
  user?: {
    id?: string;
    uid?: string;
    displayName: string | null;
    email: string | null;
    photoURL?: string | null;
  } | null;
  onSignInGoogle?: () => void;
  onSignOut?: () => void;
  onOpenLanding?: () => void;
  onOpenAndroidInstall?: () => void;
  onOpenAdmin?: () => void;
  onOpenKeyRoom?: () => void;
  onOpenTelegramSettings?: () => void;
  activation?: {
    code?: string;
    expiresAt?: string;
    durationLabel?: string;
  } | null;
}

export const Header: React.FC<HeaderProps> = ({
  diagnostics,
  activeSignal,
  onSelectSignal,
  selectedAsset,
  onOpenSettings,
  onReconnect,
  isReconnecting,
  firebaseUser,
  user,
  onSignInGoogle,
  onSignOut,
  onOpenLanding,
  onOpenAdmin,
  onOpenKeyRoom,
  onOpenTelegramSettings,
  activation,
}) => {
  const { t, tTerm, tDynamic, isRTL } = useLanguage();
  const activeUser = user || firebaseUser;

  const [poSession, setPoSession] = useState(() => pocketOptionSessionStore.getState());
  const [accState, setAccState] = useState(() => accountStore.getState());
  useEffect(() => {
    const unsub1 = pocketOptionSessionStore.subscribe(setPoSession);
    const unsub2 = accountStore.subscribe(setAccState);
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const subsystems = diagnostics?.subsystems;
  const overall = subsystems?.overall || 'DISCONNECTED';
  const account = diagnostics?.account;
  const freshness = diagnostics?.freshnessSeconds ?? 999;
  const latency = diagnostics?.latencyMs ?? 0;

  const effectiveBalance =
    account?.balance !== null && typeof account?.balance === 'number' && !isNaN(account.balance)
      ? account.balance
      : poSession.balance !== null && typeof poSession.balance === 'number' && !isNaN(poSession.balance)
      ? poSession.balance
      : accState.balance !== null && typeof accState.balance === 'number' && !isNaN(accState.balance)
      ? accState.balance
      : null;
  const isBalanceLoading =
    (effectiveBalance === null || effectiveBalance === undefined) &&
    (subsystems?.account === 'LOADING' || poSession.balanceState === 'BALANCE_LOADING');

  const getStatusBadge = () => {
    switch (overall) {
      case 'LIVE':
        return (
          <div
            id="badge-status-live"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0"
            title="WebSocket connected, session verified, and real market ticks streaming"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t('header.liveStream', 'LIVE STREAM')}</span>
          </div>
        );
      case 'ACCOUNT_READY':
      case 'AUTHENTICATED':
        return (
          <div
            id="badge-status-authenticated"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0"
            title="Session confirmed by Pocket Option protocol (successauth)"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{t('header.authenticated', 'AUTHENTICATED')}</span>
          </div>
        );
      case 'AUTH_FAILED':
        return (
          <button
            id="badge-status-auth-failed"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            title={diagnostics?.authError ? tDynamic(diagnostics.authError) : t('header.authFailed', 'AUTH FAILED (UPDATE SSD)')}
          >
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>{t('header.authFailed', 'AUTH FAILED (UPDATE SSD)')}</span>
          </button>
        );
      case 'SOCKET_CONNECTED':
        return (
          <div
            id="badge-status-socket-connected"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0"
            title="WebSocket transport connected, awaiting authentication response"
          >
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>{t('header.socketConnected', 'SOCKET CONNECTED')}</span>
          </div>
        );
      case 'RECONNECTING':
      case 'CONNECTION_LOST':
        return (
          <div
            id="badge-status-reconnecting"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0"
            title="Connection lost, attempting WebSocket transport reconnection"
          >
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>{t('header.reconnecting', 'RECONNECTING')}</span>
          </div>
        );
      case 'SYNCING':
        return (
          <div
            id="badge-status-syncing"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 whitespace-nowrap shrink-0"
            title="Connected to platform, loading candles and subscribing to tick feed"
          >
            <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
            <span>{t('header.syncing', 'SYNCING FEED')}</span>
          </div>
        );
      case 'AUTHENTICATING':
        return (
          <div
            id="badge-status-authenticating"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0"
            title="Performing Pocket Option session authentication handshake"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>{tTerm('Authenticating')}</span>
          </div>
        );
      case 'STALE':
        return (
          <div
            id="badge-status-stale"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0"
            title="Tick feed has not received updates in over 8 seconds. Signals paused."
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>{tTerm('Stale')} ({freshness > 90 ? '>90s' : `${freshness}s`})</span>
          </div>
        );
      case 'CONNECTING':
        return (
          <div
            id="badge-status-connecting"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
            <span>{tTerm('Connecting')}</span>
          </div>
        );
      case 'ERROR':
        return (
          <div
            id="badge-status-error"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 whitespace-nowrap shrink-0"
            title={diagnostics?.error || 'Connection error'}
          >
            <WifiOff className="w-3 h-3 text-rose-400" />
            <span>{tTerm('Connection')} {tTerm('Error')}</span>
          </div>
        );
      case 'DISCONNECTED':
      default:
        return (
          <div
            id="badge-status-disconnected"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold sabaa-well text-slate-400 whitespace-nowrap shrink-0"
          >
            <WifiOff className="w-3 h-3" />
            <span>{t('header.disconnected', 'DISCONNECTED')}</span>
          </div>
        );
    }
  };

  return (
    <header className="w-full bg-[#060A12]/95 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-5 lg:px-6 py-2.5 transition-colors font-sans safe-pt">
      <div className="max-w-7xl 2xl:max-w-[1700px] mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3">
        {/* Title */}
        <div className="flex items-center justify-between md:justify-start gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenLanding}
            className="flex items-center gap-2.5 min-w-0 text-left rtl:text-right cursor-pointer group"
          >
            <BrandLogo size="sm" className="shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black tracking-tight sabaa-wordmark truncate">
                  SABAA QUANT
                </h1>
                <span className="hidden sm:inline text-[10px] font-mono text-emerald-400/90 font-semibold whitespace-nowrap">
                  · REAL LIVE
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate hidden sm:block">
                {t('appSubtitle', 'Institutional algorithmic quantitative engine, multi-strategy confluence, and risk management')}
              </p>
            </div>
          </button>

          {/* Mobile Quick Actions */}
          <div className="flex items-center gap-1.5 md:hidden shrink-0">
            <LanguageSwitcher compact />
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg sabaa-btn-gold cursor-pointer"
              title={t('header.sessionSettings', 'Trading Session (SSD)')}
            >
              <Key className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Metrics & Actions */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-1.5 sm:gap-2 text-xs font-mono">
          <div className="hidden md:block">
            <LanguageSwitcher compact />
          </div>

          {getStatusBadge()}

          {/* Real Account Readout */}
          {account && (
            <div
              id="header-account-pill"
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg sabaa-well text-slate-300 text-[11px] tabular-nums whitespace-nowrap shrink-0"
              title={
                diagnostics?.authVerified
                  ? isRTL
                    ? `الحساب الحقيقي النشط ($${effectiveBalance?.toFixed(2) || '0.00'})`
                    : `Active Real Account ($${effectiveBalance?.toFixed(2) || '0.00'})`
                  : 'Real account session status'
              }
            >
              {subsystems?.auth === 'failed' || account.status === 'INVALID' || account.status === 'EXPIRED' ? (
                <span className="text-[9px] font-bold uppercase text-rose-400 font-sans">
                  {t('header.unauthorized', 'UNAUTHORIZED')}
                </span>
              ) : diagnostics?.authVerified ? (
                <span className="text-[9px] font-bold uppercase font-mono flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  REAL
                </span>
              ) : (
                <span className="text-[9px] font-bold uppercase text-slate-500 font-mono">
                  NO SSD
                </span>
              )}

              <span className="text-white/15">|</span>

              {effectiveBalance !== null && typeof effectiveBalance === 'number' && !isNaN(effectiveBalance) ? (
                <span className="font-bold text-amber-300 font-mono tabular-nums">
                  ${effectiveBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              ) : isBalanceLoading ? (
                <span className="flex items-center gap-1 text-[10px] text-amber-300">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-400" />
                  <span>{isRTL ? 'جلب...' : 'Loading...'}</span>
                </span>
              ) : (
                <span className="text-slate-500">--</span>
              )}
            </div>
          )}

          {/* Latency */}
          {latency > 0 && subsystems?.websocket === 'connected' && (
            <div className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-lg sabaa-well text-slate-400 text-[11px] tabular-nums whitespace-nowrap shrink-0">
              <Wifi className="w-3 h-3 text-amber-400" />
              <span>{latency}ms</span>
            </div>
          )}

          {/* License Expiration */}
          {activation && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-400/25 text-[10px] text-amber-300 font-mono whitespace-nowrap shrink-0"
              title={
                activation.expiresAt
                  ? isRTL
                    ? `ينتهي في: ${new Date(activation.expiresAt).toLocaleString()}`
                    : `Expires at: ${new Date(activation.expiresAt).toLocaleString()}`
                  : isRTL
                  ? 'دائم • وقت لا محدود'
                  : 'Unlimited Lifetime Access'
              }
            >
              <Key className="w-3 h-3 text-amber-400" />
              <span>
                {activation.expiresAt
                  ? `${activation.durationLabel || 'Active'} (${new Date(activation.expiresAt).toLocaleDateString()})`
                  : activation.durationLabel || (isRTL ? 'دائم • وقت لا محدود' : 'Unlimited')}
              </span>
            </div>
          )}

          {onOpenTelegramSettings && (
            <button
              onClick={onOpenTelegramSettings}
              className="p-1.5 rounded-lg sabaa-well hover:border-sky-400/40 text-sky-400 text-xs transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title={isRTL ? 'بوت التلجرام وبث الإشارات' : 'Telegram Bot & Broadcast'}
            >
              <Bot className="w-3.5 h-3.5" />
            </button>
          )}

          {onOpenKeyRoom && (
            <button
              onClick={onOpenKeyRoom}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
              title={isRTL ? 'غرفة توليد المفاتيح' : 'Key Generator Room'}
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">{isRTL ? 'غرفة المفاتيح' : 'Key Room'}</span>
            </button>
          )}

          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="p-1.5 rounded-lg sabaa-well hover:border-amber-400/40 text-slate-400 hover:text-amber-300 text-xs transition-colors cursor-pointer shrink-0"
              title={isRTL ? 'لوحة تحكم المشرف' : 'Admin Panel'}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
            </button>
          )}

          {activeUser ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg sabaa-well text-[11px] text-slate-300 font-sans whitespace-nowrap shrink-0">
              {activeUser.photoURL ? (
                <img
                  src={activeUser.photoURL}
                  alt={activeUser.displayName || 'User'}
                  className="w-4 h-4 rounded-full object-cover border border-white/15"
                />
              ) : (
                <div className="w-2 h-2 rounded-full bg-emerald-400" title="Active Session" />
              )}
              <span className="max-w-[75px] sm:max-w-[110px] truncate font-medium">
                {activeUser.displayName || activeUser.email || 'Trader'}
              </span>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-slate-400 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                  title={isRTL ? 'تسجيل الخروج' : 'Sign Out'}
                >
                  <LogOut className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : onSignInGoogle ? (
            <button
              id="header-firebase-login"
              onClick={onSignInGoogle}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg sabaa-well hover:border-amber-400/40 text-amber-300 text-xs font-sans font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Sign in with Firebase Cloud"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-400" />
              <span>Cloud</span>
            </button>
          ) : null}

          <button
            id="btn-reconnect"
            onClick={onReconnect}
            disabled={isReconnecting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg sabaa-well hover:border-white/20 text-slate-300 text-[11px] font-sans transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            title={t('header.reconnect', 'Resync Stream')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">{t('header.reconnect', 'Resync')}</span>
          </button>

          <button
            id="btn-settings"
            onClick={onOpenSettings}
            className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg sabaa-btn-gold text-xs font-sans whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>{t('header.sessionSettings', 'Trading Session (SSD)')}</span>
          </button>
        </div>
      </div>

      {/* RESPONSIVE SIGNAL HEADER */}
      {activeSignal && (
        <div className="max-w-7xl 2xl:max-w-[1700px] mx-auto mt-2.5">
          <div
            id="header-signal-bar"
            onClick={() => onSelectSignal?.(activeSignal)}
            role="button"
            tabIndex={0}
            className={`w-full px-3 sm:px-4 py-2 rounded-xl border transition-all duration-200 flex items-center justify-between gap-2 sm:gap-3 text-xs cursor-pointer group select-none ${
              activeSignal.type === 'UP'
                ? 'bg-gradient-to-r from-emerald-950/60 via-[#080E18] to-[#080E18] border-emerald-500/45 hover:border-emerald-400'
                : activeSignal.type === 'DOWN'
                ? 'bg-gradient-to-r from-rose-950/60 via-[#080E18] to-[#080E18] border-rose-500/45 hover:border-rose-400'
                : 'sabaa-well border-amber-400/25 hover:border-amber-400/45'
            }`}
            title={t('signals.clickForDetails', 'Click to open full Signal Analysis')}
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 font-mono">
              {activeSignal.type === 'UP' && (
                <div
                  id="header-signal-up"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-black text-xs sm:text-sm tracking-wider shrink-0"
                >
                  <ArrowUp className="w-4 h-4 stroke-[3] text-emerald-400" />
                  <span>{tTerm('UP')}</span>
                </div>
              )}
              {activeSignal.type === 'DOWN' && (
                <div
                  id="header-signal-down"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/50 font-black text-xs sm:text-sm tracking-wider shrink-0"
                >
                  <ArrowDown className="w-4 h-4 stroke-[3] text-rose-400" />
                  <span>{tTerm('DOWN')}</span>
                </div>
              )}
              {activeSignal.type === 'WAIT' && (
                <div
                  id="header-signal-wait"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/35 font-bold text-xs sm:text-sm tracking-wider shrink-0"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>{tTerm('WAIT')}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-slate-100 text-xs sm:text-sm tracking-tight truncate">
                  {(activeSignal.asset || selectedAsset || 'EURUSD_otc').toUpperCase().replace('_OTC', '')}
                </span>
                <span className="text-[10px] font-bold uppercase text-amber-300 shrink-0">
                  {(activeSignal.asset || selectedAsset || '').includes('otc') ? 'OTC' : 'SPOT'}
                </span>
              </div>

              <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 text-[10px] sm:text-xs font-semibold shrink-0">
                {activeSignal.timeframe < 60 ? `${activeSignal.timeframe}S` : `${Math.round(activeSignal.timeframe / 60)}M`}
              </span>

              <div className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                {activeSignal.type !== 'WAIT' ? (
                  <span className="text-sm sm:text-base font-black text-emerald-400">
                    {activeSignal.actualConfidence ?? activeSignal.confidence ?? Math.round(activeSignal.strength * 100)}%
                  </span>
                ) : activeSignal.candidateConfidence && activeSignal.candidateConfidence > 0 ? (
                  <span className="text-xs sm:text-sm font-bold text-amber-300">
                    {activeSignal.candidateConfidence}%
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="hidden md:flex items-center gap-1.5 font-mono text-xs text-slate-300 tabular-nums">
                <span className="font-bold text-amber-300">
                  {activeSignal.confirmations ?? 0}/{activeSignal.totalStrategies ?? 21}
                </span>
                <span className="text-[10px] text-slate-400 uppercase">{tTerm('Strategies')}</span>
              </div>

              {activeSignal.candle && (
                <div className="hidden lg:flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.08]">
                  <span className="text-slate-400">Bar:</span>
                  <span
                    className={`font-bold ${
                      activeSignal.candle.direction === 'BULLISH'
                        ? 'text-emerald-400'
                        : activeSignal.candle.direction === 'BEARISH'
                        ? 'text-rose-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {activeSignal.candle.direction}
                  </span>
                </div>
              )}

              <span
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 border shrink-0 ${
                  activeSignal.dataStatus === 'LIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
              >
                {activeSignal.dataStatus === 'LIVE' ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{tTerm('Live')}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                    <span>{tTerm('Stale')}</span>
                  </>
                )}
              </span>

              {activeSignal.timestamp && (
                <span className="text-[10px] font-mono text-slate-400 tabular-nums hidden xl:inline">
                  {new Date(activeSignal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}

              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300 group-hover:text-amber-200 transition-colors">
                <span className="hidden sm:inline">{t('signals.inspectSignal', 'Analysis')}</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
