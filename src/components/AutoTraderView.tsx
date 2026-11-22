import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Coffee,
  RotateCcw,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Sliders,
  Cpu,
  RefreshCw,
  BarChart3,
  Wifi,
  WifiOff,
  Radio,
  FileText,
  Save,
  Check,
  XCircle,
  ExternalLink,
  Trash2,
  MapPin,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { TradeDetailModal, DetailedTradeRecord } from './TradeDetailModal';
import {
  TIMEZONE_OPTIONS,
  normalizeTimezoneValue,
  getBrowserLocationSummary,
  formatTimestampInZone,
} from '../utils/timezoneUtils';
import { authFetch } from '../lib/installAuthenticatedFetch';

interface AutoTraderStatus {
  isRunning: boolean;
  isEmergencyStopped: boolean;
  config: {
    strategyId: string;
    baseAmount: number;
    maxAmount: number;
    stopLoss: number;
    takeProfit: number;
    asset: string;
    timeframe: number;
    isDemo: boolean;
    enableMartingale: boolean;
    martingaleMultiplier: number;
    maxMartingaleDepth: number;
    tradesBeforeRest: number;
    maxConcurrentTrades?: number;
    cooldownBetweenTradesSec?: number;
    displayTimezone?: string;
  };
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  drawTrades?: number;
  acceptedTradesCount: number;
  rejectedTradesCount: number;
  winRate: number;
  dailyPnL: number;
  circuitBreakerTripped: boolean;
  circuitBreakerReason: string;
  isInRestBreak: boolean;
  restRemainingSec: number;
  consecutiveTradesCount: number;
  tradesBeforeRest: number;
  isExecutingTrade: boolean;
  brokerStatus?: {
    websocket: string;
    auth: string;
    isConnected: boolean;
    endpoint?: string;
    latencyMs: number;
    mode: string;
    balance: number | null;
    isDemo: boolean;
  };
  recentTrades: Array<{
    id: string;
    timestamp: number;
    ticketId?: string;
    asset: string;
    action: 'call' | 'put';
    amount: number;
    openPrice?: number;
    closePrice?: number;
    profit?: number;
    lifecycle?: string;
    status: 'PENDING' | 'WON' | 'LOST' | 'DRAW' | 'FAILED';
    strategy: string;
    confidence?: number;
    reason?: string;
    rejectionReason?: string;
  }>;
  recentLogs: Array<{
    id: string;
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
    category: string;
  }>;
}

interface BacktestReport {
  strategyId: string;
  strategyName: string;
  asset: string;
  timeframe: number;
  totalCandles: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netProfit: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  maxDrawdownUsd: number;
  avgWin: number;
  avgLoss: number;
  disclaimer: string;
  trades?: Array<{
    entryTime: number;
    exitTime: number;
    action: string;
    entryPrice: number;
    exitPrice: number;
    stake: number;
    pnl: number;
    isWin: boolean;
  }>;
}

const STRATEGIES_LIST = [
  {
    id: 'sbaa',
    nameAr: 'SBAA — استراتيجية سبع المدمجة الشاملة',
    nameEn: 'SBAA Quant Pro Engine',
    descAr: 'دمج شامل لجميع محاور واستراتيجيات سبع الـ 6: نماذج الشموع اليابانية المركبة، سحب السيولة (Sweeps)، كسر الهيكل (BOS/CHOCH)، انضغاط وانفجار بولينجر، ارتداد المتوسطات EMA 20/50/200، وانفراجات RSI. دخول مشروط بمصفوفة 100 نقطة (80+ للتأهيل) بدون أي دخول عشوائي.',
    descEn: 'Full synthesis of all SBAA strategy modules: Pin Bar, Engulfing, Stars, Harami, Liquidity Sweeps, Structure BOS/CHOCH, and 100-point scoring',
    tag: 'SBAA PRO',
  },
  {
    id: 'auto',
    nameAr: 'الانتقاء الكمي التلقائي لأفضل استراتيجية',
    nameEn: 'Quant Auto-Select Strategy',
    descAr: 'محرك يختار تلقائياً وبشكل ديناميكي أقوى استراتيجية مؤهلة للسوق الحالي بدون تعارض اتجاهي',
    descEn: 'Dynamically selects the highest probability qualified strategy fitting the current market regime',
    tag: 'Quant Auto',
  },
  {
    id: 'confluence',
    nameAr: 'مصفوفة توافق الاستراتيجيات الشامل',
    nameEn: 'Strategy Confluence Matrix',
    descAr: 'تحليل إجماع متعدد الخوارزميات يجمع كافة المؤشرات والاستراتيجيات مع حماية التعارض',
    descEn: 'Multi-algorithm consensus combining quantitative strategies with conflict protection',
    tag: 'Consensus',
  },
  {
    id: 'ema_trend',
    nameAr: 'اتجاه المتوسطات المتحركة EMA 9/21/200',
    nameEn: 'EMA Trend Following',
    descAr: 'فلترة الاتجاه العام عبر EMA 200 والتداول مع تقاطعات وزخم EMA 9 و 21',
    descEn: 'Trend filter via EMA 200 with momentum crossovers and choppiness rejection',
    tag: 'Trend',
  },
  {
    id: 'macd',
    nameAr: 'مؤشر الماكد وتوسع الزخم MACD',
    nameEn: 'MACD Momentum',
    descAr: 'تقاطع خط الماكد مع خط الإشارة وتوسع أعمدة الهيستوجرام مع الاتجاه',
    descEn: 'MACD signal line cross with histogram expansion momentum',
    tag: 'Momentum',
  },
  {
    id: 'rsi_momentum',
    nameAr: 'زخم مؤشر القوة النسبية RSI',
    nameEn: 'RSI Momentum',
    descAr: 'تأكيد قوة الاتجاه واختراق مستويات الزخم 50 / 60 مع ترند قوي',
    descEn: 'RSI momentum trend continuation confirmation',
    tag: 'Momentum',
  },
  {
    id: 'rsi_reversal',
    nameAr: 'انعكاس تشبعات القوة النسبية RSI',
    nameEn: 'RSI Overbought/Oversold Reversal',
    descAr: 'اقتناص الارتداد من مناطق التشبع البيعي (<30) والشرائي (>70)',
    descEn: 'Mean reversion from extreme oversold/overbought conditions',
    tag: 'Reversal',
  },
  {
    id: 'bollinger_bounce',
    nameAr: 'ارتداد وانفجار بولينجر باند',
    nameEn: 'Bollinger Bands Mean Reversion',
    descAr: 'اقتناص الارتداد من الحواف مع كشف الانضغاط (Squeeze) وتأكيد اتجاه الشموع',
    descEn: 'Band boundary rejection with volatility squeeze detection and candle verification',
    tag: 'Volatility',
  },
  {
    id: 'support_resistance',
    nameAr: 'مناطق الدعوم والمقاومات الأفقية',
    nameEn: 'Support & Resistance Key Levels',
    descAr: 'تجميع القمم والقيعان في مناطق ارتداد رئيسية وتأكيد ملامسة المستويات',
    descEn: 'Swing clustering into high-probability zones with touch count validation',
    tag: 'Key Levels',
  },
  {
    id: 'breakout',
    nameAr: 'الاختراق السعري Donchian Breakout',
    nameEn: 'Range Breakout with ATR Momentum',
    descAr: 'اقتناص كسر القمم والقيعان مع إغلاق شمعة زخم كاملة وتأكيد ATR',
    descEn: 'Boundary breakout with candle body ratio >= 60% and ATR momentum expansion',
    tag: 'Breakout',
  },
  {
    id: 'candlestick_pattern',
    nameAr: 'نماذج الشموع اليابانية المتقدمة',
    nameEn: 'Candlestick Pattern Engine',
    descAr: 'كشف دقيق لنماذج Pin Bar, Engulfing, Morning/Evening Star, Doji',
    descEn: 'High-precision algorithmic detection of Japanese candlestick reversal formations',
    tag: 'Patterns',
  },
  {
    id: 'price_action',
    nameAr: 'سلوك السعر النقي Price Action',
    nameEn: 'Pure Price Action Action',
    descAr: 'تحليل سلوك الذيول والأجسام والتصريف والتجميع عند مستويات الدعم والمقاومة',
    descEn: 'Wick rejection, body ratio analysis, and accumulation/distribution price action',
    tag: 'Price Action',
  },
  {
    id: 'market_structure',
    nameAr: 'هيكل السوق والأموال الذكية SMC',
    nameEn: 'Market Structure & Smart Money (SMC)',
    descAr: 'كشف كسر الهيكل (BOS)، وتغير الطابع (CHoCH)، ومناطق كتل الأوامر المؤسسية (Order Blocks)',
    descEn: 'Break of Structure (BOS), Change of Character (CHoCH), Order Blocks, and FVG',
    tag: 'Institutional',
  },
  {
    id: 'adx_trend',
    nameAr: 'قوة واتجاه الترند ADX',
    nameEn: 'ADX Trend Direction',
    descAr: 'قياس قوة الترند مع تقاطع مؤشرات الاتجاه الموجب والسالب (+DI / -DI)',
    descEn: 'Quantifies trend strength when ADX > 25 with directional index alignment',
    tag: 'Trend',
  },
  {
    id: 'supertrend',
    nameAr: 'مؤشر سوبر تريند SuperTrend',
    nameEn: 'SuperTrend Trend Filter',
    descAr: 'متابعة اتجاه السعر فوق وتحت خط السوبر تريند المستند لتقلبات ATR',
    descEn: 'Dynamic ATR-based trailing trend stop confirming bullish or bearish regime',
    tag: 'Trend',
  },
  {
    id: 'stochastic',
    nameAr: 'مذبذب ستوكاستيك Stochastic 14/3/3',
    nameEn: 'Stochastic Oscillator',
    descAr: 'تقاطع خطوط %K و %D في مناطق التشبع الشرائي والبيعي',
    descEn: 'Stochastic crossover in oversold/overbought extremes with trend confluence',
    tag: 'Oscillator',
  },
  {
    id: 'cci_strategy',
    nameAr: 'مؤشر قناة السلع CCI',
    nameEn: 'Commodity Channel Index',
    descAr: 'رصد الانحرافات المعيارية واختراق مستويات +/- 100 لتحديد بداية الموجات',
    descEn: 'Statistical mean deviation tracking with +/-100 threshold triggers',
    tag: 'Momentum',
  },
  {
    id: 'parabolic_sar',
    nameAr: 'نقاط الانعكاس Parabolic SAR',
    nameEn: 'Parabolic SAR Acceleration',
    descAr: 'تحديد نقاط تحول وتسارع الاتجاه عبر تنقل نقاط SAR أعلى أو أسفل الشموع',
    descEn: 'Trailing stop-and-reverse acceleration points tracking active trends',
    tag: 'Trend',
  },
  {
    id: 'ichimoku_cloud',
    nameAr: 'سحابة إيشيموكو Ichimoku Cloud',
    nameEn: 'Ichimoku Kinko Hyo',
    descAr: 'توافق خط التحول (Tenkan) وخط الأساس (Kijun) مع موقع السعر فوق أو تحت السحابة (Kumo)',
    descEn: 'Tenkan/Kijun cross with Kumo cloud sentiment alignment',
    tag: 'Cloud',
  },
  {
    id: 'pivot_point',
    nameAr: 'نقاط الارتكاز الكلاسيكية Pivot',
    nameEn: 'Classic Floor Pivot Points',
    descAr: 'مستويات الدعم والمقاومة اليومية والمحورية (P, R1, R2, S1, S2)',
    descEn: 'Daily mathematical equilibrium and institutional bounce zones',
    tag: 'Levels',
  },
  {
    id: 'fibonacci',
    nameAr: 'تصحيحات فيبوناتشي الذهبية 61.8%',
    nameEn: 'Fibonacci Golden Ratio',
    descAr: 'اقتناص الارتداد من النسبة الذهبية 61.8% و 50% بعد الموجات الدافعة',
    descEn: 'High-probability golden pocket (50% - 61.8%) pullback entries',
    tag: 'Fibonacci',
  },
  {
    id: 'atr_volatility',
    nameAr: 'توسع النطاق وتقلبات ATR',
    nameEn: 'ATR Volatility Expansion',
    descAr: 'رصد انفجارات السيولة وتوسع المدى السعري الحقيقي فوق المتوسط',
    descEn: 'Explosive volatility breakouts confirming strong directional thrust',
    tag: 'Volatility',
  },
  {
    id: 'volume_flow',
    nameAr: 'تدفق الأحجام والسيولة Volume',
    nameEn: 'Volume Flow Analysis',
    descAr: 'تأكيد حركة السعر بواسطة صعود أو هبوط حجم التداول الفعلي',
    descEn: 'Tick volume impulse confirming true institutional participation',
    tag: 'Volume',
  },
  {
    id: 'darvas_box',
    nameAr: 'اختراق صناديق دارفاس Darvas Box',
    nameEn: 'Darvas Box Breakout',
    descAr: 'تحديد قنوات التجميع المغلقة والدخول عند اختراق سقف أو أرضية الصندوق',
    descEn: 'Box boundary breakout catching fresh continuation runs',
    tag: 'Breakout',
  },
  {
    id: 'elliott_wave',
    nameAr: 'موجات إليوت السعرية Elliott Wave',
    nameEn: 'Elliott Wave Count',
    descAr: 'التعرف على الموجات الدافعة 1-2-3-4-5 والموجات التصحيحية A-B-C',
    descEn: 'Fractal wave count recognizing structural impulsive expansions',
    tag: 'Waves',
  },
  {
    id: 'gann_price_time',
    nameAr: 'هندسة جان للسعر والزمن Gann',
    nameEn: 'Gann Angles & Time Geometry',
    descAr: 'زوايا جان الهندسية 1x1 و 2x1 وتوافق دورات الزمن مع مستويات السعر',
    descEn: 'Gann square and angle geometry finding hidden harmonious turning points',
    tag: 'Geometry',
  },
  {
    id: 'multi_confluence',
    nameAr: 'التوافق المتعدد للمؤشرات المركبة',
    nameEn: 'Multi-Confluence Engine',
    descAr: 'توليفة رياضية مركبة تفحص اتجاه ومومنتوم وتذبذب 7 مؤشرات في آن واحد',
    descEn: 'Multi-indicator scoring matrix requiring multi-layer agreement',
    tag: 'Composite',
  },
  {
    id: 'sma_crossover',
    nameAr: 'التقاطع الذهبي للمتوسطات SMA',
    nameEn: 'SMA Golden & Death Cross',
    descAr: 'تقاطع المتوسط البسيط 20 مع 50 للاتجاه متوسط المدى',
    descEn: 'Classic SMA 20 / 50 trend confirmation',
    tag: 'Trend',
  },
  {
    id: 'ma_alignment',
    nameAr: 'اصطفاف المتوسطات المتحركة MA',
    nameEn: 'Moving Average Alignment',
    descAr: 'اصطفاف متتالي لمتوسطات 10 > 20 > 50 > 200 لتأكيد أقوى اتجاه صاعد أو هابط',
    descEn: 'Sequential MA stacking confirming strongest directional momentum',
    tag: 'Trend',
  },
];

export const BOT_TIMEFRAMES = [
  { label: '1M', labelAr: '1 دقيقة', tf: 60, desc: '60s' },
  { label: '2M', labelAr: '2 دقيقة', tf: 120, desc: '120s' },
  { label: '3M', labelAr: '3 دقائق', tf: 180, desc: '180s' },
  { label: '5M', labelAr: '5 دقائق', tf: 300, desc: '300s' },
  { label: '15M', labelAr: '15 دقيقة', tf: 900, desc: '900s' },
  { label: '30M', labelAr: '30 دقيقة', tf: 1800, desc: '1800s' },
  { label: '1H', labelAr: '1 ساعة', tf: 3600, desc: '3600s' },
];

interface AutoTraderViewProps {
  currentAsset: string;
  currentTimeframe: number;
  accountBalance: number | null;
  isDemoAccount?: boolean;
}

export const AutoTraderView: React.FC<AutoTraderViewProps> = ({
  currentAsset,
  currentTimeframe,
  accountBalance,
}) => {
  const { isRTL } = useLanguage();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'lab' | 'logs'>('dashboard');
  const [status, setStatus] = useState<AutoTraderStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Form Controls
  const [selectedStrategy, setSelectedStrategy] = useState<string>('sbaa');
  const [botTimeframe, setBotTimeframe] = useState<number>(currentTimeframe || 60);
  const [baseAmount, setBaseAmount] = useState<number>(5);
  const [stopLoss, setStopLoss] = useState<number>(20);
  const [takeProfit, setTakeProfit] = useState<number>(40);
  const [enableMartingale, setEnableMartingale] = useState<boolean>(false);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState<number>(2.0);
  const [displayTimezone, setDisplayTimezone] = useState<string>('UTC+3');
  const browserLoc = getBrowserLocationSummary();

  // Test Connection Modal
  const [showConnModal, setShowConnModal] = useState<boolean>(false);
  const [connTestResult, setConnTestResult] = useState<any>(null);
  const [testingConn, setTestingConn] = useState<boolean>(false);

  // Backtest Controls
  const [backtestStake, setBacktestStake] = useState<number>(10);
  const [backtestPayout, setBacktestPayout] = useState<number>(88);
  const [backtestLoading, setBacktestLoading] = useState<boolean>(false);
  const [backtestReport, setBacktestReport] = useState<BacktestReport | null>(null);

  // Detailed Trade Inspection Modal
  const [selectedTradeDetail, setSelectedTradeDetail] = useState<DetailedTradeRecord | null>(null);
  const [clearingTrades, setClearingTrades] = useState<boolean>(false);
  const [confirmClearTrades, setConfirmClearTrades] = useState<boolean>(false);
  const [clearingLogs, setClearingLogs] = useState<boolean>(false);
  const [confirmClearLogs, setConfirmClearLogs] = useState<boolean>(false);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 5000);
  };

  const hasInitializedFromServer = useRef<boolean>(false);

  const fetchStatus = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const res = await authFetch('/api/autotrader/status');
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setStatus(data);
          if (data.config) {
            if (!hasInitializedFromServer.current) {
              hasInitializedFromServer.current = true;
              if (data.config.strategyId) {
                setSelectedStrategy(data.config.strategyId === 'sbaa_ai' ? 'sbaa' : data.config.strategyId);
              }
              if (data.config.timeframe) {
                setBotTimeframe(data.config.timeframe);
              }
              if (data.config.baseAmount) {
                setBaseAmount(data.config.baseAmount);
              }
              if (data.config.stopLoss) {
                setStopLoss(data.config.stopLoss);
              }
              if (data.config.takeProfit) {
                setTakeProfit(data.config.takeProfit);
              }
              if (data.config.displayTimezone) {
                setDisplayTimezone(normalizeTimezoneValue(data.config.displayTimezone));
              }
            }
            if (data.config.enableMartingale !== undefined) {
              setEnableMartingale(data.config.enableMartingale);
            }
            if (data.config.martingaleMultiplier) {
              setMartingaleMultiplier(data.config.martingaleMultiplier);
            }
          }
        }
      }
    } catch {
      // Gracefully handle transient network drop/reload
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  const lastSyncedTf = useRef<number | null>(null);
  const lastSyncedAsset = useRef<string | null>(null);

  // Automatically sync timeframe & asset changes from chart/header with autotrader (guarded by useRef)
  useEffect(() => {
    if (currentTimeframe && !status?.isRunning) {
      setBotTimeframe(currentTimeframe);
    }
    if (
      currentTimeframe &&
      (lastSyncedTf.current !== currentTimeframe || lastSyncedAsset.current !== currentAsset)
    ) {
      lastSyncedTf.current = currentTimeframe;
      lastSyncedAsset.current = currentAsset;
      authFetch('/api/autotrader/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframe: currentTimeframe,
          asset: currentAsset,
        }),
      }).catch(() => {});
    }
  }, [currentTimeframe, currentAsset]);

  const handleSelectBotTimeframe = async (tf: number) => {
    setBotTimeframe(tf);
    try {
      await Promise.all([
        authFetch('/api/timeframe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeframe: tf }),
        }),
        authFetch('/api/autotrader/save-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeframe: tf,
            asset: currentAsset,
          }),
        }),
      ]);
    } catch {
      // Gracefully handle network drop
    }
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      const payload: Record<string, any> = {
        strategyId: selectedStrategy,
        baseAmount,
        maxAmount: 1000.0,
        stopLoss,
        takeProfit,
        asset: currentAsset,
        timeframe: botTimeframe || currentTimeframe || 60,
        isDemo: false,
        enableMartingale,
        martingaleMultiplier,
        displayTimezone,
      };

      const res = await authFetch('/api/autotrader/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        showToast('error', data.message || (isRTL ? 'فشل تشغيل البوت' : 'Failed to start bot'));
      } else {
        if (data.status) {
          setStatus(data.status);
        }
        showToast('success', isRTL ? 'تم بدء تشغيل البوت الآلي بنجاح!' : 'Auto-trader started successfully!');
      }
    } catch (err: any) {
      showToast('error', err?.message || (isRTL ? 'خطأ في الاتصال بالخادم' : 'Server connection error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      const res = await authFetch('/api/autotrader/stop', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      showToast('info', isRTL ? 'تم إيقاف البوت الآلي' : 'Auto-trader stopped');
    } catch (err: any) {
      showToast('error', err?.message || (isRTL ? 'خطأ في إيقاف البوت' : 'Error stopping bot'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmergencyStop = async () => {
    setActionLoading(true);
    try {
      const res = await authFetch('/api/autotrader/emergency-stop', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      showToast('error', isRTL ? 'تم تفعيل الإيقاف الطارئ! حظر كافة الأوامر فوراً.' : 'Emergency stop triggered! Orders halted.');
    } catch (err: any) {
      showToast('error', err?.message || 'Emergency stop error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearEmergency = async () => {
    setActionLoading(true);
    try {
      const res = await authFetch('/api/autotrader/clear-emergency', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      showToast('success', isRTL ? 'تم إلغاء حالة الإيقاف الطارئ بنجاح' : 'Emergency stop state cleared');
    } catch (err: any) {
      showToast('error', err?.message || 'Error clearing emergency');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setShowConnModal(true);
    try {
      const res = await authFetch('/api/autotrader/test-connection', { method: 'POST' });
      const data = await res.json();
      setConnTestResult(data);
    } catch (err: any) {
      setConnTestResult({ ok: false, message: err?.message || 'Connection test failed' });
    } finally {
      setTestingConn(false);
    }
  };

  const handleSaveSettings = async () => {
    setActionLoading(true);
    try {
      const res = await authFetch('/api/autotrader/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: selectedStrategy,
          baseAmount,
          maxAmount: 1000.0,
          stopLoss,
          takeProfit,
          asset: currentAsset,
          timeframe: botTimeframe || currentTimeframe || 60,
          isDemo: false,
          enableMartingale,
          martingaleMultiplier,
          displayTimezone,
        }),
      });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      showToast('success', isRTL ? 'تم حفظ إعدادات البوت بنجاح' : 'Settings saved successfully');
    } catch (err: any) {
      showToast('error', err?.message || 'Error saving settings');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPnL = async () => {
    try {
      const res = await authFetch('/api/autotrader/reset-pnl', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      showToast('info', isRTL ? 'تم تصفير إحصاءات اليوم وقاطع الدائرة' : 'Daily stats and circuit breaker reset');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleClearTrades = async () => {
    setClearingTrades(true);
    try {
      const res = await authFetch('/api/autotrader/clear-trades', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      setConfirmClearTrades(false);
      showToast(
        'info',
        data.message || (isRTL ? 'تم مسح قائمة الصفقات بنجاح' : 'Order list cleared successfully')
      );
    } catch (err: any) {
      showToast('error', err?.message || (isRTL ? 'تعذر مسح قائمة الصفقات' : 'Failed to clear order list'));
    } finally {
      setClearingTrades(false);
    }
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      const res = await authFetch('/api/autotrader/clear-logs', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      setConfirmClearLogs(false);
      showToast('info', data.message || (isRTL ? 'تم مسح سجل العمليات بنجاح' : 'Audit logs cleared'));
    } catch (err: any) {
      showToast('error', err?.message || (isRTL ? 'تعذر مسح السجل' : 'Failed to clear logs'));
    } finally {
      setClearingLogs(false);
    }
  };

  const handleRunBacktest = async (strategyId?: string) => {
    setBacktestLoading(true);
    try {
      const targetStrat = strategyId || selectedStrategy;
      const res = await authFetch('/api/autotrader/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: targetStrat,
          asset: currentAsset,
          timeframe: botTimeframe || currentTimeframe || 60,
          stake: backtestStake,
          payoutRatio: backtestPayout / 100,
        }),
      });
      const data = await res.json();
      if (data.success && data.report) {
        setBacktestReport(data.report);
        showToast('success', isRTL ? 'اكتمل الاختبار التاريخي بنجاح!' : 'Backtest completed successfully!');
      } else {
        showToast('error', data.error || (isRTL ? 'فشل تنفيذ الاختبار التاريخي' : 'Backtest execution failed'));
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Backtest error');
    } finally {
      setBacktestLoading(false);
    }
  };

  const isRunning = status?.isRunning ?? false;
  const isEmergency = status?.isEmergencyStopped ?? false;
  const isBreakerTripped = status?.circuitBreakerTripped ?? false;
  const inRest = status?.isInRestBreak ?? false;
  const brokerConnected = status?.brokerStatus?.isConnected ?? false;

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-slate-100">
      {/* 1. Architectural Command Deck & Bespoke Engine Core */}
      <div
        className={`rounded-2xl overflow-hidden transition-colors ${
          isEmergency
            ? 'sabaa-panel-crimson'
            : isRunning
            ? 'sabaa-panel-emerald'
            : 'sabaa-panel-gold'
        }`}
      >
        <div className="p-5 sm:p-6 flex flex-col justify-between gap-5">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                  isEmergency
                    ? 'bg-rose-500/15 border-rose-500/45 text-rose-400'
                    : isRunning
                    ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-400'
                    : 'bg-amber-500/15 border-amber-400/35 text-amber-300'
                }`}
              >
                <Cpu className="w-6 h-6" />
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-amber-300/90">
                  <span>{isRTL ? 'محرك التنفيذ الكمي' : 'Quant Execution Engine'}</span>
                  <span aria-hidden="true" className="text-white/25">·</span>
                  <span className="text-emerald-400 font-semibold">REAL LIVE</span>
                  {isEmergency && (
                    <>
                      <span aria-hidden="true" className="text-white/25">·</span>
                      <span className="text-rose-400 font-bold">EMERGENCY HALTED</span>
                    </>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-black tracking-tight sabaa-wordmark">
                  {isRTL ? 'بوت التداول الآلي الخوارزمي (Quant Auto-Trader)' : 'Quantitative Auto-Trader'}
                </h2>

                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl">
                  {isRTL
                    ? 'نظام تداول آلي حقيقي متصل بمنصة Pocket Option مع حماية التعارض، إدارة المخاطر الدقيقة، ومحاكاة السلوك البشري.'
                    : 'Autonomous real-account execution engine wired to Pocket Option with conflict guards, capital protection, and human-paced timing.'}
                </p>
              </div>
            </div>

            {/* Tactile Action Deck */}
            <div className="flex flex-wrap items-center gap-2.5">
              {isRunning ? (
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl sabaa-btn-gold text-xs whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>{isRTL ? 'إيقاف البوت' : 'Stop Bot'}</span>
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl sabaa-btn-emerald text-xs whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isRTL ? 'تشغيل البوت' : 'Start Bot'}</span>
                </button>
              )}

              {isBreakerTripped && !isRunning && (
                <button
                  type="button"
                  onClick={handleResetPnL}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sabaa-btn-gold text-xs whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isRTL ? 'فك القاطع وتصفير اليوم' : 'Unlock & Reset'}</span>
                </button>
              )}

              {isEmergency ? (
                <button
                  onClick={handleClearEmergency}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sabaa-btn-surface text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{isRTL ? 'إلغاء الإيقاف الطارئ' : 'Clear Emergency'}</span>
                </button>
              ) : (
                <button
                  onClick={handleEmergencyStop}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sabaa-btn-crimson text-xs whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{isRTL ? 'إيقاف طارئ' : 'Emergency Stop'}</span>
                </button>
              )}

              <button
                onClick={handleTestConnection}
                disabled={actionLoading || testingConn}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sabaa-btn-surface text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Wifi className="w-4 h-4 text-amber-300" />
                <span>{isRTL ? 'اختبار الاتصال' : 'Test Connection'}</span>
              </button>

              <button
                onClick={handleSaveSettings}
                disabled={actionLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sabaa-btn-surface text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                title={isRTL ? 'حفظ إعدادات البوت' : 'Save Bot Settings'}
              >
                <Save className="w-4 h-4 text-emerald-400" />
                <span>{isRTL ? 'حفظ الإعدادات' : 'Save'}</span>
              </button>

              <button
                onClick={handleResetPnL}
                title={isRTL ? 'تصفير إحصاءات اليوم' : 'Reset Daily Stats'}
                className="p-2.5 rounded-xl sabaa-btn-surface text-slate-300 hover:text-amber-300 shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Live Bot Telemetry Strip */}
            <div className="p-3 rounded-xl sabaa-well flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-slate-400 text-[11px] font-semibold">
                  {isRTL ? 'حالة البوت:' : 'Status:'}
                </span>

                {isEmergency ? (
                  <span className="inline-flex items-center gap-1.5 text-rose-400 font-bold">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{isRTL ? 'إيقاف طارئ نشط' : 'Emergency Stop Active'}</span>
                  </span>
                ) : isBreakerTripped ? (
                  <span className="inline-flex items-center gap-1.5 text-rose-400 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{isRTL ? 'قاطع الدائرة مفعل' : 'Circuit Breaker Active'}</span>
                  </span>
                ) : inRest ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-300 font-bold tabular-nums">
                    <Coffee className="w-3.5 h-3.5" />
                    <span>{isRTL ? `استراحة شاي (${status?.restRemainingSec}s)` : `Fatigue Break (${status?.restRemainingSec}s)`}</span>
                  </span>
                ) : isRunning ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>{isRTL ? 'نشط يراقب الإشارات' : 'Active & Scanning'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-slate-300 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <span>{isRTL ? 'في وضع الاستعداد' : 'Standby'}</span>
                  </span>
                )}

                <span aria-hidden="true" className="text-white/20">·</span>

                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    brokerConnected ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {brokerConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                  <span>{brokerConnected ? (isRTL ? 'الوسيط متصل' : 'Broker Connected') : (isRTL ? 'الوسيط غير متصل' : 'Broker Offline')}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400 font-mono tabular-nums">
                <span>
                  {isRTL ? 'الزوج:' : 'Asset:'}{' '}
                  <strong className="text-slate-100">{currentAsset}</strong>
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span>
                  {isRTL ? 'الفريم:' : 'TF:'}{' '}
                  <strong className="text-amber-300 font-bold">
                    {BOT_TIMEFRAMES.find((t) => t.tf === (botTimeframe || currentTimeframe))?.label || `${botTimeframe || currentTimeframe}s`} ({botTimeframe || currentTimeframe}s)
                  </strong>
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span>
                  {isRTL ? 'المقبولة:' : 'Accepted:'}{' '}
                  <strong className="text-emerald-400">{status?.acceptedTradesCount ?? 0}</strong>
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span>
                  {isRTL ? 'المرفوضة:' : 'Rejected:'}{' '}
                  <strong className="text-rose-400">{status?.rejectedTradesCount ?? 0}</strong>
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span>
                  {isRTL ? 'المبلغ:' : 'Stake:'}{' '}
                  <strong className="text-amber-300">${baseAmount.toFixed(2)}</strong>
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span>
                  PnL:{' '}
                  <strong className={(status?.dailyPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {(status?.dailyPnL ?? 0) >= 0 ? '+' : ''}${status?.dailyPnL?.toFixed(2) ?? '0.00'}
                  </strong>
                </span>
              </div>
            </div>

            {isBreakerTripped && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    <strong>{isRTL ? 'قاطع الدائرة مفعل:' : 'Circuit Breaker Active:'}</strong>{' '}
                    {status?.circuitBreakerReason || (isRTL ? 'تم بلوغ الحد اليومي للربح أو الخسارة.' : 'Daily risk limit reached.')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleResetPnL}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg sabaa-btn-gold text-[11px] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'تصفير وفك القاطع الآن' : 'Reset & Unlock Now'}</span>
                </button>
              </div>
            )}
        </div>
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
            toastMsg.type === 'success'
              ? 'sabaa-panel-emerald text-emerald-300'
              : toastMsg.type === 'error'
              ? 'sabaa-panel-crimson text-rose-300'
              : 'sabaa-panel-gold text-amber-200'
          }`}
        >
          {toastMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
          {toastMsg.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
          {toastMsg.type === 'info' && <Radio className="w-4 h-4 shrink-0 text-amber-300" />}
          <span className="font-semibold">{toastMsg.text}</span>
        </div>
      )}

      {/* Segmented Sub-Navigation Tabs */}
      <div className="p-1.5 rounded-2xl sabaa-well inline-flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTab === 'dashboard'
              ? 'sabaa-btn-gold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>{isRTL ? 'لوحة المراقبة والتحكم' : 'Live Dashboard'}</span>
        </button>

        <button
          onClick={() => setActiveTab('lab')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTab === 'lab'
              ? 'sabaa-btn-gold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{isRTL ? 'مختبر الاستراتيجيات والاختبار التاريخي' : 'Strategy Lab & Backtest'}</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTab === 'logs'
              ? 'sabaa-btn-gold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isRTL ? 'سجل العمليات والتدقيق' : 'Audit Logs'}</span>
        </button>
      </div>

      {/* ==================== TAB 1: LIVE DASHBOARD ==================== */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (5 Cols): Settings & Risk Guard Parameters */}
          <div className="lg:col-span-5 space-y-5">
            <div className="p-5 sm:p-6 rounded-2xl sabaa-panel space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">
                      {isRTL ? 'إعدادات الاستراتيجية وإدارة المخاطر' : 'Strategy & Risk Configuration'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {isRTL ? 'ضبط معايير الدخول وحماية رأس المال' : 'Entry precision & capital circuit guard'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-3 py-1.5 rounded-lg sabaa-btn-surface text-[11px] font-bold text-amber-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'حفظ' : 'Save'}</span>
                </button>
              </div>

              {/* Strategy Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>{isRTL ? 'الاستراتيجية المعتمدة' : 'Active Strategy'}</span>
                  <span className="text-[10px] text-amber-300 font-mono">Real Signal Engine</span>
                </label>
                <select
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3.5 py-2.5 rounded-xl sabaa-input text-xs font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {STRATEGIES_LIST.map((strat) => (
                    <option key={strat.id} value={strat.id}>
                      {isRTL ? strat.nameAr : strat.nameEn}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {STRATEGIES_LIST.find((s) => s.id === selectedStrategy)?.[isRTL ? 'descAr' : 'descEn']}
                </p>
              </div>

              <div className="sabaa-divider" />

              {/* Bot Execution Timeframe Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isRTL ? 'فريم ومدة دخول الصفقة للبوت' : 'Bot Execution Timeframe'}</span>
                  </label>
                  <span className="text-[10px] text-amber-300 font-mono font-bold tabular-nums">
                    {(() => {
                      const found = BOT_TIMEFRAMES.find((t) => t.tf === botTimeframe);
                      if (!found) return `${botTimeframe}s`;
                      return isRTL ? `${found.labelAr} (${found.desc} فعلية)` : `${found.label} (${found.desc} exact)`;
                    })()}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 sabaa-well p-1.5 rounded-xl">
                  {BOT_TIMEFRAMES.map((item) => {
                    const isSelected = botTimeframe === item.tf;
                    return (
                      <button
                        key={item.tf}
                        type="button"
                        onClick={() => handleSelectBotTimeframe(item.tf)}
                        disabled={isRunning}
                        className={`py-2 px-1 rounded-lg text-xs font-mono font-bold transition-all text-center flex flex-col items-center justify-center cursor-pointer disabled:opacity-50 ${
                          isSelected
                            ? 'sabaa-btn-gold'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'
                        }`}
                        title={`${item.desc} (${isRTL ? item.labelAr : item.label})`}
                      >
                        <span className="text-[11px] leading-tight">{item.label}</span>
                        <span className={`text-[9px] tabular-nums ${isSelected ? 'text-[#04060A]/80 font-extrabold' : 'text-slate-500'}`}>
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-amber-300/85 leading-relaxed">
                  {isRTL
                    ? 'مدة الصفقة المرسلة للمنصة وفريم الشموع مثبتان بالثواني الفعلية (5M = 300s، 1H = 3600s) دون أي رجوع لفريم آخر.'
                    : 'Real broker execution duration and candles are locked to exact seconds (5M = 300s, 1H = 3600s) with zero fallback.'}
                </p>
              </div>

              <div className="sabaa-divider" />

              {/* Exact Trade Stake ($1.00 - $1,000.00) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isRTL ? 'مبلغ الصفقة المحدد ($)' : 'Exact Trade Stake ($)'}</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono tabular-nums">
                    {isRTL ? '$1.00 - $1,000.00 (دعم السنتات)' : '$1.00 - $1,000.00 (Cents)'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-300 text-xs font-mono font-bold">$</span>
                    <input
                      type="number"
                      min="1.00"
                      max="1000.00"
                      step="0.01"
                      value={baseAmount}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          const clamped = Math.min(1000.00, Math.max(1.00, val));
                          setBaseAmount(Number(clamped.toFixed(2)));
                        } else {
                          setBaseAmount(1.00);
                        }
                      }}
                      disabled={isRunning}
                      className={`w-full pl-8 pr-3 py-2.5 rounded-xl sabaa-input text-xs font-mono font-bold tabular-nums disabled:opacity-60 ${
                        baseAmount > 1000.00 || baseAmount < 1.00 ? 'border-rose-500 text-rose-300' : ''
                      }`}
                      placeholder="1.00 - 1000.00"
                    />
                  </div>

                  <select
                    value={baseAmount}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      if (!isNaN(num) && num >= 1.00 && num <= 1000.00) {
                        setBaseAmount(Number(num.toFixed(2)));
                      }
                    }}
                    disabled={isRunning}
                    className="px-3 py-2.5 rounded-xl sabaa-input text-xs font-mono font-semibold tabular-nums disabled:opacity-60 cursor-pointer"
                    title={isRTL ? 'اختر مبلغاً قياسياً من 1$ إلى 1,000$' : 'Select standard amount $1 - $1,000'}
                  >
                    {![1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000].includes(baseAmount) && (
                      <option value={baseAmount}>
                        {isRTL ? `مخصص: $${baseAmount.toFixed(2)}` : `Custom: $${baseAmount.toFixed(2)}`}
                      </option>
                    )}
                    {[1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000].map((val) => (
                      <option key={val} value={val}>
                        ${val}.00
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preset Buttons: Cents & Tier Stakes */}
                <div className="space-y-2 pt-1">
                  <div className="text-[10px] text-slate-400 font-medium">
                    {isRTL ? 'مبالغ سريعة بالسنتات:' : 'Exact Cents Presets:'}
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[1.00, 5.25, 10.50, 15.75, 20.40, 25.00].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        disabled={isRunning}
                        onClick={() => setBaseAmount(amt)}
                        className={`py-1.5 px-1 rounded-lg text-[10px] font-mono font-bold tabular-nums cursor-pointer transition-all text-center ${
                          baseAmount === amt
                            ? 'sabaa-btn-emerald'
                            : 'sabaa-btn-surface text-slate-300'
                        }`}
                      >
                        ${amt.toFixed(2)}
                      </button>
                    ))}
                  </div>

                  <div className="text-[10px] text-slate-400 font-medium pt-1">
                    {isRTL ? 'مبالغ المستويات ($25 - $1,000):' : 'Tier Stakes ($25 - $1,000):'}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[25, 50, 75, 100, 150, 200, 250, 500, 750, 1000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        disabled={isRunning}
                        onClick={() => setBaseAmount(amt)}
                        className={`py-1.5 px-1.5 rounded-lg text-[10px] font-mono font-bold tabular-nums cursor-pointer transition-all text-center ${
                          baseAmount === amt
                            ? 'sabaa-btn-gold'
                            : 'sabaa-btn-surface text-slate-300'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {baseAmount > 1000.00 && (
                  <p className="text-[10px] text-rose-400 font-medium">
                    {isRTL ? 'تم تجاوز الحد الأقصى المسموح به (1,000.00$). تم ضبط المبلغ.' : 'Maximum stake limit exceeded ($1,000.00 max). Adjusted.'}
                  </p>
                )}
              </div>

              {/* Stop-Loss & Take-Profit */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl sabaa-well border-rose-500/20 space-y-1.5">
                  <label className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>{isRTL ? 'حد الخسارة ($)' : 'Stop-Loss ($)'}</span>
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="5000"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(Math.max(5, Number(e.target.value)))}
                    disabled={isRunning}
                    className="w-full px-3 py-2 rounded-lg sabaa-input border-rose-500/30 text-rose-300 text-xs font-mono font-bold tabular-nums disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-500 block leading-tight">
                    {isRTL ? 'قاطع الدائرة يوقف البوت عند بلوغها' : 'Halts bot on hitting threshold'}
                  </span>
                </div>

                <div className="p-3 rounded-xl sabaa-well border-emerald-500/20 space-y-1.5">
                  <label className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{isRTL ? 'هدف الربح ($)' : 'Take-Profit ($)'}</span>
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="5000"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(Math.max(5, Number(e.target.value)))}
                    disabled={isRunning}
                    className="w-full px-3 py-2 rounded-lg sabaa-input border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold tabular-nums disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-500 block leading-tight">
                    {isRTL ? 'تأمين الأرباح وإيقاف الصفقات' : 'Locks profit and halts trading'}
                  </span>
                </div>
              </div>

              {/* Martingale Multiplier Option */}
              <div className="p-3.5 rounded-xl sabaa-well space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 cursor-pointer">
                    {isRTL ? 'مضاعفة المارتنجيل (Martingale Recovery)' : 'Martingale Multiplier'}
                  </label>
                  <input
                    type="checkbox"
                    checked={enableMartingale}
                    onChange={(e) => setEnableMartingale(e.target.checked)}
                    disabled={isRunning}
                    className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                  />
                </div>
                {enableMartingale && (
                  <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                    <span className="text-[11px] text-slate-400">{isRTL ? 'معامل المضاعفة:' : 'Multiplier:'}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="1.5"
                      max="3.0"
                      value={martingaleMultiplier}
                      onChange={(e) => setMartingaleMultiplier(Number(e.target.value))}
                      disabled={isRunning}
                      className="w-20 px-2.5 py-1 rounded-lg sabaa-input text-xs font-mono font-bold text-amber-300 tabular-nums"
                    />
                    <span className="text-[10px] text-amber-300/90">
                      {isRTL ? '(أقصى عمق 3 مضاعفات)' : '(Max depth: 3)'}
                    </span>
                  </div>
                )}
              </div>

              {/* Timezone Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    <span>{isRTL ? 'توقيت الصفقات ورسائل التلجرام' : 'Trades & Telegram Timezone'}</span>
                  </label>
                  <span className="text-[10px] font-mono text-amber-300 font-bold tabular-nums" dir="ltr">
                    {displayTimezone}
                  </span>
                </div>
                <select
                  value={displayTimezone}
                  onChange={(e) => {
                    const nextTz = e.target.value;
                    setDisplayTimezone(nextTz);
                    authFetch('/api/autotrader/save-settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ displayTimezone: nextTz }),
                    }).catch(() => {});
                  }}
                  disabled={isRunning}
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl sabaa-input text-xs font-mono font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div
                  dir="ltr"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl sabaa-well text-slate-300 text-[11px] font-mono"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span className="truncate">
                    Your location: {browserLoc.timeZone} {browserLoc.offsetLabel}
                  </span>
                </div>
              </div>

              {/* Account Mode (Real Live Locked) */}
              <div className="p-3.5 rounded-xl sabaa-panel-emerald flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-100 block">
                    {isRTL ? 'وضع الحساب المستهدف' : 'Target Account Mode'}
                  </span>
                  <span className="text-[10px] text-emerald-400">
                    {isRTL ? 'حساب حقيقي فقط (تنفيذ فعلي 100%)' : 'Real Live Account Only (100% Real Execution)'}
                  </span>
                </div>
                <span className="px-3 py-1.5 rounded-lg text-xs font-mono font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 whitespace-nowrap shrink-0">
                  REAL LIVE
                </span>
              </div>

              {/* Stop-Loss Disclosure Note */}
              <div className="p-3.5 rounded-xl sabaa-well text-[10px] text-slate-400 space-y-1">
                <span className="font-bold text-amber-300 block">
                  {isRTL ? 'توضيح هام حول وقف الخسارة في الخيارات الرقمية:' : 'Critical Stop-Loss Disclosure:'}
                </span>
                <p className="leading-relaxed">
                  {isRTL
                    ? 'تنتهي صفقات الخيارات الثنائية في Pocket Option عند مدد ثابتة (30s، 60s، إلخ). لا يدعم وسيط الخيارات أمر وقف خسارة سعري أثناء سريان الصفقة؛ وإنما "وقف الخسارة" هنا هو حد حماية داخلي صارم يقوم قاطع الدائرة بتفعيله لإيقاف البوت عند بلوغ إجمالي الخسائر اليومية المبلغ المحدد لحماية رأس المال.'
                    : 'Pocket Option binary contracts expire at fixed durations. The broker API does not provide intra-trade price stop-loss orders. Instead, our Stop-Loss acts as an internal risk-guard circuit breaker that automatically halts all bot operations once daily losses reach this threshold.'}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column (7 Cols): KPI Strip, Live Order Lifecycle & Stealth Layers */}
          <div className="lg:col-span-7 space-y-5">
            {/* 4-Card KPI Telemetry Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div
                className={`p-4 rounded-2xl space-y-1.5 ${
                  (status?.dailyPnL ?? 0) >= 0 ? 'sabaa-panel-emerald' : 'sabaa-panel-crimson'
                }`}
              >
                <span className="text-[11px] text-slate-400 block font-semibold">
                  {isRTL ? 'صافي أرباح اليوم' : 'Daily Net PnL'}
                </span>
                <span
                  className={`text-xl font-black font-mono tabular-nums block ${
                    (status?.dailyPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {(status?.dailyPnL ?? 0) >= 0 ? '+' : ''}${status?.dailyPnL?.toFixed(2) ?? '0.00'}
                </span>
              </div>

              <div className="p-4 rounded-2xl sabaa-panel-gold space-y-1.5">
                <span className="text-[11px] text-slate-400 block font-semibold">
                  {isRTL ? 'نسبة الفوز' : 'Win Rate'}
                </span>
                <span className="text-xl font-black font-mono tabular-nums text-amber-300 block">
                  {status?.winRate ?? 0}%
                </span>
              </div>

              <div className="p-4 rounded-2xl sabaa-kpi-card space-y-1.5">
                <span className="text-[11px] text-slate-400 block font-semibold">
                  {isRTL ? 'رابحة / خاسرة / تعادل' : 'Wins / Losses / Draws'}
                </span>
                <span className="text-sm font-black font-mono tabular-nums text-slate-200 flex items-center gap-1 pt-1">
                  <span className="text-emerald-400" title={isRTL ? 'صفقات رابحة' : 'Won'}>
                    {status?.winningTrades ?? 0}W
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-rose-400" title={isRTL ? 'صفقات خاسرة' : 'Lost'}>
                    {status?.losingTrades ?? 0}L
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-400" title={isRTL ? 'تعادل (DRAW)' : 'Draw'}>
                    {status?.drawTrades ?? 0}D
                  </span>
                </span>
              </div>

              <div className="p-4 rounded-2xl sabaa-kpi-card space-y-1.5">
                <span className="text-[11px] text-slate-400 block font-semibold">
                  {isRTL ? 'استراحة الإجهاد' : 'Fatigue Break'}
                </span>
                <span className="text-lg font-black font-mono tabular-nums text-amber-300 block">
                  {status?.consecutiveTradesCount ?? 0} / {status?.tradesBeforeRest ?? 10}
                </span>
              </div>
            </div>

            {/* Live Order Lifecycle & Trades Table */}
            <div className="rounded-2xl sabaa-panel overflow-hidden">
              <div className="p-4 sm:px-5 border-b border-white/[0.08] bg-[#060A12] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-100">
                    {isRTL ? 'تدفق الأوامر والصفقات المنفذة (Order Lifecycle)' : 'Real Order Lifecycle & Trades'}
                  </h4>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {status?.recentTrades?.length || 0} {isRTL ? 'صفقة' : 'orders'}
                  </span>
                  {confirmClearTrades ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleClearTrades}
                        disabled={clearingTrades}
                        className="px-3 py-1.5 rounded-lg sabaa-btn-crimson text-[10px] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {clearingTrades
                          ? isRTL ? 'جاري المسح...' : 'Clearing...'
                          : isRTL ? 'تأكيد المسح' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearTrades(false)}
                        disabled={clearingTrades}
                        className="px-2.5 py-1.5 rounded-lg sabaa-btn-surface text-[10px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isRTL ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearTrades(true)}
                      disabled={!status?.recentTrades || status.recentTrades.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg sabaa-btn-surface hover:border-rose-500/40 text-rose-300 text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isRTL ? 'مسح قائمة الصفقات' : 'Clear trades list'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isRTL ? 'مسح' : 'Clear'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto bg-[#04060A]">
                <table className={`w-full text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
                  <thead className="bg-[#05080F] border-b border-white/[0.08]">
                    <tr className="text-slate-400 text-[10px] font-mono uppercase tracking-wider">
                      <th className="py-3 px-4">{isRTL ? 'التوقيت' : 'Time'}</th>
                      <th className="py-3 px-3">{isRTL ? 'الأصل' : 'Asset'}</th>
                      <th className="py-3 px-3">{isRTL ? 'النوع' : 'Action'}</th>
                      <th className="py-3 px-3">{isRTL ? 'المبلغ' : 'Stake'}</th>
                      <th className="py-3 px-3">{isRTL ? 'دورة الأمر' : 'Lifecycle'}</th>
                      <th className={`py-3 px-4 ${isRTL ? 'text-left' : 'text-right'}`}>{isRTL ? 'النتيجة' : 'Result'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] font-mono tabular-nums">
                    {status?.recentTrades && status.recentTrades.length > 0 ? (
                      status.recentTrades.map((trade) => (
                        <tr
                          key={trade.id}
                          onClick={() => {
                            const effectiveDuration = (trade as any).durationSeconds || status?.config?.timeframe || botTimeframe || currentTimeframe || 60;
                            setSelectedTradeDetail({
                              id: trade.id,
                              ticketId: trade.ticketId || trade.id,
                              asset: trade.asset,
                              accountMode: 'REAL',
                              timeframe: effectiveDuration,
                              strategyName: trade.strategy || 'توافق الاستراتيجيات (Confluence Matrix)',
                              action: trade.action,
                              amount: trade.amount,
                              openTime: Math.floor(trade.timestamp / 1000),
                              closeTime: Math.floor(trade.timestamp / 1000) + effectiveDuration,
                              openPrice: trade.openPrice || 0,
                              entryPrice: trade.openPrice || 0,
                              closePrice: trade.closePrice || trade.openPrice || 0,
                              exitPrice: trade.closePrice || trade.openPrice || 0,
                              profit: trade.profit,
                              result: trade.status === 'WON' ? 'WIN' : trade.status === 'LOST' ? 'LOSS' : trade.status === 'DRAW' ? 'DRAW' : 'PENDING',
                              durationSec: effectiveDuration,
                              reasons: trade.reason
                                ? [
                                    trade.reason,
                                    `فريم التنفيذ: ${effectiveDuration} ثانية`,
                                  ]
                                : [
                                    `إشارة مؤكدة من استراتيجية ${trade.strategy || 'توافق الاستراتيجيات'}`,
                                    `فريم التنفيذ: ${effectiveDuration} ثانية`,
                                  ],
                              confluenceScore: typeof trade.confidence === 'number' ? trade.confidence : undefined,
                            });
                          }}
                          className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                          title={isRTL ? 'اضغط لعرض تفاصيل الصفقة والشارت' : 'Click to inspect deal & trajectory chart'}
                        >
                          <td className="py-2.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <span>{formatTimestampInZone(trade.timestamp, displayTimezone)}</span>
                              <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-amber-300 transition-colors" />
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-100 font-semibold whitespace-nowrap">{trade.asset}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border ${
                                trade.action === 'call'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35'
                                  : 'bg-rose-500/15 text-rose-400 border-rose-500/35'
                              }`}
                            >
                              {trade.action === 'call' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                              {trade.action.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-amber-300 font-bold whitespace-nowrap">${trade.amount.toFixed(2)}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                trade.lifecycle === 'COMPLETED'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : trade.lifecycle === 'ACCEPTED'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : trade.lifecycle === 'REJECTED' || trade.lifecycle === 'FAILED'
                                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                              }`}
                            >
                              {trade.lifecycle || 'SUBMITTED'}
                            </span>
                          </td>
                          <td className={`py-2.5 px-4 font-bold whitespace-nowrap ${isRTL ? 'text-left' : 'text-right'}`}>
                            {trade.status === 'WON' ? (
                              <span className="text-emerald-400">
                                +${trade.profit !== undefined && trade.profit > 0 ? trade.profit.toFixed(2) : (trade.amount * 0.88).toFixed(2)}
                              </span>
                            ) : trade.status === 'LOST' ? (
                              <span className="text-rose-400">
                                -${Math.abs(trade.profit !== undefined && trade.profit < 0 ? trade.profit : trade.amount).toFixed(2)}
                              </span>
                            ) : trade.status === 'DRAW' ? (
                              <span className="text-slate-400">$0.00 ({isRTL ? 'تعادل' : 'DRAW'})</span>
                            ) : (
                              <span className="text-amber-300 animate-pulse">{isRTL ? 'جارية...' : 'Pending...'}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 text-xs font-sans">
                          {isRTL ? 'لم يتم تنفيذ صفقات آلية بعد' : 'No automated orders dispatched yet'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Anti-Bot Protections & Safeguards Summary */}
            <div className="p-5 rounded-2xl sabaa-panel-emerald space-y-3 text-xs">
              <h4 className="font-bold text-slate-100 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{isRTL ? 'طبقات التخفي ومحاكاة السلوك الإنساني المفعلة' : 'Active Stealth & Anti-Detection Layers'}</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] text-slate-300">
                <div className="p-2.5 rounded-xl sabaa-well flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isRTL ? 'تردد التفكير الإنساني (1.5 - 4.2s قبل الأمر)' : 'Human hesitation delay (1.5 - 4.2s)'}</span>
                </div>
                <div className="p-2.5 rounded-xl sabaa-well flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isRTL ? 'دعم السنتات ومطابقة المبالغ مع سجل الصفقات 100%' : 'Exact cents support (100% record match)'}</span>
                </div>
                <div className="p-2.5 rounded-xl sabaa-well flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isRTL ? 'استراحة شاي كل 10 صفقات (15 - 45 دقيقة)' : 'Fatigue cool-down every 10 trades'}</span>
                </div>
                <div className="p-2.5 rounded-xl sabaa-well flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isRTL ? 'معرفات فريدة لمنع تكرار الصفقات (Idempotency)' : 'Idempotency tokens preventing duplicates'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: STRATEGY LAB & BACKTEST ==================== */}
      {activeTab === 'lab' && (
        <div className="space-y-6">
          {/* Header & Backtest Trigger */}
          <div className="p-5 sm:p-6 rounded-2xl sabaa-panel-gold flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-black text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-300" />
                <span>{isRTL ? 'مختبر الاستراتيجيات والاختبار التاريخي المتقدم (Backtester)' : 'Strategy Lab & Chronological Backtester'}</span>
              </h3>
              <p className="text-xs text-slate-400 max-w-2xl">
                {isRTL
                  ? 'اختبار الاستراتيجيات الـ 26 الخوارزمية والمحركات المدمجة خطوة بخطوة عبر الشموع التاريخية دون أي تحيز زمني مستقبلي.'
                  : 'Zero look-ahead bias backtesting across all 26 quantitative strategies and composite engines.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
              <div className="flex items-center gap-2 sabaa-well px-3 py-1.5 rounded-xl">
                <span className="text-[11px] text-slate-400">{isRTL ? 'مبلغ الصفقة:' : 'Stake:'}</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={backtestStake}
                  onChange={(e) => setBacktestStake(Math.max(1, Number(e.target.value)))}
                  className="w-16 px-2 py-1 rounded-lg sabaa-input text-xs font-mono font-bold text-center tabular-nums"
                />
              </div>

              <div className="flex items-center gap-2 sabaa-well px-3 py-1.5 rounded-xl">
                <span className="text-[11px] text-slate-400">{isRTL ? 'العائد:' : 'Payout:'}</span>
                <input
                  type="number"
                  min="50"
                  max="98"
                  value={backtestPayout}
                  onChange={(e) => setBacktestPayout(Math.min(98, Math.max(50, Number(e.target.value))))}
                  className="w-16 px-2 py-1 rounded-lg sabaa-input text-xs font-mono font-bold text-center tabular-nums"
                />
                <span className="text-[11px] font-mono text-amber-300">%</span>
              </div>

              <button
                type="button"
                disabled={backtestLoading}
                onClick={() => handleRunBacktest(selectedStrategy)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl sabaa-btn-gold text-xs whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {backtestLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>{backtestLoading ? (isRTL ? 'جاري الاختبار...' : 'Running...') : (isRTL ? 'تشغيل الاختبار التاريخي' : 'Run Backtest')}</span>
              </button>
            </div>
          </div>

          {/* Strategy Matrix Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {STRATEGIES_LIST.map((strat) => {
              const isSelected = selectedStrategy === strat.id;
              return (
                <div
                  key={strat.id}
                  className={`p-4 sm:p-5 rounded-2xl transition-all flex flex-col justify-between gap-3 ${
                    isSelected ? 'sabaa-panel-gold' : 'sabaa-panel hover:border-white/[0.16]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono font-bold text-amber-300">
                        {strat.tag}
                      </span>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-100 mt-1">
                        {isRTL ? strat.nameAr : strat.nameEn}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStrategy(strat.id);
                        handleRunBacktest(strat.id);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected ? 'sabaa-btn-gold' : 'sabaa-btn-surface'
                      }`}
                    >
                      {isRTL ? 'اختبار' : 'Test'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {isRTL ? strat.descAr : strat.descEn}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Backtest Analytics Report */}
          {backtestReport && (
            <div className="p-5 sm:p-6 rounded-2xl sabaa-panel-gold space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <h4 className="font-bold text-sm text-slate-100">
                    {isRTL
                      ? `تقرير نتائج الاختبار التاريخي: ${backtestReport.strategyName}`
                      : `Backtest Performance Report: ${backtestReport.strategyName}`}
                  </h4>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-amber-300">
                  {backtestReport.totalCandles} {isRTL ? 'شمعة تم فحصها' : 'candles analyzed'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono tabular-nums">
                <div className="p-3.5 rounded-xl sabaa-well text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">{isRTL ? 'نسبة الفوز' : 'Win Rate'}</span>
                  <span className="text-base font-black text-amber-300">{backtestReport.winRate}%</span>
                </div>
                <div className="p-3.5 rounded-xl sabaa-well text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">{isRTL ? 'صافي الربح' : 'Net Profit'}</span>
                  <span
                    className={`text-base font-black ${
                      backtestReport.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {backtestReport.netProfit >= 0 ? '+' : ''}${backtestReport.netProfit}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl sabaa-well text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">{isRTL ? 'معامل الربح' : 'Profit Factor'}</span>
                  <span className="text-base font-black text-amber-300">{backtestReport.profitFactor}</span>
                </div>
                <div className="p-3.5 rounded-xl sabaa-well text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">{isRTL ? 'أقصى تراجع' : 'Max Drawdown'}</span>
                  <span className="text-base font-black text-rose-400">{backtestReport.maxDrawdownPercent}%</span>
                </div>
                <div className="p-3.5 rounded-xl sabaa-well text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">{isRTL ? 'عدد الصفقات' : 'Total Trades'}</span>
                  <span className="text-base font-black text-slate-100">{backtestReport.totalTrades}</span>
                </div>
                <div className="p-3.5 rounded-xl sabaa-well text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">{isRTL ? 'رابحة / خاسرة' : 'W / L'}</span>
                  <span className="text-xs font-black text-slate-300">
                    <span className="text-emerald-400">{backtestReport.winningTrades}</span> /{' '}
                    <span className="text-rose-400">{backtestReport.losingTrades}</span>
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl sabaa-well border-amber-400/25 text-[11px] text-amber-200/90 leading-relaxed">
                <span className="font-bold text-amber-300">{isRTL ? 'إخلاء مسؤولية:' : 'Disclaimer:'} </span>
                <span>{backtestReport.disclaimer}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: AUDIT LOGS ==================== */}
      {activeTab === 'logs' && (
        <div className="p-5 sm:p-6 rounded-2xl sabaa-panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                <FileText className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-sm text-slate-100">
                {isRTL ? 'سجل العمليات والتدقيق الأمني المباشر (Audit Log)' : 'Live Operational & Security Audit Trail'}
              </h4>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {status?.recentLogs?.length || 0} {isRTL ? 'حدث مسجل' : 'events'}
              </span>
              {confirmClearLogs ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleClearLogs}
                    disabled={clearingLogs}
                    className="px-3 py-1.5 rounded-lg sabaa-btn-crimson text-[10px] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {clearingLogs
                      ? isRTL ? 'جاري المسح...' : 'Clearing...'
                      : isRTL ? 'تأكيد المسح' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearLogs(false)}
                    disabled={clearingLogs}
                    className="px-2.5 py-1.5 rounded-lg sabaa-btn-surface text-[10px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isRTL ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearLogs(true)}
                  disabled={!status?.recentLogs || status.recentLogs.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg sabaa-btn-surface hover:border-rose-500/40 text-rose-300 text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isRTL ? 'مسح السجل' : 'Clear audit logs'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isRTL ? 'مسح' : 'Clear'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="h-96 overflow-y-auto space-y-2 font-mono text-xs p-3 rounded-xl sabaa-well">
            {status?.recentLogs && status.recentLogs.length > 0 ? (
              status.recentLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-xl text-xs flex items-start gap-2.5 border ${
                    log.level === 'error'
                      ? 'bg-rose-950/35 border-rose-500/30 text-rose-300'
                      : log.level === 'warn'
                      ? 'bg-amber-950/30 border-amber-400/30 text-amber-200'
                      : log.level === 'success'
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : 'bg-[#080E18] border-white/[0.06] text-slate-300'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                    {formatTimestampInZone(log.timestamp, displayTimezone)}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] uppercase font-bold text-amber-300 shrink-0">
                    {log.category}
                  </span>
                  <span className="leading-relaxed break-words">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs font-sans">
                {isRTL ? 'بانتظار أحداث تشغيل البوت لتسجيل السجلات...' : 'Waiting for bot activity to stream audit logs...'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: TEST CONNECTION ==================== */}
      {showConnModal && (
        <div className="fixed inset-0 z-50 bg-[#04060A]/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="sabaa-panel-gold rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Wifi className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-white">
                  {isRTL ? 'اختبار اتصال منصة Pocket Option' : 'Pocket Option Gateway Diagnostics'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConnModal(false)}
                className="p-1.5 rounded-lg sabaa-btn-surface text-slate-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {testingConn ? (
              <div className="py-8 text-center space-y-2.5">
                <RefreshCw className="w-8 h-8 text-amber-300 animate-spin mx-auto" />
                <p className="text-xs text-slate-300">{isRTL ? 'جاري فحص الاتصال والتحقق من الجلسة...' : 'Testing gateway handshake...'}</p>
              </div>
            ) : connTestResult ? (
              <div className="space-y-3 font-mono text-xs">
                <div
                  className={`p-3.5 rounded-xl border flex items-center gap-2.5 ${
                    connTestResult.ok
                      ? 'sabaa-panel-emerald text-emerald-300'
                      : 'sabaa-panel-crimson text-rose-300'
                  }`}
                >
                  {connTestResult.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <span className="font-bold font-sans">{connTestResult.message}</span>
                </div>

                <div className="p-3.5 rounded-xl sabaa-well space-y-2 text-[11px] tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isRTL ? 'خادم الاتصال:' : 'Endpoint:'}</span>
                    <span className="text-slate-100">{connTestResult.endpoint || 'api-fin.po.market'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isRTL ? 'زمن الاستجابة (Latency):' : 'Latency:'}</span>
                    <span className="text-amber-300 font-bold">{connTestResult.latencyMs || 0} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isRTL ? 'نوع الحساب:' : 'Account Mode:'}</span>
                    <span className="text-emerald-400 font-bold">REAL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isRTL ? 'الرصيد المتاح:' : 'Balance:'}</span>
                    <span className="text-emerald-400 font-bold">
                      {connTestResult.accountBalance !== null ? `$${connTestResult.accountBalance}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowConnModal(false)}
                className="px-5 py-2 rounded-xl sabaa-btn-surface text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                {isRTL ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Deal Inspection & Trajectory Modal */}
      <TradeDetailModal
        trade={selectedTradeDetail}
        displayTimezone={displayTimezone}
        onClose={() => setSelectedTradeDetail(null)}
      />
    </div>
  );
};
