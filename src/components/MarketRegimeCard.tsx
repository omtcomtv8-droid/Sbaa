import React from 'react';
import { MarketRegime } from '../types';
import { Compass, Flame, ShieldAlert, Waves, TrendingUp, TrendingDown } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface MarketRegimeCardProps {
  regime: MarketRegime;
  volatilityState?: 'HIGH' | 'NORMAL' | 'LOW';
  adx?: number | null;
  bandwidth?: number | null;
}

export const MarketRegimeCard: React.FC<MarketRegimeCardProps> = ({
  regime,
  volatilityState = 'NORMAL',
  adx,
  bandwidth,
}) => {
  const { t, tTerm } = useLanguage();

  const getRegimeDetails = (regime: MarketRegime) => {
    switch (regime) {
      case 'TRENDING_UP':
        return {
          title: t('regime.trendingUpTitle', 'Trending Up (Bullish)'),
          icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
          bgColor: 'sabaa-panel-emerald',
          textColor: 'text-emerald-300',
          badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
          description: t(
            'regime.trendingUpDesc',
            'Fast EMA positioned cleanly above Slow EMA with confirmed Higher Highs & Higher Lows sequence.'
          ),
          strategyAdvice: t(
            'regime.trendingUpAdvice',
            'Trend-following strategies (EMA Trend, Pullbacks) favored. Mean-reversion counter-trend trades suppressed.'
          ),
        };
      case 'TRENDING_DOWN':
        return {
          title: t('regime.trendingDownTitle', 'Trending Down (Bearish)'),
          icon: <TrendingDown className="w-5 h-5 text-rose-400" />,
          bgColor: 'sabaa-panel border-rose-500/35 bg-gradient-to-b from-[#160B12] to-[#090D15]',
          textColor: 'text-rose-300',
          badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
          description: t(
            'regime.trendingDownDesc',
            'Fast EMA positioned cleanly below Slow EMA with confirmed Lower Highs & Lower Lows sequence.'
          ),
          strategyAdvice: t(
            'regime.trendingDownAdvice',
            'Trend-following strategies (EMA Trend, Bearish Pullbacks) favored. Counter-trend long trades suppressed.'
          ),
        };
      case 'RANGING':
        return {
          title: t('regime.rangingTitle', 'Range-Bound / Consolidating'),
          icon: <Waves className="w-5 h-5 text-amber-300" />,
          bgColor: 'sabaa-panel-gold',
          textColor: 'text-amber-300',
          badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
          description: t(
            'regime.rangingDesc',
            'Price oscillating within horizontal boundaries. ADX indicates low directional trend strength.'
          ),
          strategyAdvice: t(
            'regime.rangingAdvice',
            'Mean-reversion strategies (Bollinger Bounce, RSI Overbought/Oversold, S/R Boundaries) favored.'
          ),
        };
      case 'HIGH_VOLATILITY':
        return {
          title: t('regime.highVolTitle', 'High Volatility Regime'),
          icon: <Flame className="w-5 h-5 text-amber-400" />,
          bgColor: 'sabaa-panel-gold',
          textColor: 'text-amber-300',
          badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
          description: t(
            'regime.highVolDesc',
            'ATR expanding significantly above baseline. Sharp candle range expansion and elevated momentum.'
          ),
          strategyAdvice: t(
            'regime.highVolAdvice',
            'Strict confirmation required (3+ strategies). Higher noise tolerance; avoid tight mean-reversions.'
          ),
        };
      case 'LOW_VOLATILITY':
        return {
          title: t('regime.lowVolTitle', 'Low Volatility (Squeeze)'),
          icon: <ShieldAlert className="w-5 h-5 text-sky-400" />,
          bgColor: 'sabaa-panel border-sky-500/25',
          textColor: 'text-sky-300',
          badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
          description: t(
            'regime.lowVolDesc',
            'Bollinger Bandwidth contracted tightly. Price coiling for an impending directional breakout.'
          ),
          strategyAdvice: t(
            'regime.lowVolAdvice',
            'Breakout Strategy monitoring active. Prepare for sharp volatility expansion upon candle close.'
          ),
        };
      default:
        return {
          title: t('regime.indecisionTitle', 'Market Indecision / Transition'),
          icon: <Compass className="w-5 h-5 text-amber-300/80" />,
          bgColor: 'sabaa-panel',
          textColor: 'text-slate-100',
          badgeColor: 'sabaa-well text-slate-300',
          description: t('regime.indecisionDesc', 'Indicators neutral or divergent. No single regime firmly established.'),
          strategyAdvice: t(
            'regime.indecisionAdvice',
            'Maintain WAIT defensive stance until multi-strategy directional consensus is achieved.'
          ),
        };
    }
  };

  const details = getRegimeDetails(regime);

  return (
    <div id="market-regime-card" className={`p-4 sm:p-5 rounded-2xl ${details.bgColor} transition-all duration-200`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          {details.icon}
          <h3 className={`text-sm font-bold tracking-wide ${details.textColor}`}>
            {details.title}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          {typeof adx === 'number' && !isNaN(adx) && (
            <span className="px-2 py-0.5 rounded-md sabaa-well text-slate-200">
              ADX: {adx.toFixed(1)}
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
              volatilityState === 'HIGH'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : volatilityState === 'LOW'
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                : 'sabaa-well text-slate-300'
            }`}
          >
            {tTerm('VOL') || 'VOL'}: {tTerm(volatilityState)}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-300 mb-3 leading-relaxed">{details.description}</p>

      <div className="p-3 rounded-xl sabaa-well text-[11px] text-slate-300 flex items-start gap-2">
        <span className="font-bold text-amber-400 shrink-0">
          {t('regime.advice', 'Algorithmic Directive')}:
        </span>
        <span className="leading-snug">{details.strategyAdvice}</span>
      </div>
    </div>
  );
};
