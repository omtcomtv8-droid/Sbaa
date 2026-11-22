import React from 'react';
import {
  TrendingUp,
  Activity,
  BarChart2,
  Sliders,
  Shield,
  Gauge,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import { IndicatorMetrics, Candle, SupportResistanceLevel } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface IndicatorsViewProps {
  indicators?: IndicatorMetrics | null;
  candles?: Candle[];
  activeAsset: string;
  timeframe: number;
  currentPrice?: number | null;
  srLevels?: SupportResistanceLevel[];
}

export const IndicatorsView: React.FC<IndicatorsViewProps> = ({
  indicators,
  candles = [],
  activeAsset,
  timeframe,
  currentPrice,
  srLevels = [],
}) => {
  const { isRTL, tTerm } = useLanguage();

  const rsi = indicators?.rsi ?? null;
  const macd = indicators?.macd ?? null;
  const bollinger = indicators?.bollinger ?? null;
  const adx = indicators?.adx ?? null;
  const stoch = indicators?.stochastic ?? null;
  const atr = indicators?.atr ?? null;

  const rsiStatus =
    rsi === null
      ? 'WAIT'
      : rsi >= 70
      ? 'OVERBOUGHT'
      : rsi <= 30
      ? 'OVERSOLD'
      : 'NEUTRAL';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Top Banner */}
      <div className="sabaa-panel-gold flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/35 flex items-center justify-center text-amber-300 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-50 tracking-tight">
                {isRTL ? 'لوحة المؤشرات الفنية والكمية المتقدمة' : 'Advanced Quantitative Indicators Terminal'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRTL
                  ? `تحليل حي ومباشر للزوج ${activeAsset} · إطار ${timeframe} ثانية`
                  : `Real-time mathematical analysis for ${activeAsset} · ${timeframe}s`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="sabaa-well px-4 py-2.5 text-right">
            <span className="block text-[10px] text-slate-400 uppercase font-mono">
              {isRTL ? 'السعر الحالي' : 'Live Price'}
            </span>
            <span className="font-mono tabular-nums text-sm sm:text-base font-black text-amber-300">
              {currentPrice !== null && currentPrice !== undefined
                ? currentPrice.toFixed(activeAsset.includes('JPY') ? 3 : 5)
                : '---'}
            </span>
          </div>

          <div className="sabaa-well px-4 py-2.5 text-right">
            <span className="block text-[10px] text-slate-400 uppercase font-mono">
              {isRTL ? 'عدد الشموع' : 'Candles'}
            </span>
            <span className="font-mono tabular-nums text-sm sm:text-base font-black text-slate-100">
              {candles.length}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. RSI */}
        <div className="sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-100">RSI (14) Relative Strength</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold ${
                rsiStatus === 'OVERBOUGHT'
                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/35'
                  : rsiStatus === 'OVERSOLD'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                  : 'bg-[#04060A] text-slate-300 border border-white/[0.08]'
              }`}
            >
              {rsiStatus}
            </span>
          </div>

          <div className="text-center py-2">
            <span className="font-mono tabular-nums text-3xl font-black text-slate-50">
              {rsi !== null ? rsi.toFixed(1) : '--'}
            </span>
            <span className="text-xs text-slate-400 block mt-1">
              {rsi !== null && rsi > 50 ? 'Bullish Dominance' : 'Bearish Pressure'}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="w-full h-2.5 bg-[#04060A] rounded-full overflow-hidden p-0.5 border border-white/[0.07] flex">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  rsi !== null && rsi >= 70
                    ? 'bg-rose-500'
                    : rsi !== null && rsi <= 30
                    ? 'bg-emerald-500'
                    : 'bg-amber-400'
                }`}
                style={{ width: `${Math.min(Math.max(rsi ?? 50, 0), 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500">
              <span>0 (Oversold 30)</span>
              <span>50</span>
              <span>100 (Overbought 70)</span>
            </div>
          </div>
        </div>

        {/* 2. MACD */}
        <div className="sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-100">MACD (12, 26, 9)</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold ${
                (macd?.histogram ?? 0) > 0
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/35'
              }`}
            >
              {(macd?.histogram ?? 0) > 0 ? 'BULLISH' : 'BEARISH'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center py-2">
            <div className="sabaa-well p-2.5">
              <span className="block text-[10px] text-slate-500 font-mono">MACD</span>
              <span className="text-xs font-mono tabular-nums font-bold text-sky-400">
                {macd ? macd.macd.toFixed(5) : '--'}
              </span>
            </div>
            <div className="sabaa-well p-2.5">
              <span className="block text-[10px] text-slate-500 font-mono">Signal</span>
              <span className="text-xs font-mono tabular-nums font-bold text-amber-400">
                {macd ? macd.signal.toFixed(5) : '--'}
              </span>
            </div>
            <div className="sabaa-well p-2.5">
              <span className="block text-[10px] text-slate-500 font-mono">Histogram</span>
              <span
                className={`text-xs font-mono tabular-nums font-bold ${
                  (macd?.histogram ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {macd ? macd.histogram.toFixed(5) : '--'}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            {isRTL
              ? 'تقاطع الماكد مع خط الإشارة يعطي تأكيداً لزخم الشمعة القادمة'
              : 'MACD line crossing signal denotes momentum acceleration'}
          </p>
        </div>

        {/* 3. Bollinger Bands */}
        <div className="sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-100">Bollinger Bands (20, 2)</h3>
            </div>
            <span className="text-[11px] font-mono tabular-nums font-bold text-amber-300">
              %B: {bollinger ? (bollinger.percentB * 100).toFixed(0) : '--'}%
            </span>
          </div>

          <div className="space-y-2 py-1">
            <div className="sabaa-well px-3 py-2 flex justify-between items-center text-xs">
              <span className="text-slate-400">{isRTL ? 'الحد العلوي' : 'Upper Band'}:</span>
              <span className="font-mono tabular-nums text-emerald-400 font-bold">
                {bollinger ? bollinger.upper.toFixed(5) : '--'}
              </span>
            </div>
            <div className="sabaa-well px-3 py-2 flex justify-between items-center text-xs">
              <span className="text-slate-400">{isRTL ? 'الخط الأوسط (SMA)' : 'Middle Band'}:</span>
              <span className="font-mono tabular-nums text-slate-100 font-bold">
                {bollinger ? bollinger.middle.toFixed(5) : '--'}
              </span>
            </div>
            <div className="sabaa-well px-3 py-2 flex justify-between items-center text-xs">
              <span className="text-slate-400">{isRTL ? 'الحد السفلي' : 'Lower Band'}:</span>
              <span className="font-mono tabular-nums text-rose-400 font-bold">
                {bollinger ? bollinger.lower.toFixed(5) : '--'}
              </span>
            </div>
          </div>

          <div className="pt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>{isRTL ? 'عرض النطاق (Bandwidth)' : 'Bandwidth'}:</span>
            <span className="font-mono tabular-nums text-slate-200 font-bold">
              {bollinger ? bollinger.bandwidth.toFixed(4) : '--'}
            </span>
          </div>
        </div>

        {/* 4. ADX & Trend Strength */}
        <div className="sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-100">ADX (14) Trend Strength</h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35">
              {adx?.trendStrength || 'ANALYZING'}
            </span>
          </div>

          <div className="text-center py-1">
            <span className="font-mono tabular-nums text-2xl font-black text-slate-50">
              {adx ? adx.adx.toFixed(1) : '--'}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              {adx && adx.adx >= 25 ? 'Strong Directional Movement' : 'Weak / Consolidation'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-center text-xs font-mono tabular-nums">
            <div className="sabaa-panel-emerald p-2.5 text-emerald-300 font-bold">
              <span>+DI: {adx ? adx.plusDI.toFixed(1) : '--'}</span>
            </div>
            <div className="sabaa-panel-crimson p-2.5 text-rose-300 font-bold">
              <span>-DI: {adx ? adx.minusDI.toFixed(1) : '--'}</span>
            </div>
          </div>
        </div>

        {/* 5. Stochastic Oscillator */}
        <div className="sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-slate-100">Stochastic (14, 3, 3)</h3>
            </div>
            <span className="text-[11px] font-mono tabular-nums font-bold text-cyan-300">
              K: {stoch ? stoch.k.toFixed(1) : '--'} · D: {stoch ? stoch.d.toFixed(1) : '--'}
            </span>
          </div>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>%K Line:</span>
                <span className="font-mono tabular-nums font-bold text-cyan-400">{stoch ? stoch.k.toFixed(1) : '--'}</span>
              </div>
              <div className="w-full h-1.5 bg-[#04060A] rounded-full overflow-hidden border border-white/[0.06]">
                <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.min(Math.max(stoch?.k ?? 50, 0), 100)}%` }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>%D Line:</span>
                <span className="font-mono tabular-nums font-bold text-amber-400">{stoch ? stoch.d.toFixed(1) : '--'}</span>
              </div>
              <div className="w-full h-1.5 bg-[#04060A] rounded-full overflow-hidden border border-white/[0.06]">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(Math.max(stoch?.d ?? 50, 0), 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* 6. Moving Averages Ribbon */}
        <div className="sabaa-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-100">MA Alignment Ribbon</h3>
            </div>
            <span className="text-[11px] font-mono font-bold text-emerald-300">
              EMA 9 · 21 · 50
            </span>
          </div>

          <div className="space-y-2 py-1 text-xs">
            <div className="sabaa-well px-3 py-2 flex justify-between">
              <span className="text-slate-400">EMA Fast (9):</span>
              <span className="font-mono tabular-nums text-slate-100 font-bold">
                {indicators?.emaFast ? indicators.emaFast.toFixed(5) : '--'}
              </span>
            </div>
            <div className="sabaa-well px-3 py-2 flex justify-between">
              <span className="text-slate-400">EMA Slow (21):</span>
              <span className="font-mono tabular-nums text-slate-100 font-bold">
                {indicators?.emaSlow ? indicators.emaSlow.toFixed(5) : '--'}
              </span>
            </div>
            <div className="sabaa-well px-3 py-2 flex justify-between">
              <span className="text-slate-400">SMA (50):</span>
              <span className="font-mono tabular-nums text-slate-100 font-bold">
                {indicators?.sma ? indicators.sma.toFixed(5) : '--'}
              </span>
            </div>
          </div>

          <div className="pt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>ATR Volatility:</span>
            <span className="font-mono tabular-nums text-amber-400 font-bold">{atr ? atr.toFixed(5) : '--'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
