import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Calculator,
  Percent,
  DollarSign,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Lock,
  RefreshCw,
  Flame,
  Layers,
  ArrowRight,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { safeFetchJson } from '../utils/safeFetch';

interface RiskManagementViewProps {
  initialBalance?: number | null;
  isDemo?: boolean;
}

export const RiskManagementView: React.FC<RiskManagementViewProps> = ({
  initialBalance,
  isDemo: propIsDemo,
}) => {
  const { t, tTerm, isRTL } = useLanguage();
  const [accountBalance, setAccountBalance] = useState<number>(initialBalance || 1000);
  const [isDemo, setIsDemo] = useState<boolean>(propIsDemo ?? true);
  const [activeStrategyType, setActiveStrategyType] = useState<'fixed' | 'martingale' | 'compound'>('fixed');
  const [payoutPercent, setPayoutPercent] = useState<number>(85); // Pocket Option payout %
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Strategy 1: Fixed Risk
  const [fixedRiskPercent, setFixedRiskPercent] = useState<number>(2.0);

  // Strategy 2: Martingale
  const [martingaleBaseStake, setMartingaleBaseStake] = useState<number>(5);
  const [martingaleMaxSteps, setMartingaleMaxSteps] = useState<number>(4);

  // Strategy 3: Compounding
  const [compoundInitialStake, setCompoundInitialStake] = useState<number>(10);
  const [compoundTargetSteps, setCompoundTargetSteps] = useState<number>(3);

  // Capital Guardian Daily Rules
  const [dailyProfitTargetPercent, setDailyProfitTargetPercent] = useState<number>(10);
  const [dailyMaxDrawdownPercent, setDailyMaxDrawdownPercent] = useState<number>(5);

  // Sync with isolated user simulation balance
  const syncLiveBalance = async () => {
    setIsSyncing(true);
    try {
      const res = await safeFetchJson<any>('/api/status');
      if (res.ok && res.data) {
        const liveBal = res.data.diagnostics?.account?.balance;
        const liveIsDemo = res.data.diagnostics?.account?.isDemo;
        if (typeof liveBal === 'number' && !isNaN(liveBal) && liveBal > 0) {
          setAccountBalance(Number(liveBal.toFixed(2)));
        }
        if (liveIsDemo !== undefined) {
          setIsDemo(Boolean(liveIsDemo));
        }
      }
    } catch (e) {
      console.warn('Could not sync balance', e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncLiveBalance();
  }, []);

  // Calculated Metrics
  const fixedStakeDollars = Number(((accountBalance * fixedRiskPercent) / 100).toFixed(2));
  const fixedProfitOnWin = Number((fixedStakeDollars * (payoutPercent / 100)).toFixed(2));

  // Martingale Calculation
  // Multiplier to recover cumulative loss and secure target profit:
  // At 85% payout: stake * 0.85 > cumulative_losses
  const payoutDec = payoutPercent / 100;
  const martingaleMultiplier = Number(((1 + payoutDec) / payoutDec).toFixed(2)); // ~2.18 for 85%

  const martingaleLadder = [];
  let cumulativeLoss = 0;
  for (let step = 1; step <= martingaleMaxSteps; step++) {
    let stake = 0;
    if (step === 1) {
      stake = martingaleBaseStake;
    } else {
      // Stake needed to recover cumulativeLoss and net at least step 1 profit
      stake = Number(((cumulativeLoss + martingaleBaseStake * payoutDec) / payoutDec).toFixed(2));
      // Ensure minimum 2x step
      if (stake < martingaleLadder[step - 2].stake * 2) {
        stake = Number((martingaleLadder[step - 2].stake * martingaleMultiplier).toFixed(2));
      }
    }
    const potentialPayout = Number((stake * (1 + payoutDec)).toFixed(2));
    const netProfitOnWin = Number((potentialPayout - (cumulativeLoss + stake)).toFixed(2));
    cumulativeLoss += stake;
    const percentOfAccount = Number(((cumulativeLoss / accountBalance) * 100).toFixed(1));

    martingaleLadder.push({
      step,
      stake,
      cumulativeLoss: Number(cumulativeLoss.toFixed(2)),
      potentialPayout,
      netProfitOnWin,
      percentOfAccount,
      isDangerous: percentOfAccount > 25,
    });
  }

  // Compounding Calculation
  const compoundLadder = [];
  let currentStake = compoundInitialStake;
  for (let step = 1; step <= compoundTargetSteps; step++) {
    const profit = Number((currentStake * payoutDec).toFixed(2));
    const totalReturn = Number((currentStake + profit).toFixed(2));
    compoundLadder.push({
      step,
      stake: currentStake,
      profit,
      totalReturn,
    });
    currentStake = totalReturn;
  }

  const targetDailyProfitDollars = Number(((accountBalance * dailyProfitTargetPercent) / 100).toFixed(2));
  const maxDailyLossDollars = Number(((accountBalance * dailyMaxDrawdownPercent) / 100).toFixed(2));

  return (
    <div id="risk-management-view" className={`space-y-6 max-w-6xl mx-auto font-sans ${isRTL ? 'text-right' : 'text-left'}`}>
      {/* Header Banner */}
      <div className="p-5 sm:p-6 rounded-2xl sabaa-panel-gold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-black sabaa-wordmark">
                حاسبة إدارة رأس المال وخطة التداول (Pocket Option)
              </h2>
              <span className="text-[11px] text-amber-300/90 font-mono font-semibold">
                · CAPITAL GUARDIAN
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              حساب حجم الصفقات ومضاعفات التعويض بدقة حسب نسبة العائد المباشر لمنع المرجنة وحماية الحساب.
            </p>
          </div>
        </div>

        <button
          onClick={syncLiveBalance}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl sabaa-btn-surface text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>مزامنة رصيد المنصة</span>
        </button>
      </div>

      {/* Account Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl sabaa-kpi-card space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>الرصيد المتاح</span>
            <span className={`font-mono font-bold text-[10px] ${isDemo ? 'text-amber-300' : 'text-emerald-400'}`}>
              {isDemo ? 'DEMO' : 'REAL'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={accountBalance}
              onChange={(e) => setAccountBalance(Math.max(1, parseFloat(e.target.value) || 0))}
              className="text-xl font-black font-mono tabular-nums px-3 py-1.5 rounded-xl sabaa-input w-full"
            />
            <span className="text-sm font-bold text-amber-300">$</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl sabaa-kpi-card space-y-2">
          <div className="text-xs text-slate-400">نسبة العائد للصفقة (Payout)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {[80, 85, 90, 92].map((p) => (
              <button
                key={p}
                onClick={() => setPayoutPercent(p)}
                className={`py-2 rounded-lg text-xs font-mono font-bold tabular-nums transition-all cursor-pointer ${
                  payoutPercent === p
                    ? 'sabaa-btn-gold'
                    : 'sabaa-btn-surface text-slate-300'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-2xl sabaa-panel-emerald space-y-1.5">
          <div className="text-xs text-slate-400">الهدف اليومي للربح (+{dailyProfitTargetPercent}%)</div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-400">
            +${targetDailyProfitDollars.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400">عند تحقيقه يجب إغلاق المنصة</div>
        </div>

        <div className="p-4 rounded-2xl sabaa-panel-crimson space-y-1.5">
          <div className="text-xs text-slate-400">الحد الأقصى للخسارة اليومية (-{dailyMaxDrawdownPercent}%)</div>
          <div className="text-xl font-black font-mono tabular-nums text-rose-400">
            -${maxDailyLossDollars.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400">صمام أمان: التوقف التام فور الوصول</div>
        </div>
      </div>

      {/* Model Selector Segmented Tabs */}
      <div className="p-1.5 rounded-2xl sabaa-well inline-flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
        <button
          onClick={() => setActiveStrategyType('fixed')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
            activeStrategyType === 'fixed'
              ? 'sabaa-btn-gold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>المخاطرة الثابتة (النموذج الآمن الموصى به)</span>
        </button>

        <button
          onClick={() => setActiveStrategyType('martingale')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
            activeStrategyType === 'martingale'
              ? 'sabaa-btn-gold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>مارتينجال ذكي لتعويض الصفقات</span>
        </button>

        <button
          onClick={() => setActiveStrategyType('compound')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
            activeStrategyType === 'compound'
              ? 'sabaa-btn-gold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>الفائدة المركبة (سلسلة الصفقات التراكمية)</span>
        </button>
      </div>

      {/* MODEL 1: FIXED RISK */}
      {activeStrategyType === 'fixed' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-5 p-5 rounded-2xl sabaa-panel space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 border-b border-white/[0.08] pb-3">
              <Calculator className="w-4 h-4" />
              <span>إعدادات نسبة المخاطرة الثابتة:</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">النسبة المئوية من الرصيد:</span>
                <span className="text-xs font-bold font-mono tabular-nums text-amber-300">{fixedRiskPercent}%</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1.0, 2.0, 3.0, 5.0].map((r) => (
                  <button
                    key={r}
                    onClick={() => setFixedRiskPercent(r)}
                    className={`py-2 rounded-xl text-xs font-mono font-bold tabular-nums transition-all cursor-pointer ${
                      fixedRiskPercent === r
                        ? 'sabaa-btn-gold'
                        : 'sabaa-btn-surface text-slate-300'
                    }`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl sabaa-well space-y-2.5 text-xs tabular-nums">
              <div className="flex justify-between text-slate-300">
                <span>مبلغ الدخول للصفقة الواحدة:</span>
                <span className="font-bold font-mono text-amber-300 text-sm">${fixedStakeDollars.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>صافي الربح عند الفوز ({payoutPercent}%):</span>
                <span className="font-bold font-mono text-emerald-400">+${fixedProfitOnWin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>عدد الصفقات الخاسرة المتتالية لتحمل الحد اليومي:</span>
                <span className="font-bold font-mono text-slate-100">
                  {Math.floor(maxDailyLossDollars / (fixedStakeDollars || 1))} صفقات
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-7 p-5 rounded-2xl sabaa-panel space-y-4">
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2 border-b border-white/[0.08] pb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>جدول المحاكاة والتطور التراكمي (10 صفقات نموذجية)</span>
            </h3>

            <div className="overflow-x-auto rounded-xl sabaa-well">
              <table className="w-full text-right text-xs font-mono tabular-nums">
                <thead className="bg-[#05080F] border-b border-white/[0.08]">
                  <tr className="text-slate-400 font-sans">
                    <th className="py-2.5 px-3">نسبة الفوز المفترضة</th>
                    <th className="py-2.5 px-3">الصفقات الرابحة</th>
                    <th className="py-2.5 px-3">الصفقات الخاسرة</th>
                    <th className="py-2.5 px-3">صافي العائد ($)</th>
                    <th className="py-2.5 px-3">نمو الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {[
                    { winRate: 60, wins: 6, losses: 4 },
                    { winRate: 70, wins: 7, losses: 3 },
                    { winRate: 80, wins: 8, losses: 2 },
                  ].map((row) => {
                    const netProfit = Number((row.wins * fixedProfitOnWin - row.losses * fixedStakeDollars).toFixed(2));
                    const growthPercent = Number(((netProfit / accountBalance) * 100).toFixed(1));
                    return (
                      <tr key={row.winRate} className="hover:bg-white/[0.03]">
                        <td className="py-2.5 px-3 font-bold text-slate-200">{row.winRate}% دقة الإشارات</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">{row.wins} رابحة</td>
                        <td className="py-2.5 px-3 text-rose-400 font-bold">{row.losses} خاسرة</td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">+${netProfit}</td>
                        <td className="py-2.5 px-3 font-bold text-amber-300">+{growthPercent}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-slate-300 leading-relaxed sabaa-well p-3.5 rounded-xl">
              <strong className="text-amber-300">نصيحة الخبراء:</strong> نظام المخاطرة الثابتة بنسبة 1% إلى 2% هو الأسلوب الأكثر أماناً للاستمرار طويل الأجل على منصة Pocket Option، حيث يمنحك مناعة ضد تقلبات السوق المؤقتة.
            </div>
          </div>
        </div>
      )}

      {/* MODEL 2: SMART MARTINGALE */}
      {activeStrategyType === 'martingale' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl sabaa-panel-gold flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-amber-300 block mb-0.5">تحذير إدارة المخاطر لنظام المارتينجال:</strong>
              يعتمد المارتينجال على مضاعفة مبلغ الدخول بعد الخسارة لاستعادة رأس المال مع ربح إضافي. يجب ألا تزيد خطوات التعويض عن 3 أو 4 خطوات كحد أقصى لتفادي استنزاف الرصيد في فترات التذبذب العالي.
            </div>
          </div>

          <div className="p-5 rounded-2xl sabaa-panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-3.5">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">المبلغ الأساسي للخطوة 1 ($):</label>
                  <input
                    type="number"
                    value={martingaleBaseStake}
                    onChange={(e) => setMartingaleBaseStake(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-28 sabaa-input rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-left"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">أقصى عدد للخطوات:</label>
                  <div className="flex items-center gap-1.5">
                    {[3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setMartingaleMaxSteps(s)}
                        className={`px-3 py-2 rounded-xl text-xs font-mono font-bold cursor-pointer transition-all ${
                          martingaleMaxSteps === s
                            ? 'sabaa-btn-gold'
                            : 'sabaa-btn-surface text-slate-300'
                        }`}
                      >
                        {s} خطوات
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-xs font-mono text-slate-400 tabular-nums">
                معامل المضاعفة المحسوب: <span className="font-bold text-amber-300">{martingaleMultiplier}x</span> (بنسبة عائد {payoutPercent}%)
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl sabaa-well">
              <table className="w-full text-right text-xs font-mono tabular-nums">
                <thead className="bg-[#05080F] border-b border-white/[0.08]">
                  <tr className="text-slate-400 font-sans">
                    <th className="py-2.5 px-3">الخطوة</th>
                    <th className="py-2.5 px-3">مبلغ الدخول</th>
                    <th className="py-2.5 px-3">إجمالي الخسارة المتراكمة</th>
                    <th className="py-2.5 px-3">إجمالي العائد عند الفوز</th>
                    <th className="py-2.5 px-3">صافي الربح المحقق</th>
                    <th className="py-2.5 px-3">نسبة المخاطرة من الرصيد</th>
                    <th className="py-2.5 px-3">حالة الأمان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {martingaleLadder.map((row) => (
                    <tr key={row.step} className={`hover:bg-white/[0.03] ${row.isDangerous ? 'bg-rose-950/15' : ''}`}>
                      <td className="py-3 px-3 font-bold text-slate-200">الخطوة #{row.step}</td>
                      <td className="py-3 px-3 font-bold text-amber-300 text-sm">${row.stake}</td>
                      <td className="py-3 px-3 text-slate-300">${row.cumulativeLoss}</td>
                      <td className="py-3 px-3 text-slate-300">${row.potentialPayout}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400">+${row.netProfitOnWin}</td>
                      <td className="py-3 px-3 font-bold text-slate-200">{row.percentOfAccount}%</td>
                      <td className="py-3 px-3">
                        {row.isDangerous ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold">
                            <ShieldAlert className="w-3 h-3" /> خطورة عالية
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
                            <CheckCircle2 className="w-3 h-3" /> آمن ومسيطر عليه
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODEL 3: COMPOUNDING */}
      {activeStrategyType === 'compound' && (
        <div className="p-5 rounded-2xl sabaa-panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-3.5">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">المبلغ المبدئي للمغامرة ($):</label>
                <input
                  type="number"
                  value={compoundInitialStake}
                  onChange={(e) => setCompoundInitialStake(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="w-28 sabaa-input rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-left"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">عدد الصفقات الرابحة المتتالية المستهدفة:</label>
                <div className="flex items-center gap-1.5">
                  {[2, 3, 4].map((s) => (
                    <button
                      key={s}
                      onClick={() => setCompoundTargetSteps(s)}
                      className={`px-3 py-2 rounded-xl text-xs font-mono font-bold cursor-pointer transition-all ${
                        compoundTargetSteps === s
                          ? 'sabaa-btn-gold'
                          : 'sabaa-btn-surface text-slate-300'
                      }`}
                    >
                      {s} صفقات
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 sabaa-well px-3.5 py-2.5 rounded-xl">
              أقصى خسارة ممكنة في أي لحظة: <span className="font-bold font-mono tabular-nums text-rose-400">${compoundInitialStake} فقط</span> (رأس المال المبدئي محمي)
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {compoundLadder.map((row) => (
              <div key={row.step} className="p-4 rounded-xl sabaa-kpi-card space-y-2 tabular-nums">
                <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                  <span>الصفقة #{row.step}</span>
                  <span className="text-emerald-400">عائد {payoutPercent}%</span>
                </div>
                <div className="text-xs text-slate-300 flex justify-between">
                  <span>المبلغ المدفوع:</span>
                  <span className="font-bold font-mono text-amber-300">${row.stake}</span>
                </div>
                <div className="text-xs text-slate-300 flex justify-between">
                  <span>صافي الربح المحقق:</span>
                  <span className="font-bold font-mono text-emerald-400">+${row.profit}</span>
                </div>
                <div className="pt-2 border-t border-white/[0.08] flex justify-between text-xs font-bold text-slate-100">
                  <span>الرصيد التراكمي:</span>
                  <span className="font-mono text-emerald-400 text-sm">${row.totalReturn}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
