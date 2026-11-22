import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  Lock,
  Layers,
  AlertTriangle,
  Terminal,
  Globe,
  LogIn,
  LogOut,
  UserCheck,
  Key,
  Smartphone,
  Bot,
} from 'lucide-react';
import { DiagnosticsInfo, ScannerItem } from '../types';
import { GatewayOnboardingCard } from './GatewayOnboardingCard';
import { DemoPlatformActivityCard } from './DemoPlatformActivityCard';
import { useLanguage, LanguageSwitcher } from '../i18n/LanguageContext';
import { BrandLogo } from './BrandLogo';
import heroArchitectureImg from '../assets/images/sabaa_hero_architecture_1795219098611.jpg';
import vaultCrestImg from '../assets/images/sabaa_vault_crest_1795219098899.jpg';

interface LandingPageProps {
  onEnterTerminal?: () => void;
  onLaunchTerminal?: () => void;
  onOpenScanner?: () => void;
  onOpenSettings?: () => void;
  firebaseUser?: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL?: string | null;
  } | null;
  onSignInGoogle?: () => void;
  onSignOut?: () => void;
  diagnostics?: DiagnosticsInfo | null;
  onConnectAccount?: (params: {
    endpoint?: string;
    sessionToken: string;
    isDemo: boolean;
    uid?: number | null;
  }) => Promise<{ success: boolean; error?: string; diagnostics?: DiagnosticsInfo }>;
  onDisconnectAccount?: () => void;
  configuredSession?: string;
  configuredIsDemo?: boolean;
  configuredUid?: string | number | null;
  isReconnecting?: boolean;
  onOpenAndroidInstall?: () => void;
  onOpenTelegram?: () => void;
  onOpenAdmin?: () => void;
  onOpenKeyRoom?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterTerminal,
  onLaunchTerminal,
  onOpenScanner,
  firebaseUser,
  onSignInGoogle,
  onSignOut,
  diagnostics,
  onConnectAccount,
  onDisconnectAccount,
  configuredSession,
  configuredIsDemo,
  configuredUid,
  isReconnecting,
  onOpenAndroidInstall,
  onOpenTelegram,
  onOpenKeyRoom,
}) => {
  const [highlightCard, setHighlightCard] = useState(false);
  const [liveTicker, setLiveTicker] = useState<ScannerItem[]>([]);
  const { t, tTerm, isRTL } = useLanguage();
  const handleTerminal = onEnterTerminal || onLaunchTerminal || (() => {});
  const handleScanner = onOpenScanner || handleTerminal;

  useEffect(() => {
    let active = true;
    const loadScanner = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/scanner');
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
        const rows = await res.json().catch(() => null);
        if (active && Array.isArray(rows)) {
          setLiveTicker(rows.filter((r: ScannerItem) => r.currentPrice !== null).slice(0, 4));
        }
      } catch {
        // Keep empty honest state if feed unavailable
      }
    };
    loadScanner();
    const timer = setInterval(loadScanner, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const handleTerminalGuard = () => {
    handleTerminal();
  };

  const pillars = [
    {
      num: '01',
      icon: Zap,
      accent: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
      title: '26 استراتيجية خوارزمية دقيقة',
      desc: 'تقييم لحظي لمحركات الاتجاه، الزخم، بولينجر، فيبوناتشي، إليوت، جان، وشموع الانعكاس بناءً على الشموع المغلقة الفعلية دون إعادة رسم.',
    },
    {
      num: '02',
      icon: Layers,
      accent: 'text-amber-300 border-amber-500/25 bg-amber-500/10',
      title: 'تحليل السيولة وكتل الأوامر (SMC / ICT)',
      desc: 'كشف تلقائي لمناطق تمركز السيولة المؤسسية، فجوات القيمة العادلة (FVG)، والكسور الهيكلية (BOS) مع إشارات واضحة لمناطق الشراء والبيع.',
    },
    {
      num: '03',
      icon: TrendingUp,
      accent: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
      title: 'مصفوفة التوافق الحسابي (Confluence Matrix)',
      desc: 'تصفية التذبذب الخادع؛ لا تصدر الإشارة إلا بعد تصويت حاسم من 9 نماذج واستراتيجيات مختلفة لمنع الصفقات العشوائية.',
    },
    {
      num: '04',
      icon: Globe,
      accent: 'text-sky-400 border-sky-500/25 bg-sky-500/10',
      title: 'ماسح الأسواق اللحظي (Market Scanner)',
      desc: 'مسح دوري مباشر لثمانية أسواق رئيسية (العملات، الذهب، العملات الرقمية، والمؤشرات) مع تقييم قوة الاتجاه والفرص المهيأة.',
    },
    {
      num: '05',
      icon: ShieldCheck,
      accent: 'text-rose-400 border-rose-500/25 bg-rose-500/10',
      title: 'إدارة المخاطر وحماية رأس المال',
      desc: 'حاسبة مدمجة تحدد الحجم الدقيق للعقد (Lot Size) بناءً على نسبة المخاطرة المحددة (1% إلى 2%) وحساب وقف الخسارة قبل اتخاذ القرار.',
    },
    {
      num: '06',
      icon: Lock,
      accent: 'text-amber-300 border-amber-500/25 bg-amber-500/10',
      title: 'تنفيذ منضبط وبوابات أمان صارمة',
      desc: 'لا يُسمح بأي أمر يدوي أو آلي قبل التحقق من توثيق الجلسة، كفاية الرصيد الحقيقي، وتطابق 15 شمعة فعلية مع منع تكرار الصفقات.',
    },
  ];

  return (
    <div
      id="sabaa-landing-page"
      className="min-h-screen sabaa-canvas text-slate-100 font-sans selection:bg-amber-500/30 selection:text-amber-200"
    >
      {/* Subtle Top System Line */}
      <div className="border-b border-white/[0.06] bg-[#060A12]/90 py-2 px-4 text-center text-[11px] text-slate-300 flex items-center justify-center gap-2">
        <span className="font-mono font-bold text-amber-300 tracking-wider uppercase whitespace-nowrap">
          {isRTL ? 'محرك التوافق الـ 26' : '26-MODULE QUANT ENGINE'}
        </span>
        <span className="text-white/20">·</span>
        <span className="text-slate-400">
          {isRTL
            ? 'تشغيل منظومة التحليل الكمي وسيولة SMC / ICT مع التنفيذ المباشر للحساب الحقيقي فقط.'
            : 'Autonomous Quantitative Analysis & SMC / ICT Liquidity Confluence Live on Real Account.'}
        </span>
      </div>

      {/* Main Sticky Glass-Carbon Navigation */}
      <nav className="border-b border-white/[0.08] bg-[#04060A]/85 backdrop-blur-xl sticky top-0 z-40 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Clean Brand Wordmark Only */}
          <div className="flex items-center gap-2.5 shrink-0">
            <BrandLogo size="sm" />
            <span className="font-black text-base sm:text-lg tracking-tight sabaa-wordmark whitespace-nowrap">
              SABAA QUANT
            </span>
          </div>

          <div className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-400">
            <a href="#features" className="hover:text-amber-300 transition-colors whitespace-nowrap">
              {t('nav.strategies', 'Strategies')}
            </a>
            <a href="#smc-section" className="hover:text-amber-300 transition-colors whitespace-nowrap">
              {tTerm('SMC Liquidity')}
            </a>
            <a href="#faq" className="hover:text-amber-300 transition-colors whitespace-nowrap">
              {isRTL ? 'الأسئلة الشائعة' : 'FAQ'}
            </a>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher compact />

            {firebaseUser ? (
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg sabaa-well text-xs text-slate-300 whitespace-nowrap">
                {firebaseUser.photoURL ? (
                  <img
                    src={firebaseUser.photoURL}
                    alt="Avatar"
                    className="w-4 h-4 rounded-full border border-white/15"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="font-semibold max-w-[110px] truncate">
                  {firebaseUser.displayName || t('header.cloudAccount', 'Cloud Account')}
                </span>
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="text-slate-400 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                    title={isRTL ? 'تسجيل الخروج' : 'Sign Out'}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : onSignInGoogle ? (
              <button
                onClick={onSignInGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg sabaa-well hover:border-amber-400/40 text-amber-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('header.cloudSignIn', 'Sign In')}</span>
              </button>
            ) : null}

            {onOpenTelegram && (
              <button
                onClick={onOpenTelegram}
                className="p-2 rounded-lg sabaa-well hover:border-sky-400/40 text-sky-400 text-xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title={isRTL ? 'إعدادات وبث بوت التلجرام' : 'Telegram Bot & Broadcast'}
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="hidden xl:inline font-semibold">{isRTL ? 'بوت التلجرام' : 'Bot'}</span>
              </button>
            )}

            {onOpenKeyRoom && (
              <button
                onClick={onOpenKeyRoom}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title={isRTL ? 'غرفة توليد المفاتيح' : 'Key Generator Room'}
              >
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden lg:inline">{isRTL ? 'غرفة المفاتيح' : 'Key Room'}</span>
              </button>
            )}

            <button
              id="landing-btn-scanner"
              onClick={handleScanner}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg sabaa-well hover:border-white/20 text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('nav.scanner', 'Market Scanner')}</span>
            </button>

            {onOpenAndroidInstall && (
              <button
                onClick={onOpenAndroidInstall}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="تثبيت التطبيق على الهاتف (PWA & APK)"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{isRTL ? 'تثبيت التطبيق' : 'Install App'}</span>
              </button>
            )}

            <button
              id="landing-btn-enter-terminal"
              onClick={handleTerminalGuard}
              className="flex items-center gap-2 px-4 py-2 rounded-lg sabaa-btn-gold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>{t('landing.connectTerminal', 'Enter Terminal')}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section with Bespoke Obsidian Architectural Artwork */}
      <section className="relative overflow-hidden pt-10 pb-16 px-4 lg:px-8 border-b border-white/[0.06]">
        {/* Atmospheric Blended Hero Architecture Backdrop */}
        <div className="pointer-events-none absolute inset-0 opacity-25">
          <img
            src={heroArchitectureImg}
            alt=""
            className="w-full h-full object-cover object-center mix-blend-lighten"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#04060A]/60 via-[#04060A]/75 to-[#04060A]" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            {/* Hero Pitch & CTAs */}
            <div className={`lg:col-span-6 space-y-6 pt-2 ${isRTL ? 'text-right' : 'text-left'}`}>
              {/* Clean Typographic Eyebrow */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tracking-wider text-amber-300/90">
                <span className="font-bold uppercase">
                  {isRTL ? 'منظومة التحليل الكمي المؤسسي' : 'AUTONOMOUS QUANT ENGINE'}
                </span>
                <span className="text-white/25">·</span>
                <span className="text-emerald-400 font-semibold">
                  {isRTL ? 'ربط مباشر مع الحساب الحقيقي 100%' : 'Direct Real Account Connectivity'}
                </span>
              </div>

              <h1
                className="font-black tracking-tight leading-[1.18] text-slate-50"
                style={{ fontSize: 'clamp(1.875rem, 1.3rem + 2.4vw, 3.25rem)' }}
              >
                {t('landing.heroTitle', 'INSTITUTIONAL QUANTITATIVE SIGNAL ENGINE')}
                <br />
                <span className="sabaa-wordmark">
                  {tTerm('SMC Liquidity')} &amp; {isRTL ? 'التوافق الخوارزمي' : 'Algorithmic Confluence'}
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                {t(
                  'landing.heroSubtitle',
                  'Autonomous multi-factor algorithmic analysis, certified non-repainting mathematical indicators, and real-time broker execution telemetry.'
                )}
              </p>

              {/* Architectural Showcase Crest Strip */}
              <div className="sabaa-panel rounded-2xl p-4 flex items-center gap-4 max-w-xl">
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-amber-400/25 bg-[#05080F] shrink-0">
                  <img
                    src={vaultCrestImg}
                    alt="SABAA QUANT Architecture"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300 font-bold uppercase tracking-wider">
                    <span>SOVEREIGN EXECUTION CORE</span>
                    <span className="text-white/20">·</span>
                    <span className="text-emerald-400">NON-REPAINTING</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {isRTL
                      ? '26 وحدة خوارزمية مع تحليل كتل الأوامر والسيولة وفحص إجباري للشموع المغلقة قبل أي تنفيذ.'
                      : '26 algorithmic modules with SMC order blocks and mandatory closed-candle verification before dispatch.'}
                  </p>
                </div>
              </div>

              {/* Action CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={handleTerminalGuard}
                  className="flex items-center gap-2.5 px-6 py-3 rounded-xl sabaa-btn-gold text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Terminal className="w-4 h-4" />
                  <span>{t('landing.connectTerminal', 'Open Trading Terminal')}</span>
                </button>

                <button
                  onClick={handleScanner}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl sabaa-well hover:border-emerald-400/40 text-slate-200 text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>{t('nav.scanner', 'Market Scanner')}</span>
                </button>

                {onOpenAndroidInstall && (
                  <button
                    onClick={onOpenAndroidInstall}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>{isRTL ? 'تثبيت التطبيق على الهاتف' : 'Install Mobile App'}</span>
                  </button>
                )}

                {!firebaseUser && onSignInGoogle && (
                  <button
                    onClick={onSignInGoogle}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl sabaa-well hover:border-amber-400/40 text-amber-300 text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 text-amber-400" />
                    <span>{t('header.cloudSignIn', 'Sign In (Google)')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Secondary Column: Real System Gateway Onboarding & Pre-Entry Telemetry */}
            <div className="lg:col-span-6 space-y-5">
              <GatewayOnboardingCard
                diagnostics={diagnostics}
                firebaseUser={firebaseUser}
                onSignInGoogle={onSignInGoogle}
                onSignOut={onSignOut}
                onConnectAccount={onConnectAccount}
                onDisconnectAccount={onDisconnectAccount}
                onEnterTerminal={handleTerminal}
                configuredSession={configuredSession}
                configuredIsDemo={configuredIsDemo}
                configuredUid={configuredUid}
                isReconnecting={isReconnecting}
                forceHighlight={highlightCard}
                onClearHighlight={() => setHighlightCard(false)}
              />

              <DemoPlatformActivityCard diagnostics={diagnostics} />
            </div>
          </div>

          {/* Live Ticker Strip (100% Real Prices from /api/scanner) */}
          <div className="pt-10 max-w-5xl mx-auto">
            {liveTicker.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {liveTicker.map((item) => {
                  const isBuy = item.signal === 'BUY' || item.signal === 'STRONG_BUY';
                  const isSell = item.signal === 'SELL' || item.signal === 'STRONG_SELL';
                  const change = item.change24h ?? 0;
                  return (
                    <div
                      key={item.symbol}
                      className="p-3.5 rounded-xl sabaa-panel flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-100 truncate">{item.label}</div>
                        <div
                          className={`text-[11px] font-mono tabular-nums mt-0.5 ${
                            change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.currentPrice} ({change >= 0 ? `+${change}` : change}%)
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${
                          isBuy
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                            : isSell
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                            : 'bg-white/[0.04] text-slate-300 border-white/10'
                        }`}
                      >
                        {tTerm(item.signal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl sabaa-well text-center text-xs text-slate-400 font-mono">
                {isRTL
                  ? 'بانتظار استلام أسعار البث المباشر من مزود السوق...'
                  : 'Awaiting live market ticker stream...'}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Terminal Architecture Showcase (Dynamic Live Diagnostics) */}
      <section id="smc-section" className="py-14 px-4 lg:px-8 max-w-6xl mx-auto">
        <div className="rounded-2xl sabaa-panel-gold p-5 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" />
              </div>
              <span className="text-xs font-mono text-slate-300">
                SABAA-TERMINAL-CORE // {diagnostics?.activeAsset || 'EURUSD_otc'} ({diagnostics?.timeframe || 60}s)
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400">26 Modules + SBAA 100-Pt</span>
              <span className="text-white/20">·</span>
              <span
                className={`font-bold ${
                  diagnostics?.authVerified ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {diagnostics?.authVerified ? 'LIVE BROKER VERIFIED' : 'AWAITING REAL SESSION'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl sabaa-well space-y-2">
              <div className="text-xs font-bold text-amber-300 font-mono">01 · كشف كتل الأوامر والسيولة (SMC)</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                فحص الشموع المغلقة الفعلية لتحديد مناطق كسح السيولة (Liquidity Sweeps) والكسور الهيكلية (BOS / CHoCH) بدون إعادة رسم.
              </p>
            </div>
            <div className="p-4 rounded-xl sabaa-well space-y-2">
              <div className="text-xs font-bold text-sky-400 font-mono">02 · مصفوفة التوافق الخوارزمي (26 وحدة)</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                تقييم رياضي متزامن لمؤشرات الزخم والاتجاه وبولينجر وإيشيموكو وإليوت وجان ودارفاس مع فلترة تعارض الإشارات.
              </p>
            </div>
            <div className="p-4 rounded-xl sabaa-well space-y-2">
              <div className="text-xs font-bold text-emerald-400 font-mono">03 · إدارة المخاطر وقاطع الدائرة</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                تحقق إلزامي من الرصيد الحقيقي، حدود الخسارة والربح اليومية، ومنع تكرار الأوامر على نفس الشمعة قبل أي تنفيذ.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.08] border border-amber-400/25 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-200">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong className="text-amber-300">انضباط التنفيذ الحقيقي:</strong> يدعم النظام التداول اليدوي والآلي على الحساب الحقيقي فقط بعد استيفاء شروط 15 شمعة فعلية واتصال موثق.
              </span>
            </div>
            <button
              onClick={handleTerminal}
              className="px-4 py-2 rounded-lg sabaa-btn-gold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRTL ? 'افتح الشارت التفاعلي ←' : 'Open Interactive Chart →'}
            </button>
          </div>
        </div>
      </section>

      {/* 6 Institutional Pillars Section */}
      <section id="features" className="py-14 px-4 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center space-y-3 mb-12">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-amber-300">
            {isRTL ? 'المعمارية المؤسسية' : 'INSTITUTIONAL ARCHITECTURE'}
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-50">
            6 محركات تحليلية مدمجة في منصة واحدة
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto">
            بُنيت منصة SABAA QUANT لتمنح المتداول أدوات التحليل الرياضي الصارم وإدارة المخاطر المؤسسية.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.num}
                className="p-6 rounded-2xl sabaa-panel hover:border-amber-400/30 transition-colors space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${pillar.accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-500">{pillar.num}.</span>
                </div>
                <h3 className="text-base font-bold text-slate-100">{pillar.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{pillar.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison Table Section */}
      <section className="py-14 px-4 lg:px-8 max-w-5xl mx-auto border-t border-white/[0.06]">
        <div className="text-center space-y-3 mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-50">
            لماذا تختلف SABAA QUANT عن البوتات التقليدية؟
          </h2>
          <p className="text-xs text-slate-400">مقارنة معمارية مع الأنظمة العشوائية وغير المنضبطة</p>
        </div>

        <div className="overflow-x-auto rounded-2xl sabaa-panel">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#05080F] text-slate-400">
                <th className="py-3.5 px-4 font-semibold">المعيار التقني</th>
                <th className="py-3.5 px-4 font-bold text-amber-300">منصة SABAA QUANT</th>
                <th className="py-3.5 px-4 font-normal text-slate-500">البوتات العشوائية المروجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-200">انضباط الدخول</td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">دخول صارم عند تأهل الإشارة الكميّة غير المعاد رسمها</td>
                <td className="py-3.5 px-4 text-rose-400">دخول عشوائي ومقامرة برأس المال</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-200">محرك التوافق والشموع</td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">26 وحدة خوارزمية + مصفوفة SBAA 100 نقطة</td>
                <td className="py-3.5 px-4 text-slate-500">مؤشر واحد سطحي أو وهمي</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-200">فحص ما قبل التنفيذ</td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">التحقق من 15 شمعة حقيقية والرصيد والمصادقة قبل أي أمر</td>
                <td className="py-3.5 px-4 text-slate-500">أوامر عشوائية بدون تدقيق</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-200">إدارة المخاطر</td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">قاطع الدائرة لحد الخسارة والربح ومنع تكرار الصفقات</td>
                <td className="py-3.5 px-4 text-rose-400">مضاعفات غير منضبطة تحرق الحساب</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-200">شفافية الإحصائيات</td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">سجل مدقق بالأسعار المرجعية اللحظية الحقيقية</td>
                <td className="py-3.5 px-4 text-rose-400">أرقام ونسب فوز زائفة تسويقية</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-14 px-4 lg:px-8 max-w-4xl mx-auto border-t border-white/[0.06]">
        <div className="text-center space-y-3 mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-50">
            الأسئلة الشائعة حول المنصة
          </h2>
          <p className="text-xs text-slate-400">كل ما تحتاج لمعرفته حول طريقة عمل منظومة SABAA QUANT</p>
        </div>

        <div className="space-y-3 text-right">
          <div className="p-5 rounded-xl sabaa-panel space-y-2">
            <h3 className="text-sm font-bold text-amber-300">كيف يعمل التداول الآلي الخوارزمي؟</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              يعتمد التداول الآلي على مصفوفة التحليل الكمي الصارمة؛ حيث لا يُسمح بأي أمر تداول إلا عند تحقق الإشارة الاتجاهية المؤهلة غير المعاد رسمها، وبعد فحص اتصال الوسيط وتوفر 15 شمعة حقيقية وتوفر الرصيد في الحساب الحقيقي.
            </p>
          </div>

          <div className="p-5 rounded-xl sabaa-panel space-y-2">
            <h3 className="text-sm font-bold text-amber-300">ما هي استراتيجيات SMC و ICT المدعومة؟</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              المنصة ترصد مفاهيم الأموال الذكية: مناطق تجميع السيولة (Liquidity Sweeps)، فجوات القيمة العادلة (Fair Value Gaps)، كسر الهيكل (BOS)، والتغير في السلوك (CHoCH)، وتدمجها مع مؤشرات الزخم المعتمدة.
            </p>
          </div>

          <div className="p-5 rounded-xl sabaa-panel space-y-2">
            <h3 className="text-sm font-bold text-amber-300">هل البيانات المعروضة في الشارت والصفقات حقيقية؟</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              نعم، المنصة تتصل ببث حي للأسعار عبر بروتوكولات WebSocket وتنفذ الأوامر حصرياً على جلسة الحساب الحقيقي الموثقة دون أي محاكاة أو بيانات وهمية.
            </p>
          </div>
        </div>
      </section>

      {/* Call To Action Banner */}
      <section className="py-16 px-4 lg:px-8 border-t border-white/[0.06] text-center space-y-5">
        <h2 className="text-2xl sm:text-4xl font-black text-slate-50">
          جاهز لتجربة التداول الخوارزمي المنضبط؟
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
          اربط جلسة حسابك الحقيقي واستكشف شاشات التحليل المباشرة ومصفوفة الاستراتيجيات الـ 26.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleTerminal}
            className="px-7 py-3.5 rounded-xl sabaa-btn-gold text-sm cursor-pointer whitespace-nowrap"
          >
            {isRTL ? 'دخول منصة التداول والتحليل المباشر ←' : 'Enter Live Trading Terminal →'}
          </button>
        </div>
      </section>

      {/* Institutional Footer & Risk Disclaimer */}
      <footer className="border-t border-white/[0.08] bg-[#04060A] py-10 px-4 lg:px-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
            <div className="flex items-center gap-2.5">
              <BrandLogo size="sm" />
              <span className="font-bold text-slate-200">SABAA QUANT</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span>منظومة تحليل الأسواق المالية</span>
              <span>·</span>
              <span>26 وحدة خوارزمية دقيقة</span>
              <span>·</span>
              <span>إدارة مخاطر مؤسسية</span>
            </div>
          </div>

          <div className="p-4 rounded-xl sabaa-well text-[11px] leading-relaxed text-slate-400 space-y-2 text-right">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>تحذير المخاطر وإخلاء المسؤولية القانونية:</span>
            </div>
            <p>
              التداول في الأسواق المالية ينطوي على درجة عالية من المخاطرة وقد لا يكون مناسباً لجميع المستثمرين.
              إن إشارات وبيانات منصة SABAA QUANT مبنية على خوارزميات كمية لأغراض تحليلية مساعدة، والمستخدم وحده هو المسؤول قانونياً ومالياً عن جميع القرارات والصفقات المنفذة على حسابه الحقيقي.
            </p>
          </div>

          <div className="text-center text-[10px] text-slate-500 font-mono">
            © {new Date().getFullYear()} SABAA QUANT · Institutional Quantitative Analytics
          </div>
        </div>
      </footer>
    </div>
  );
};
