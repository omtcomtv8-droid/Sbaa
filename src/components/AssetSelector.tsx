import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, TrendingUp } from 'lucide-react';
import { AssetInfo, StrategyName } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface AssetSelectorProps {
  assets: AssetInfo[];
  selectedAsset: string;
  selectedTimeframe: number;
  selectedStrategy: StrategyName;
  currentPrice: number | null;
  isAnalyzing?: boolean;
  onStartAnalysis?: () => void;
  onStopAnalysis?: () => void;
  onSelectAsset: (asset: string) => void;
  onSelectTimeframe: (tf: number) => void;
  onSelectStrategy: (strat: StrategyName) => void;
}

const TIMEFRAMES = [
  { label: '5s', value: 5 },
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '30m', value: 1800 },
  { label: '1h', value: 3600 },
  { label: '4h', value: 14400 },
  { label: '1D', value: 86400 },
];

const STRATEGIES: { id: StrategyName; label: string; desc: string }[] = [
  { id: 'confluence', label: '★ Multi-Strategy Confluence', desc: 'Weighted institutional scoring across active strategies' },
  { id: 'ema_trend', label: 'EMA Trend Momentum (9/21)', desc: 'Fast EMA crossover and directional slope filter' },
  { id: 'sma_crossover', label: 'SMA Crossover (20/50)', desc: 'Classical moving average trend shift' },
  { id: 'ma_alignment', label: 'MA Ribbon Alignment', desc: 'Hierarchical bullish/bearish alignment' },
  { id: 'rsi_momentum', label: 'RSI Momentum Expansion', desc: 'Bullish (RSI>55) and Bearish (RSI<45) momentum' },
  { id: 'rsi_reversal', label: 'RSI Mean Reversion', desc: 'Extreme oversold (≤30) and overbought (≥70) reversals' },
  { id: 'macd', label: 'MACD Trend & Cross', desc: 'Histogram acceleration & signal line crossovers' },
  { id: 'bollinger_bounce', label: 'Bollinger Band Bounce', desc: 'Mean reversion off ±2 std deviation bands' },
  { id: 'stochastic', label: 'Stochastic Oscillator', desc: 'Overbought/oversold %K/%D crossover' },
  { id: 'cci', label: 'Commodity Channel Index', desc: 'Cyclical momentum threshold crossovers' },
  { id: 'adx_trend', label: 'ADX Trend Strength', desc: 'Directional movement system (DI+/DI-) & ADX' },
  { id: 'parabolic_sar', label: 'Parabolic SAR Acceleration', desc: 'Stop and reverse trend following' },
  { id: 'ichimoku', label: 'Ichimoku Kumo Cloud', desc: 'Tenkan/Kijun cross and cloud breakout' },
  { id: 'candlestick', label: 'Candlestick Formations', desc: 'Engulfing, pinbar, hammer & star patterns' },
  { id: 'support_resistance', label: 'Support & Resistance', desc: 'Liquid bounce and rejection at key levels' },
  { id: 'breakout', label: 'Volatility Channel Breakout', desc: 'Donchian & ATR high/low channel expansion' },
  { id: 'market_structure', label: 'Market Structure (BOS/CHoCH)', desc: 'Higher Highs / Higher Lows swing analysis' },
  { id: 'pivot_point', label: 'Floor Trader Pivot Points', desc: 'Daily PP, S1/S2, R1/R2 reaction zones' },
  { id: 'fibonacci', label: 'Fibonacci Retracements', desc: 'Golden 61.8% and 50% retracement levels' },
  { id: 'price_action', label: 'Smart Money Concepts (SMC)', desc: 'Order blocks & Fair Value Gaps (FVG)' },
  { id: 'atr_volatility', label: 'ATR Volatility Filter', desc: 'Regime filtering based on relative ATR' },
  { id: 'gann_price_time', label: 'W.D. Gann Price/Time Analysis', desc: 'Gann 8ths, 1x1 angles, price-time squaring & cycles' },
  { id: 'elliott_wave', label: 'Ralph Nelson Elliott Wave', desc: '5-wave impulse & ABC corrective structure validation' },
  { id: 'darvas_box', label: 'Nicolas Darvas Box Strategy', desc: 'Upper/lower consolidation box breakouts and trailing stops' },
];

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  selectedAsset,
  selectedTimeframe,
  selectedStrategy,
  currentPrice,
  isAnalyzing = true,
  onStartAnalysis,
  onStopAnalysis,
  onSelectAsset,
  onSelectTimeframe,
  onSelectStrategy,
}) => {
  const { t, isRTL, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'otc' | 'currency' | 'crypto' | 'stock'>('all');
  const [priceColor, setPriceColor] = useState<'neutral' | 'up' | 'down'>('neutral');
  const prevPriceRef = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (currentPrice !== null && prevPriceRef.current !== null) {
      if (currentPrice > prevPriceRef.current) {
        setPriceColor('up');
      } else if (currentPrice < prevPriceRef.current) {
        setPriceColor('down');
      }
      const timer = setTimeout(() => setPriceColor('neutral'), 400);
      prevPriceRef.current = currentPrice;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  const activeAssetObj = assets.find((a) => a.asset === selectedAsset) || {
    id: 0,
    asset: selectedAsset,
    label: selectedAsset,
    type: selectedAsset.toLowerCase().includes('usd') ? 'currency' : 'asset',
    digits: selectedAsset.includes('JPY') ? 3 : 5,
    payout: 92,
    is_otc: selectedAsset.toLowerCase().includes('otc'),
    active: true,
  };

  const filteredAssets = assets.filter((a) => {
    const matchesSearch =
      a.asset.toLowerCase().includes(search.toLowerCase()) ||
      a.label.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filterType === 'all') return true;
    if (filterType === 'otc') return a.is_otc;
    if (filterType === 'currency') return a.type === 'currency' || (!a.asset.startsWith('#') && !a.asset.includes('BTC'));
    if (filterType === 'crypto') return a.type === 'crypto' || a.asset.includes('BTC') || a.asset.includes('ETH');
    if (filterType === 'stock') return a.type === 'stock' || a.asset.startsWith('#');
    return true;
  });

  const tabLabels: Record<'all' | 'otc' | 'currency' | 'crypto' | 'stock', string> = {
    all: t('market.allCategories', 'All'),
    otc: t('market.otcOnly', 'OTC'),
    currency: t('market.currencies', 'Currencies'),
    crypto: t('market.crypto', 'Crypto'),
    stock: t('market.stocks', 'Stocks'),
  };

  return (
    <div
      className="w-full bg-[#070B14] border-b border-white/[0.08] px-3 sm:px-5 lg:px-6 py-2.5"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="max-w-7xl 2xl:max-w-[1700px] mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-4">
        {/* Left: Asset Dropdown & Live Price */}
        <div className="flex items-center justify-between sm:justify-start flex-wrap gap-3">
          <div className="relative" ref={dropdownRef}>
            <button
              id="btn-asset-select"
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-3 px-3 py-1.5 rounded-xl sabaa-well hover:border-amber-400/40 transition-all cursor-pointer"
            >
              <div className="text-left rtl:text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-100">{activeAssetObj.label}</span>
                  {activeAssetObj.is_otc && (
                    <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-amber-500/15 text-amber-300 border border-amber-400/30">
                      OTC
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
                  <span>
                    {t('market.payout', 'Payout')}:{' '}
                    <strong className="text-emerald-400 font-bold">{activeAssetObj.payout}%</strong>
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="uppercase">{activeAssetObj.type}</span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {isOpen && (
              <div
                className={`absolute ${
                  isRTL ? 'right-0' : 'left-0'
                } mt-2 w-80 max-h-96 rounded-xl sabaa-panel-gold z-50 flex flex-col overflow-hidden`}
              >
                <div className="p-2.5 border-b border-white/[0.08] flex items-center gap-2 bg-[#04060A]">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    id="input-asset-search"
                    type="text"
                    placeholder={t('market.searchPlaceholder', 'Search asset (e.g. EUR, OTC, BTC)...')}
                    value={search || ''}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-xs bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-1 p-2 border-b border-white/[0.08] text-[11px] bg-[#060A12]">
                  {(['all', 'otc', 'currency', 'crypto', 'stock'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setFilterType(tab)}
                      className={`px-2 py-0.5 rounded capitalize font-semibold transition-colors cursor-pointer ${
                        filterType === tab
                          ? 'bg-amber-500 text-[#04060A] font-bold'
                          : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                      }`}
                    >
                      {tabLabels[tab]}
                    </button>
                  ))}
                </div>

                <div className="overflow-y-auto max-h-64 divide-y divide-white/[0.06]">
                  {filteredAssets.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                      {assets.length === 0 ? (
                        <>
                          <div className="font-semibold text-slate-300">
                            {language === 'ar' ? 'في انتظار جدول الأصول' : language === 'ru' ? 'Ожидание списка активов' : 'Awaiting Asset Catalog'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {language === 'ar'
                              ? 'جارٍ الاشتراك في بث أسعار Pocket Option...'
                              : language === 'ru'
                              ? 'Подключение к потоку цен Pocket Option...'
                              : 'Subscribing to Pocket Option market stream...'}
                          </div>
                        </>
                      ) : (
                        <div>{t('market.noAssetsFound', 'No matching assets found.')}</div>
                      )}
                    </div>
                  ) : (
                    filteredAssets.map((asset) => (
                      <button
                        key={asset.asset}
                        onClick={() => {
                          onSelectAsset(asset.asset);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left rtl:text-right text-xs transition-colors hover:bg-white/[0.04] cursor-pointer ${
                          asset.asset === selectedAsset ? 'bg-amber-500/10 text-amber-200' : ''
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                            {asset.label}
                            {asset.is_otc && (
                              <span className="px-1 text-[9px] font-bold rounded bg-amber-500/15 text-amber-300 border border-amber-400/25">
                                OTC
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 uppercase font-mono">
                            {asset.asset} · {asset.type}
                          </div>
                        </div>
                        <div className="text-right rtl:text-left font-mono tabular-nums">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold text-[11px]">
                            {asset.payout}%
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Current Live Price Readout */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">{t('market.livePrice', 'Price')}:</span>
            <div
              className={`text-base sm:text-lg font-mono tabular-nums font-black tracking-tight transition-colors duration-300 px-2.5 py-0.5 rounded-lg ${
                priceColor === 'up'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : priceColor === 'down'
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'text-slate-100'
              }`}
            >
              {currentPrice !== null
                ? currentPrice.toFixed(activeAssetObj.digits || 5)
                : language === 'ar'
                ? 'في انتظار الأسعار...'
                : language === 'ru'
                ? 'Ожидание цен...'
                : 'Awaiting ticks...'}
            </div>
          </div>
        </div>

        {/* Right: Timeframe Selector, Strategy Selector & Engine Control */}
        <div className="flex items-center justify-between sm:justify-end flex-wrap gap-2 sm:gap-2.5">
          <div className="flex items-center sabaa-well rounded-xl p-1 overflow-x-auto no-scrollbar flex-nowrap max-w-full shrink-0 gap-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                id={`btn-tf-${tf.label}`}
                onClick={() => onSelectTimeframe(tf.value)}
                className={`px-2 sm:px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedTimeframe === tf.value
                    ? 'bg-amber-500 text-[#04060A] shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <select
              id="select-strategy"
              value={selectedStrategy}
              onChange={(e) => onSelectStrategy(e.target.value as StrategyName)}
              className="text-xs font-medium sabaa-well text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400/50 cursor-pointer"
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#060A12] text-slate-200">
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {isAnalyzing ? (
            <button
              id="btn-stop-analysis-assetbar"
              onClick={onStopAnalysis}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer"
              title="Pause real-time market analysis engine"
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              <span>{t('strategies.stopAnalysis', 'STOP')}</span>
            </button>
          ) : (
            <button
              id="btn-start-analysis-assetbar"
              onClick={onStartAnalysis}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl sabaa-btn-emerald text-xs whitespace-nowrap shrink-0 cursor-pointer"
              title="Start real-time quantitative analysis engine"
            >
              <TrendingUp className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{t('strategies.startAnalysis', 'START ANALYSIS')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
