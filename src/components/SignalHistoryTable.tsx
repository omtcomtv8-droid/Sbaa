import React, { useState, useEffect } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  History,
  XCircle,
  Clock,
  Eye,
  TrendingUp,
  TrendingDown,
  Layers,
  DollarSign,
  Activity,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Signal } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { TradeDetailModal, DetailedTradeRecord } from './TradeDetailModal';
import { tradeHistoryStorage } from '../services/TradeHistoryStorage';
import { auth } from '../lib/firebase';
import { safeFetchJson } from '../utils/safeFetch';

interface SignalHistoryTableProps {
  history: Signal[];
  onSelectSignal?: (signal: Signal) => void;
  onClearSignals?: (performance?: any) => void;
}

export const SignalHistoryTable: React.FC<SignalHistoryTableProps> = ({
  history,
  onSelectSignal,
  onClearSignals,
}) => {
  const { t, tTerm, tDynamic, isRTL } = useLanguage();
  const [activeTab, setActiveTab] = useState<'SIGNALS' | 'DEALS'>('DEALS');
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'WON' | 'LOST' | 'DRAW'>('ALL');
  const [deals, setDeals] = useState<DetailedTradeRecord[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<DetailedTradeRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);

  // Subscribe to real-time executed broker deals
  useEffect(() => {
    const unsub = tradeHistoryStorage.subscribe((records) => {
      setDeals(records);
    });
    return unsub;
  }, []);

  const hasItemsInActiveTab = activeTab === 'DEALS' ? deals.length > 0 : history.length > 0;

  const handleClearCurrentList = async () => {
    setClearing(true);
    try {
      if (activeTab === 'DEALS') {
        await tradeHistoryStorage.clearTrades(auth.currentUser?.uid);
      } else {
        const res = await safeFetchJson<any>('/api/history/clear', { method: 'POST' });
        onClearSignals?.(res.data?.performance);
      }
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  };

  const completed = history.filter((s) => s.status === 'WON' || s.status === 'LOST');
  const wonCount = history.filter((s) => s.status === 'WON').length;
  const lostCount = history.filter((s) => s.status === 'LOST').length;
  const winRate = completed.length > 0 ? Math.round((wonCount / completed.length) * 100) : null;

  const dealStats = tradeHistoryStorage.calculatePerformanceStats(deals);

  const filteredHistory = history.filter((s) => {
    if (filter === 'ALL') return true;
    if (filter === 'BUY') return s.type === 'UP' || (s.type as any) === 'BUY';
    if (filter === 'SELL') return s.type === 'DOWN' || (s.type as any) === 'SELL';
    if (filter === 'WON') return s.status === 'WON';
    if (filter === 'LOST') return s.status === 'LOST';
    if (filter === 'DRAW') return false;
    return true;
  });

  const filteredDeals = deals.filter((d) => {
    if (filter === 'ALL') return true;
    if (filter === 'BUY') return d.action === 'call';
    if (filter === 'SELL') return d.action === 'put';
    if (filter === 'WON') return d.result === 'WIN';
    if (filter === 'LOST') return d.result === 'LOSS';
    if (filter === 'DRAW') return d.result === 'DRAW';
    return true;
  });

  return (
    <div id="signal-history-table" className="w-full sabaa-panel rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Top Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.07] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/12 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-100">
              {isRTL ? 'سجل الصفقات والإشارات الموثق' : 'Audited Deals & Signals Registry'}
            </h2>
            <p className="text-[11px] text-slate-400">
              {isRTL ? 'سجل تدقيق كامل للصفقات المنفذة وإشارات الاستراتيجيات مع عارض الشارت' : 'Complete record of executed deals and strategy signals with chart snapshots'}
            </p>
          </div>
        </div>

        {/* Tab Switcher + Clear List */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center sabaa-well p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('DEALS');
                setConfirmClear(false);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'DEALS'
                  ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isRTL ? `الصفقات المنفذة (${deals.length})` : `Executed Deals (${deals.length})`}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('SIGNALS');
                setConfirmClear(false);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'SIGNALS'
                  ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isRTL ? `إشارات الاستراتيجيات (${history.length})` : `Signals (${history.length})`}</span>
            </button>
          </div>

          {confirmClear ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearCurrentList}
                disabled={clearing}
                className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {clearing
                  ? isRTL ? 'جاري المسح...' : 'Clearing...'
                  : isRTL ? 'تأكيد المسح' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                disabled={clearing}
                className="px-2.5 py-1.5 rounded-xl sabaa-well text-slate-300 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={!hasItemsInActiveTab}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={isRTL ? 'مسح القائمة الحالية' : 'Clear current list'}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isRTL ? 'مسح' : 'Clear'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Stats Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center sabaa-well p-0.5 rounded-lg text-[11px]">
          {(['ALL', 'BUY', 'SELL', 'WON', 'LOST', 'DRAW'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                filter === f
                  ? 'bg-amber-500/20 text-amber-200 font-bold border border-amber-500/35'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f === 'DRAW'
                ? (isRTL ? 'تعادل' : 'DRAW')
                : tTerm(f === 'BUY' ? 'BUY' : f === 'SELL' ? 'SELL' : f === 'WON' ? 'WIN' : f === 'LOST' ? 'LOSS' : 'ALL')}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
          <div className="px-2.5 py-1 rounded-lg sabaa-well text-slate-300">
            {isRTL ? 'الإجمالي:' : 'Total:'} <strong className="text-slate-100">{activeTab === 'DEALS' ? deals.length : history.length}</strong>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-medium">
            {isRTL ? 'الرابحة:' : 'Won:'} <strong>{activeTab === 'DEALS' ? dealStats.wonCount : wonCount}</strong>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/25 font-medium">
            {isRTL ? 'الخاسرة:' : 'Lost:'} <strong>{activeTab === 'DEALS' ? dealStats.lostCount : lostCount}</strong>
          </div>
          {activeTab === 'DEALS' && (
            <div className="px-2.5 py-1 rounded-lg sabaa-well text-slate-300 font-medium">
              {isRTL ? 'التعادل:' : 'Draw:'} <strong>{dealStats.drawCount}</strong>
            </div>
          )}
          {(activeTab === 'DEALS' ? (dealStats.evaluatedCount > 0 ? dealStats.winRate : null) : winRate) !== null && (
            <div className="px-2.5 py-1 rounded-lg bg-amber-500/12 text-amber-300 border border-amber-500/30 font-bold">
              {isRTL ? 'نسبة النجاح:' : 'Win Rate:'} {activeTab === 'DEALS' ? dealStats.winRate : winRate}%
            </div>
          )}
          {activeTab === 'DEALS' && (
            <div className={`px-2.5 py-1 rounded-lg font-bold border ${
              dealStats.todayNetProfit >= 0
                ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/12 text-rose-300 border-rose-500/30'
            }`}>
              {isRTL ? 'صافي أرباح اليوم:' : 'Today PnL:'} {dealStats.todayNetProfit >= 0 ? '+' : ''}${dealStats.todayNetProfit.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* VIEW 1: EXECUTED BROKER DEALS */}
      {activeTab === 'DEALS' && (
        <div className="overflow-x-auto max-h-[480px] rounded-xl border border-white/[0.06] bg-[#04060A]">
          {filteredDeals.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs px-4">
              {isRTL
                ? 'لا توجد صفقات منفذة مسجلة حالياً. عند إرسال أي صفقة يدوياً أو آلياً، سيتم حفظها وتفصيلها هنا فوراً.'
                : 'No executed deals recorded yet. Dispatched manual or automated orders will appear here in real-time.'}
            </div>
          ) : (
            <table className={`w-full text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
              <thead className="sticky top-0 bg-[#05080F] z-10">
                <tr className="border-b border-white/[0.08] text-slate-400 uppercase text-[10px]">
                  <th className="py-3 px-3">{isRTL ? 'التوقيت' : 'Time'}</th>
                  <th className="py-3 px-3">{isRTL ? 'الأصل' : 'Asset'}</th>
                  <th className="py-3 px-3">{isRTL ? 'النوع' : 'Action'}</th>
                  <th className="py-3 px-3">{isRTL ? 'المبلغ' : 'Stake'}</th>
                  <th className="py-3 px-3">{isRTL ? 'الفريم' : 'Timeframe'}</th>
                  <th className="py-3 px-3">{isRTL ? 'الدخول → الخروج' : 'Entry → Exit'}</th>
                  <th className="py-3 px-3">{isRTL ? 'النتيجة' : 'Result'}</th>
                  <th className="py-3 px-3">{isRTL ? 'الربح' : 'Profit'}</th>
                  <th className="py-3 px-3 text-right">{isRTL ? 'تفاصيل والشارت' : 'Details & Chart'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono tabular-nums">
                {filteredDeals.map((deal) => {
                  const digits = deal.asset.includes('JPY') ? 3 : 5;
                  const isCall = deal.action === 'call';
                  return (
                    <tr
                      key={deal.id}
                      onClick={() => setSelectedTrade(deal)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                      title={isRTL ? 'اضغط لعرض تفاصيل الصفقة والشارت' : 'Click to inspect deal details & chart'}
                    >
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(deal.openTime * 1000).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{deal.asset}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              deal.accountMode === 'DEMO'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            {deal.accountMode}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] ${
                            isCall
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {isCall ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {deal.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-100 font-bold whitespace-nowrap">
                        ${deal.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        {deal.timeframe === 60 ? '1M' : deal.timeframe === 300 ? '5M' : deal.timeframe === 900 ? '15M' : `${deal.timeframe}s`}
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap text-[11px]">
                        <span>{deal.entryPrice ? deal.entryPrice.toFixed(digits) : '—'}</span>
                        <span className="text-slate-600 mx-1">→</span>
                        <span className={deal.result === 'WIN' ? 'text-emerald-400' : deal.result === 'LOSS' ? 'text-rose-400' : 'text-slate-400'}>
                          {deal.exitPrice ? deal.exitPrice.toFixed(digits) : (deal.closePrice ? deal.closePrice.toFixed(digits) : '—')}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {deal.result === 'WIN' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                            <CheckCircle2 className="w-3 h-3" /> WIN
                          </span>
                        )}
                        {deal.result === 'LOSS' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/35">
                            <XCircle className="w-3 h-3" /> LOSS
                          </span>
                        )}
                        {deal.result === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/35 animate-pulse">
                            <Clock className="w-3 h-3" /> PENDING
                          </span>
                        )}
                        {deal.result === 'DRAW' && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-white/[0.06] text-slate-400">
                            DRAW
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-bold">
                        {deal.profit !== undefined ? (
                          <span className={deal.profit > 0 ? 'text-emerald-400' : deal.profit < 0 ? 'text-rose-400' : 'text-slate-400'}>
                            {deal.profit >= 0 ? `+$${deal.profit.toFixed(2)}` : `-$${Math.abs(deal.profit).toFixed(2)}`}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTrade(deal);
                          }}
                          className="px-2.5 py-1 rounded-lg sabaa-well hover:bg-amber-500/20 hover:border-amber-500/40 text-slate-200 hover:text-amber-200 transition-colors cursor-pointer text-[11px] font-sans font-semibold inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>{isRTL ? 'عرض' : 'View'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* VIEW 2: STRATEGY SIGNALS */}
      {activeTab === 'SIGNALS' && (
        <div className="overflow-x-auto max-h-[480px] rounded-xl border border-white/[0.06] bg-[#04060A]">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              {t('history.emptyHistory', 'No signals match current filter.')}
            </div>
          ) : (
            <table className={`w-full text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
              <thead className="sticky top-0 bg-[#05080F] z-10">
                <tr className="border-b border-white/[0.08] text-slate-400 uppercase text-[10px]">
                  <th className="py-3 px-3">{t('history.timestamp', 'Time')}</th>
                  <th className="py-3 px-3">{t('history.asset', 'Asset')}</th>
                  <th className="py-3 px-3">{t('history.direction', 'Direction')}</th>
                  <th className="py-3 px-3">{t('signals.confirmations', 'Confirmations')}</th>
                  <th className="py-3 px-3">{t('history.entryPrice', 'Entry Price')}</th>
                  <th className="py-3 px-3">{t('history.resultPrice', 'Result Price')}</th>
                  <th className="py-3 px-3">{t('history.outcome', 'Outcome')}</th>
                  <th className="py-3 px-3">{t('history.evidence', 'Decision Evidence')}</th>
                  <th className="py-3 px-3 text-right">{t('history.audit', 'Audit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono tabular-nums">
                {filteredHistory.map((sig) => (
                  <tr
                    key={sig.id}
                    onClick={() => onSelectSignal?.(sig)}
                    className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                      {new Date(sig.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-100 whitespace-nowrap">
                      {sig.asset}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {sig.type === 'UP' || (sig.type as any) === 'BUY' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <ArrowUpRight className="w-3 h-3" /> {tTerm('BUY')}
                        </span>
                      ) : sig.type === 'DOWN' || (sig.type as any) === 'SELL' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          <ArrowDownRight className="w-3 h-3" /> {tTerm('SELL')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] sabaa-well text-slate-400">
                          {tTerm('WAIT')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-sans text-xs whitespace-nowrap">
                      {sig.confirmations} / {sig.totalStrategies || 9} {t('signals.agree', 'Agree')}
                    </td>
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      {typeof sig.price === 'number' ? sig.price.toFixed(5) : '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      {typeof sig.resultPrice === 'number' ? sig.resultPrice.toFixed(5) : '—'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {sig.status === 'WON' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                          <CheckCircle2 className="w-3 h-3" /> {t('history.win', 'WON')}
                        </span>
                      )}
                      {sig.status === 'LOST' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/35">
                          <XCircle className="w-3 h-3" /> {t('history.loss', 'LOST')}
                        </span>
                      )}
                      {sig.status === 'ACTIVE' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <Clock className="w-3 h-3" /> {tTerm('PENDING')}
                        </span>
                      )}
                      {sig.status === 'EXPIRED' && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-white/[0.06] text-slate-400">
                          {tTerm('EXPIRED')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-sans text-[11px] max-w-xs truncate">
                      {tDynamic(sig.reason)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSignal?.(sig);
                        }}
                        className="p-1.5 rounded-lg sabaa-well hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                        title={t('history.viewAudit', 'View full audit breakdown')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Interactive Detailed Trade Modal */}
      {selectedTrade && (
        <TradeDetailModal
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  );
};
