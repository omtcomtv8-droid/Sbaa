import React, { useState, useEffect } from 'react';
import {
  Globe,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Activity,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import { ScannerItem } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface MarketScannerViewProps {
  onSelectAsset: (symbol: string) => void;
}

export const MarketScannerView: React.FC<MarketScannerViewProps> = ({ onSelectAsset }) => {
  const { t, tTerm, isRTL } = useLanguage();
  const [items, setItems] = useState<ScannerItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  const fetchScanner = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const res = await fetch('/api/scanner');
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json().catch(() => null);
        if (Array.isArray(data)) {
          setItems(data);
          setLastUpdated(Date.now());
        }
      }
    } catch (err) {
      console.error('Failed to fetch scanner items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScanner();
    const interval = setInterval(fetchScanner, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div id="market-scanner-view" className={`space-y-6 max-w-6xl mx-auto font-sans ${isRTL ? 'text-right' : 'text-left'}`}>
      {/* Header Banner */}
      <div className="p-5 sm:p-6 rounded-2xl sabaa-panel-gold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-black sabaa-wordmark">
                {t('scanner.title', 'Real-Time Multi-Asset Market Scanner')}
              </h2>
              <span className="text-[11px] text-amber-300/90 font-mono font-semibold">
                · REAL-TIME SCANNER
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {t('scanner.subtitle', 'Simultaneous algorithmic monitoring of currency pairs, commodities, crypto, and market regimes.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400 font-mono tabular-nums">
            {t('common.lastUpdated', 'Last update')}: {new Date(lastUpdated).toLocaleTimeString()}
          </span>
          <button
            onClick={fetchScanner}
            className="p-2.5 rounded-xl sabaa-btn-surface text-amber-300 cursor-pointer"
            title={t('common.refresh', 'Refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid of Assets */}
      <div className="rounded-2xl sabaa-panel overflow-hidden">
        <div className="overflow-x-auto bg-[#04060A]">
          <table className={`w-full text-xs font-mono tabular-nums ${isRTL ? 'text-right' : 'text-left'}`}>
            <thead className="bg-[#05080F] border-b border-white/[0.08]">
              <tr className="text-slate-400 font-sans text-[11px]">
                <th className="py-3 px-4 font-semibold">{t('history.asset', 'Asset')}</th>
                <th className="py-3 px-4 font-semibold">{t('market.livePrice', 'Live Price')}</th>
                <th className="py-3 px-4 font-semibold">{t('market.change24h', '24h Change')}</th>
                <th className="py-3 px-4 font-semibold">{t('gauges.rsiTitle', 'RSI (14)')}</th>
                <th className="py-3 px-4 font-semibold">{t('gauges.macdAndAtr', 'MACD')}</th>
                <th className="py-3 px-4 font-semibold">{t('scoreTable.confluence', 'Confluence')}</th>
                <th className="py-3 px-4 font-semibold">{t('history.direction', 'Signal')}</th>
                <th className="py-3 px-4 font-semibold">{t('common.action', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {items.map((item) => (
                <tr key={item.symbol} className="hover:bg-white/[0.03] transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-100">
                    <div className="font-sans font-bold">{item.label}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{item.symbol}</div>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-amber-300 text-sm">
                    {item.currentPrice !== null && item.currentPrice !== undefined ? item.currentPrice : '—'}
                  </td>
                  <td className="py-3.5 px-4">
                    {item.change24h !== null && item.change24h !== undefined ? (
                      <span
                        className={`inline-flex items-center gap-0.5 font-bold ${
                          item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {item.change24h >= 0 ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        <span>{item.change24h >= 0 ? `+${item.change24h}` : item.change24h}%</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {item.rsi !== null && item.rsi !== undefined ? (
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold ${
                          item.rsi <= 30
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : item.rsi >= 70
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-white/[0.06] text-slate-300'
                        }`}
                      >
                        {item.rsi}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-sans text-xs text-slate-300">
                    {item.macdStatus === 'AWAITING_DATA'
                      ? (isRTL ? 'بانتظار البث' : 'Awaiting Feed')
                      : tTerm(item.macdStatus || item.macd)}
                  </td>
                  <td className="py-3.5 px-4">
                    {item.confluenceScore !== null && item.confluenceScore !== undefined ? (
                      <div className="flex items-center gap-1.5 font-mono">
                        <div className="w-12 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full"
                            style={{ width: `${item.confluenceScore}%` }}
                          />
                        </div>
                        <span className="font-bold text-amber-300">{item.confluenceScore}%</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {item.signal === 'BUY' || item.signal === 'STRONG_BUY' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/35">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>{tTerm(item.signal)}</span>
                      </span>
                    ) : item.signal === 'SELL' || item.signal === 'STRONG_SELL' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/35">
                        <TrendingUp className="w-3.5 h-3.5 rotate-180" />
                        <span>{tTerm(item.signal)}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-medium sabaa-well text-slate-400">
                        {tTerm('WAIT')}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <button
                      onClick={() => onSelectAsset(item.symbol)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl sabaa-btn-surface text-amber-300 text-xs font-sans font-bold whitespace-nowrap cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>{t('market.selectAsset', 'Focus Chart')}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
