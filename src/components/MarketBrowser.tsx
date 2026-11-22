import React, { useState } from 'react';
import { AssetInfo } from '../types';
import { Search, CheckCircle, ArrowRight, Shield } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface MarketBrowserProps {
  assets: AssetInfo[];
  activeAsset?: string;
  selectedAsset?: string;
  currentPrice?: number;
  onSelectAsset: (asset: string) => void;
}

export const MarketBrowser: React.FC<MarketBrowserProps> = ({
  assets,
  activeAsset,
  selectedAsset,
  currentPrice,
  onSelectAsset,
}) => {
  const { t, tTerm, isRTL } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CURRENCIES' | 'CRYPTO' | 'COMMODITIES' | 'STOCKS'>('ALL');
  const [onlyOtc, setOnlyOtc] = useState(false);

  const filterLabels: Record<string, string> = {
    ALL: t('market.all', 'ALL'),
    CURRENCIES: t('market.currencies', 'CURRENCIES'),
    CRYPTO: t('market.crypto', 'CRYPTO'),
    COMMODITIES: t('market.commodities', 'COMMODITIES'),
    STOCKS: t('market.stocks', 'STOCKS'),
  };

  const filteredAssets = assets.filter((item) => {
    // Search filter
    const matchesSearch =
      item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.asset.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // OTC filter
    if (onlyOtc && !item.is_otc) return false;

    // Category filter
    if (filterType === 'ALL') return true;
    if (filterType === 'CURRENCIES' && (item.type.includes('currency') || item.type.includes('forex'))) return true;
    if (filterType === 'CRYPTO' && item.type.includes('crypto')) return true;
    if (filterType === 'COMMODITIES' && item.type.includes('commodit')) return true;
    if (filterType === 'STOCKS' && (item.type.includes('stock') || item.type.includes('share'))) return true;

    return false;
  });

  return (
    <div id="market-browser" className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="p-4 rounded-2xl sabaa-panel flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            placeholder={t('market.searchPlaceholder', 'Search currency pairs, crypto, OTC...')}
            value={searchTerm || ''}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full py-2 rounded-xl sabaa-input text-xs placeholder-slate-500 ${
              isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
            }`}
          />
        </div>

        {/* Category Buttons & OTC toggle */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {(['ALL', 'CURRENCIES', 'CRYPTO', 'COMMODITIES', 'STOCKS'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                filterType === type
                  ? 'sabaa-btn-gold'
                  : 'sabaa-btn-surface text-slate-300'
              }`}
            >
              {filterLabels[type] || type}
            </button>
          ))}

          <label className="flex items-center gap-1.5 text-xs text-slate-300 px-2.5 py-1.5 rounded-lg sabaa-well cursor-pointer">
            <input
              type="checkbox"
              checked={onlyOtc}
              onChange={(e) => setOnlyOtc(e.target.checked)}
              className="w-3.5 h-3.5 accent-amber-400 rounded cursor-pointer"
            />
            <span>{t('market.otcOnly', 'OTC Only')}</span>
          </label>
        </div>
      </div>

      {/* Asset Table */}
      <div className="rounded-2xl sabaa-panel overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] bg-[#04060A]">
          <table className={`w-full text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
            <thead className="bg-[#05080F] text-slate-400 font-semibold sticky top-0 border-b border-white/[0.08] uppercase tracking-wider text-[10px] z-10">
              <tr>
                <th className="py-3 px-4">{t('market.assetPair', 'Asset / Pair')}</th>
                <th className="py-3 px-3">{t('market.type', 'Type')}</th>
                <th className="py-3 px-3">{t('market.market', 'Market')}</th>
                <th className="py-3 px-3">{t('market.payout', 'Payout')}</th>
                <th className={`py-3 px-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('market.action', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] tabular-nums">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    {t('market.noAssets', 'No assets match current filters')}
                  </td>
                </tr>
              ) : (
                filteredAssets.map((item) => {
                  const isActive = item.asset === activeAsset;

                  return (
                    <tr
                      key={item.asset}
                      className={`hover:bg-white/[0.03] transition-colors ${
                        isActive ? 'bg-amber-500/[0.06]' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-semibold text-slate-100">
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          )}
                          <span>{item.label}</span>
                          <span className="text-[10px] font-mono text-slate-500 font-normal">
                            ({item.asset})
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-400 capitalize">
                        {item.type || 'Standard'}
                      </td>
                      <td className="py-3 px-3">
                        {item.is_otc ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {tTerm('OTC 24/7')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            {tTerm('LIVE MARKET')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold">
                        <span className="text-emerald-400">{item.payout}%</span>
                      </td>
                      <td className={`py-3 px-4 ${isRTL ? 'text-left' : 'text-right'}`}>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-amber-300 font-bold text-xs">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{t('market.active', 'Active')}</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => onSelectAsset(item.asset)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl sabaa-btn-surface text-xs font-bold whitespace-nowrap cursor-pointer"
                          >
                            <span>{t('market.analyze', 'Analyze')}</span>
                            <ArrowRight className={`w-3 h-3 ${isRTL ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
