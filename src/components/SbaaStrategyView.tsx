import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Eye,
  Filter,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Square,
  TrendingDown,
  TrendingUp,
  Zap,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { SbaaEngineStatus, SbaaDetectionLogRecord, SbaaScoreBreakdown } from '../../server/sbaa/SbaaTypes';
import { safeFetchJson } from '../utils/safeFetch';

interface SbaaStrategyViewProps {
  activeAsset: string;
  timeframe: number;
  currentPrice: number;
}

export const SbaaStrategyView: React.FC<SbaaStrategyViewProps> = ({
  activeAsset,
  timeframe,
  currentPrice,
}) => {
  const { isRTL } = useLanguage();
  const [status, setStatus] = useState<SbaaEngineStatus | null>(null);
  const [logs, setLogs] = useState<SbaaDetectionLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'WAIT' | 'EXECUTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<SbaaDetectionLogRecord | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await safeFetchJson<SbaaEngineStatus>('/api/sbaa/status');
      if (res.ok && res.data) {
        setStatus(res.data);
      }
    } catch {}
  };

  const fetchLogs = async () => {
    try {
      const res = await safeFetchJson<SbaaDetectionLogRecord[]>('/api/sbaa/logs?limit=100');
      if (res.ok && Array.isArray(res.data)) {
        setLogs(res.data);
      }
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStatus(), fetchLogs()]).finally(() => setLoading(false));

    const interval = setInterval(() => {
      void fetchStatus();
      void fetchLogs();
    }, 6000);

    return () => clearInterval(interval);
  }, [activeAsset, timeframe]);

  const handleToggleAutoDemo = async () => {
    if (!status) return;
    setActionLoading(true);
    try {
      await safeFetchJson('/api/sbaa/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoDemoExecution: !status.autoDemoEnabled }),
      });
      await fetchStatus();
    } catch {}
    setActionLoading(false);
  };

  const handleTriggerAnalyze = async () => {
    setActionLoading(true);
    try {
      await safeFetchJson('/api/sbaa/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: activeAsset, timeframe }),
      });
      await fetchStatus();
      await fetchLogs();
    } catch {}
    setActionLoading(false);
  };

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingClearLogs, setConfirmingClearLogs] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);

  const handleResetStats = async () => {
    setConfirmingReset(false);
    try {
      await safeFetchJson('/api/sbaa/reset-stats', { method: 'POST' });
      await fetchStatus();
      await fetchLogs();
    } catch {}
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      const res = await safeFetchJson('/api/sbaa/clear-logs', { method: 'POST' });
      if (res.ok) {
        setLogs([]);
      }
      setConfirmingClearLogs(false);
    } catch {}
    setClearingLogs(false);
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === 'BUY' && log.systemDecision !== 'BUY') return false;
    if (filter === 'SELL' && log.systemDecision !== 'SELL') return false;
    if (filter === 'WAIT' && log.systemDecision !== 'WAIT') return false;
    if (filter === 'EXECUTED' && !log.tradeStatus.startsWith('DEMO_')) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchPattern = log.patternNameAr.toLowerCase().includes(term) || log.patternNameEn.toLowerCase().includes(term);
      const matchReason = log.reasonAr.toLowerCase().includes(term);
      const matchAsset = log.asset.toLowerCase().includes(term);
      return matchPattern || matchReason || matchAsset;
    }
    return true;
  });

  const getStatusBadgeColor = (st: string) => {
    switch (st) {
      case 'DEMO_EXECUTED':
      case 'READY_TO_EXECUTE':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
      case 'PATTERN_DETECTED':
      case 'CONFIRMATION':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
      case 'TREND_VALIDATION':
      case 'LOCATION_VALIDATION':
      case 'SIGNAL_SCORING':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
      case 'NO_TRADE':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
      default:
        return 'bg-[#050810] text-slate-300 border-white/10';
    }
  };

  const isLiveScanning = status?.state === 'DEMO_EXECUTED' || status?.state === 'READY_TO_EXECUTE';

  return (
    <div id="sbaa-strategy-view" className="space-y-6 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* 1. Header Banner & Status Bar */}
      <div className="sabaa-panel-gold p-5 sm:p-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/35 flex items-center justify-center text-amber-300 shrink-0 shadow-[0_8px_20px_-6px_rgba(217,119,6,0.3)]">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-slate-50 tracking-tight">
                    {isRTL ? 'استراتيجية سبع الذكية المطورة' : 'SBAA Smart Strategy Engine'}
                  </h2>
                  <span className="text-[11px] font-mono text-amber-400/90 font-semibold">
                    · Price Action v2.5 · {activeAsset}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isRTL
                    ? 'نظام التحليل السعري المتقدم: نماذج الشموع اليابانية، العرض والطلب، سحب السيولة، BOS، CHOCH، والدخول الآلي التجريبي'
                    : 'Advanced Price Action: Candlestick Patterns, Supply & Demand, Liquidity Sweeps, BOS, CHOCH, and Auto Demo Execution'}
                </p>
              </div>
            </div>
          </div>

          {/* Real-time State & Control Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className={`px-3.5 py-2 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 whitespace-nowrap shrink-0 ${getStatusBadgeColor(status?.state || 'SCANNING')}`}>
              <span className={`w-2 h-2 rounded-full bg-current ${isLiveScanning ? 'animate-pulse' : ''}`} />
              <span>{status?.stateAr || 'جاري الفحص (SCANNING)'}</span>
            </div>

            <button
              onClick={handleTriggerAnalyze}
              disabled={actionLoading}
              className="sabaa-btn-gold px-4 py-2 text-xs whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
              <span>{isRTL ? 'تحليل لحظي الآن' : 'Scan Market Now'}</span>
            </button>

            <button
              onClick={handleToggleAutoDemo}
              disabled={actionLoading}
              className={`px-4 py-2 text-xs whitespace-nowrap shrink-0 ${
                status?.autoDemoEnabled ? 'sabaa-btn-emerald' : 'sabaa-btn-surface'
              }`}
            >
              {status?.autoDemoEnabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{status?.autoDemoEnabled ? (isRTL ? 'الدخول التجريبي مفعل' : 'Auto Demo ON') : (isRTL ? 'تشغيل الدخول التجريبي' : 'Enable Auto Demo')}</span>
            </button>

            {confirmingReset ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleResetStats}
                  className="sabaa-btn-crimson px-3 py-2 text-xs whitespace-nowrap shrink-0"
                >
                  {isRTL ? 'تأكيد التصفير' : 'Confirm Reset'}
                </button>
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="sabaa-btn-surface px-3 py-2 text-xs whitespace-nowrap shrink-0"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingReset(true)}
                title={isRTL ? 'تصفير الإحصائيات' : 'Reset Stats'}
                className="sabaa-btn-surface p-2.5 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Circuit Breaker Banner if Tripped */}
        {status?.isCircuitBreakerTripped && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>{isRTL ? 'قاطع الدائرة مفعل:' : 'Circuit Breaker Active:'}</strong> {status.circuitBreakerReason || (isRTL ? 'تم بلوغ الحد الأقصى للمخاطر' : 'Risk limits reached')}
            </span>
          </div>
        )}
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="sabaa-kpi-card space-y-1.5">
          <span className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>{isRTL ? 'النماذج المكتشفة' : 'Patterns Detected'}</span>
            <Layers className="w-3.5 h-3.5 text-amber-400" />
          </span>
          <span className="text-xl font-black font-mono tabular-nums text-slate-100 block">
            {status?.patternsDetectedCount ?? 0}
          </span>
          <span className="text-[10px] text-slate-500 block">{isRTL ? 'نماذج فنية وسحب سيولة' : 'Technical & sweeps'}</span>
        </div>

        <div className="sabaa-panel-emerald p-4 space-y-1.5">
          <span className="text-[11px] text-slate-300 flex items-center justify-between">
            <span>{isRTL ? 'إشارات الشراء BUY' : 'BUY Signals'}</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </span>
          <span className="text-xl font-black font-mono tabular-nums text-emerald-400 block">
            {status?.buySignalsCount ?? 0}
          </span>
          <span className="text-[10px] text-emerald-400/80 block">{isRTL ? 'دعم / كسر هيكل صاعد' : 'Demand / Bullish BOS'}</span>
        </div>

        <div className="sabaa-panel-crimson p-4 space-y-1.5">
          <span className="text-[11px] text-slate-300 flex items-center justify-between">
            <span>{isRTL ? 'إشارات البيع SELL' : 'SELL Signals'}</span>
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          </span>
          <span className="text-xl font-black font-mono tabular-nums text-rose-400 block">
            {status?.sellSignalsCount ?? 0}
          </span>
          <span className="text-[10px] text-rose-400/80 block">{isRTL ? 'مقاومة / سحب سيولة قمة' : 'Supply / Sweep High'}</span>
        </div>

        <div className="sabaa-panel-gold p-4 space-y-1.5">
          <span className="text-[11px] text-slate-300 flex items-center justify-between">
            <span>{isRTL ? 'قرارات الانتظار WAIT' : 'WAIT Decisions'}</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </span>
          <span className="text-xl font-black font-mono tabular-nums text-amber-400 block">
            {status?.waitDecisionsCount ?? 0}
          </span>
          <span className="text-[10px] text-amber-400/80 block">{isRTL ? 'حماية من التردد والدوجي' : 'Hesitation filter'}</span>
        </div>

        <div className="sabaa-kpi-card space-y-1.5">
          <span className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>{isRTL ? 'نسبة الفوز التجريبية' : 'Demo Win Rate'}</span>
            <Activity className="w-3.5 h-3.5 text-sky-400" />
          </span>
          <span className="text-xl font-black font-mono tabular-nums text-sky-400 block">
            {status?.winRate ?? 0}%
          </span>
          <span className="text-[10px] text-slate-400 font-mono tabular-nums block">
            {status?.wonDemoTrades ?? 0}W / {status?.lostDemoTrades ?? 0}L
          </span>
        </div>

        <div className="sabaa-kpi-card space-y-1.5">
          <span className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>{isRTL ? 'أرباح المحاكاة اليوم' : 'Daily Demo PnL'}</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </span>
          <span className={`text-xl font-black font-mono tabular-nums block ${
            (status?.todayDemoPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {(status?.todayDemoPnL ?? 0) >= 0 ? '+' : ''}${status?.todayDemoPnL?.toFixed(2) ?? '0.00'}
          </span>
          <span className="text-[10px] text-slate-500 block">{isRTL ? 'حساب تجريبي فقط' : 'Paper / Demo Only'}</span>
        </div>
      </div>

      {/* 3. Latest Setup & 100-Point Confluence Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (5 cols): Latest Decision & Signal Card */}
        <div className="lg:col-span-5 sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                {isRTL ? 'قرار المحرك اللحظي لآخر إشارة' : 'Latest Engine Signal Decision'}
              </h3>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-amber-300/90">
              {activeAsset} · {timeframe}s
            </span>
          </div>

          <div className="sabaa-well flex items-center justify-between p-4">
            <div>
              <span className="text-[11px] text-slate-400 block">{isRTL ? 'القرار الفني المعتمد' : 'System Decision'}</span>
              <span className={`text-2xl font-black font-mono flex items-center gap-2 ${
                status?.latestDecision === 'BUY'
                  ? 'text-emerald-400'
                  : status?.latestDecision === 'SELL'
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}>
                {status?.latestDecision === 'BUY' && <ArrowUpRight className="w-6 h-6" />}
                {status?.latestDecision === 'SELL' && <ArrowDownRight className="w-6 h-6" />}
                {status?.latestDecision || 'WAIT'}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">{isRTL ? 'نقاط التوافق الفني' : 'Confluence Score'}</span>
              <span className={`text-2xl font-black font-mono tabular-nums ${
                (status?.latestScore ?? 0) >= 80
                  ? 'text-emerald-400'
                  : (status?.latestScore ?? 0) >= 70
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}>
                {status?.latestScore ?? 0}<span className="text-xs text-slate-500 font-normal">/100</span>
              </span>
            </div>
          </div>

          {/* Pattern Details */}
          <div className="space-y-2.5 text-xs">
            <div className="sabaa-well flex justify-between items-center p-3">
              <span className="text-slate-400">{isRTL ? 'النموذج المكتشف:' : 'Detected Pattern:'}</span>
              <span className="font-bold text-slate-100 font-mono">
                {status?.latestPatternName || (isRTL ? 'لا يوجد نموذج نشط' : 'None')}
              </span>
            </div>

            <div className="sabaa-well p-3.5 space-y-1.5">
              <span className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider block">
                {isRTL ? 'سبب القرار الفني (Technical Rationale):' : 'Technical Rationale:'}
              </span>
              <p className="text-xs text-slate-200 leading-relaxed font-sans">
                {status?.latestReasonAr || (isRTL ? 'جاري فحص الشموع والمستويات الفنية...' : 'Scanning candles...')}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (7 cols): 100-Point Confluence Scoring Matrix */}
        <div className="lg:col-span-7 sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                {isRTL ? 'مصفوفة نقاط التوافق الفني الـ 100 (Signal Scoring Matrix)' : '100-Point Confluence Matrix'}
              </h3>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono font-bold tabular-nums">
              {isRTL ? 'مؤهل للتنفيذ: 80 - 100 نقطة' : 'Qualified: 80-100 pts'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {[
              {
                labelAr: '1. الاتجاه العام (Trend Analysis)',
                labelEn: 'Trend Analysis',
                max: 15,
                val: status?.latestScoreBreakdown?.trendScore ?? 12,
                color: 'bg-sky-500',
              },
              {
                labelAr: '2. موقع الدعم والمقاومة (S/R & Zones)',
                labelEn: 'Support / Resistance Location',
                max: 20,
                val: status?.latestScoreBreakdown?.srLocationScore ?? 16,
                color: 'bg-emerald-500',
              },
              {
                labelAr: '3. نموذج الشموع اليابانية (Candlestick Pattern)',
                labelEn: 'Candlestick Pattern',
                max: 15,
                val: status?.latestScoreBreakdown?.patternScore ?? 14,
                color: 'bg-amber-400',
              },
              {
                labelAr: '4. ضغط الفتائل وسحب السيولة (Wick & Liquidity)',
                labelEn: 'Wick & Liquidity Analysis',
                max: 15,
                val: status?.latestScoreBreakdown?.wickLiquidityScore ?? 12,
                color: 'bg-cyan-400',
              },
              {
                labelAr: '5. تأكيد الهيكل السعري (BOS / CHOCH)',
                labelEn: 'Market Structure Confirmation',
                max: 15,
                val: status?.latestScoreBreakdown?.structureScore ?? 13,
                color: 'bg-amber-500',
              },
              {
                labelAr: '6. الزخم والمؤشرات (RSI / MACD / ATR)',
                labelEn: 'Momentum & Indicators',
                max: 10,
                val: status?.latestScoreBreakdown?.momentumScore ?? 8,
                color: 'bg-rose-500',
              },
              {
                labelAr: '7. تأكيد الإطار الزمني الأكبر (MTF Alignment)',
                labelEn: 'Higher Timeframe Confirmation',
                max: 10,
                val: status?.latestScoreBreakdown?.mtfScore ?? 8,
                color: 'bg-teal-400',
              },
            ].map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-300">{isRTL ? item.labelAr : item.labelEn}</span>
                  <span className="font-mono tabular-nums font-bold text-slate-100">
                    {item.val} / {item.max}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#04060A] rounded-full overflow-hidden border border-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                    style={{ width: `${Math.min(100, (item.val / item.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Multi-Timeframe Alignment Matrix */}
      <div className="sabaa-panel p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
              {isRTL ? 'تحليل الأطر الزمنية المتعددة (Multi-Timeframe Synthesis)' : 'Multi-Timeframe Matrix (1M - 15M)'}
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            {isRTL ? 'الإطار الأكبر يحدد الاتجاه والسياق، والأصغر يحدد النموذج وتوقيت الدخول' : 'Higher TF provides context, lower TF triggers entry'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {['1M', '5M', '15M'].map((tfKey) => {
            const mtf = status?.mtfMatrix?.[tfKey];
            return (
              <div key={tfKey} className="sabaa-well p-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-xs text-slate-100">{tfKey} Frame</span>
                  <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono ${
                    mtf?.trend === 'BULLISH'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                      : mtf?.trend === 'BEARISH'
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/35'
                      : 'bg-[#04060A] text-slate-400 border border-white/[0.08]'
                  }`}>
                    {mtf?.trend || 'RANGING'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                  <div>
                    <span className="block text-[10px] text-slate-500">EMA 20/50:</span>
                    <span className="text-slate-100 font-bold">{mtf?.ema20?.toFixed(4) || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500">RSI 14:</span>
                    <span className="text-amber-300 font-bold">{mtf?.rsi?.toFixed(1) || '—'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. SBAA STRATEGY DETECTION LOG Table */}
      <div className="sabaa-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">
                {isRTL ? 'سجل تحليل نماذج استراتيجية سبع (SBAA STRATEGY DETECTION LOG)' : 'SBAA Strategy Detection Log'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isRTL ? 'توثيق كل عملية فحص فني سواء نتج عنها دخول تجريبي أم انتظار مع الأسباب الكاملة' : 'Complete record of every analyzed pattern, decision rationale, and demo execution outcome'}
              </p>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isRTL ? 'بحث في النماذج أو الأسباب...' : 'Search logs...'}
                className="sabaa-input pl-8 pr-3 py-1.5 text-xs"
              />
            </div>

            <div className="sabaa-well flex items-center p-1 gap-1 text-xs">
              {(['ALL', 'BUY', 'SELL', 'WAIT', 'EXECUTED'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    filter === f ? 'sabaa-btn-gold' : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {confirmingClearLogs ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={clearingLogs}
                  className="sabaa-btn-crimson px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
                >
                  {clearingLogs
                    ? isRTL ? 'جاري المسح...' : 'Clearing...'
                    : isRTL ? 'تأكيد المسح' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClearLogs(false)}
                  disabled={clearingLogs}
                  className="sabaa-btn-surface px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClearLogs(true)}
                disabled={logs.length === 0}
                className="sabaa-btn-crimson px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
                title={isRTL ? 'مسح السجل' : 'Clear detection log list'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isRTL ? 'مسح' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[460px] rounded-2xl bg-[#04060A] border border-white/[0.06]">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {isRTL ? 'لم يتم تسجيل نماذج حتى الآن. المحرك يراقب السوق بصورة مستمرة.' : 'No detection logs found. Engine scanning active.'}
            </div>
          ) : (
            <table className={`w-full text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
              <thead className="sticky top-0 bg-[#05080F] z-10 border-b border-white/[0.07]">
                <tr className="text-slate-400 uppercase text-[10px] font-mono">
                  <th className="py-3 px-3.5">{isRTL ? 'الوقت' : 'Time'}</th>
                  <th className="py-3 px-3.5">{isRTL ? 'الأصل / الفريم' : 'Asset / TF'}</th>
                  <th className="py-3 px-3.5">{isRTL ? 'النموذج المكتشف' : 'Pattern'}</th>
                  <th className="py-3 px-3.5">{isRTL ? 'القرار' : 'Decision'}</th>
                  <th className="py-3 px-3.5">{isRTL ? 'النقاط' : 'Score'}</th>
                  <th className="py-3 px-3.5">{isRTL ? 'السبب الفني' : 'Technical Reason'}</th>
                  <th className="py-3 px-3.5 text-right">{isRTL ? 'حالة الصفقة' : 'Demo Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono tabular-nums">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                  >
                    <td className="py-2.5 px-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(log.detectionTime).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="font-bold text-slate-100">{log.asset}</span>
                      <span className="text-[10px] text-slate-500 ml-1">({log.timeframe}s)</span>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-sans font-semibold text-slate-200">
                      {isRTL ? log.patternNameAr : log.patternNameEn}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        log.systemDecision === 'BUY'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : log.systemDecision === 'SELL'
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}>
                        {log.systemDecision}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className={`font-bold ${log.confluenceScore >= 80 ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {log.confluenceScore}/100
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-300 font-sans text-[11px] max-w-xs truncate">
                      {isRTL ? log.reasonAr : log.reasonEn}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        log.tradeStatus === 'DEMO_WON'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : log.tradeStatus === 'DEMO_LOST'
                          ? 'bg-rose-500/15 text-rose-300'
                          : log.tradeStatus === 'DEMO_DRAW'
                          ? 'bg-slate-800 text-slate-300'
                          : log.tradeStatus === 'DEMO_OPEN'
                          ? 'bg-amber-500/15 text-amber-300'
                          : log.tradeStatus === 'REJECTED'
                          ? 'bg-rose-950 text-rose-400'
                          : 'bg-white/[0.04] text-slate-400'
                      }`}>
                        {log.tradeStatus.replace('DEMO_', '')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
