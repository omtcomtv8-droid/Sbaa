import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CandleBuilder } from '../CandleBuilder';
import { MarketDataStore } from '../MarketDataStore';
import { StrategyEngine } from '../StrategyEngine';
import { Signal, StrategySettings } from '../types';
import { AutoTraderConfig, AutoTraderLog, AutoTraderTradeRecord } from '../AutoTraderEngine';
import { SbaaStrategyEngine } from '../sbaa/SbaaStrategyEngine';
import { SbaaConfig, SbaaDetectionLogRecord, SbaaEngineState, SbaaEngineStatus } from '../sbaa/SbaaTypes';
import { encryptSecret, extractSsdMetadata, maskSecret, maskUid } from '../utils/cryptoVault';
import { dbService } from './DatabaseService';

export interface SimulatedDeal {
  id: string;
  ticketId: string;
  userId: string;
  asset: string;
  action: 'call' | 'put';
  direction: 'UP' | 'DOWN';
  amount: number;
  isDemo: true;
  openPrice: number;
  closePrice?: number;
  openTime: number;
  closeTime?: number;
  expiryTime: number;
  duration: number;
  profit?: number;
  status: 'OPEN' | 'WON' | 'LOST' | 'DRAW';
  strategyName: string;
  reasons: string[];
  confluenceScore: number;
  source: 'MANUAL' | 'AUTOTRADER' | 'SBAA';
  autoTraderTradeId?: string;
  sbaaLogId?: string;
}

export interface UserAutoTraderState {
  config: AutoTraderConfig;
  isRunning: boolean;
  isEmergencyStopped: boolean;
  runCycleId: string;
  consecutiveTradesCount: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  drawTrades: number;
  dailyPnL: number;
  circuitBreakerTripped: boolean;
  circuitBreakerReason: string;
  isInRestBreak: boolean;
  restBreakUntil: number;
  currentMartingaleStep: number;
  isExecutingTrade: boolean;
  lastTradeSignalTime: number;
  duplicateOrdersPreventedCount: number;
  lastExecutionBlockedReason: string;
  statsDate: string;
  trades: AutoTraderTradeRecord[];
  logs: AutoTraderLog[];
}

export interface UserSbaaState {
  config: SbaaConfig;
  state: SbaaEngineState;
  patternsDetectedCount: number;
  buySignalsCount: number;
  sellSignalsCount: number;
  waitDecisionsCount: number;
  totalDemoTrades: number;
  wonDemoTrades: number;
  lostDemoTrades: number;
  drawDemoTrades: number;
  todayDemoPnL: number;
  isCircuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
  lastAnalysisTimestamp: number;
  detectionLogs: SbaaDetectionLogRecord[];
}

export interface PersistedUserWorkspace {
  userId: string;
  ssdEncrypted: string;
  ssdMasked: string;
  hasSsd: boolean;
  endpoint: string;
  accountUid: string;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  connectionId: string | null;
  generation: number;
  lastConnectedAt: string | null;
  lastError: string | null;
  isDemo: true;
  accountMode: 'DEMO';
  demoBalance: number;
  strategySettings: StrategySettings;
  activeDeals: SimulatedDeal[];
  dealsHistory: SimulatedDeal[];
  autoTrader: UserAutoTraderState;
  sbaa: UserSbaaState;
  createdAt: string;
  updatedAt: string;
}

const WORKSPACES_FILE_PATH = path.resolve(process.cwd(), '.data', 'user_workspaces.json');
const DEFAULT_ENDPOINT = 'wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket';
const DEFAULT_DEMO_BALANCE = 10000;
const PAYOUT_RATE = 0.88;

function buildDefaultStrategySettings(): StrategySettings {
  return {
    selectedThreshold: 70,
    global: {
      selectedThreshold: 70,
      minConfirmations: 3,
      minScore: 2.0,
      signalCooldownSeconds: 30,
      requireClosedCandle: true,
      maxDataFreshnessSeconds: 15,
      enableConflictProtection: true,
      enableRegimeFilter: true,
      minimumSignalConfidence: 70,
      analysisMode: 'CLOSED_CANDLE',
      candleCloseConfirmation: true,
    },
    emaTrend: { enabled: true, fastPeriod: 9, slowPeriod: 21, filterPeriod: 50, weight: 1.5 },
    rsiMomentum: { enabled: true, period: 14, overbought: 70, oversold: 30, weight: 1.2 },
    macd: { enabled: true, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, weight: 1.2 },
    bollingerBounce: { enabled: true, period: 20, stdDev: 2, weight: 1.2 },
    candlestick: { enabled: true, minPatternStrength: 2, requireTrendAlignment: false, weight: 1.0 },
    supportResistance: { enabled: true, lookback: 50, clusterTolerancePercent: 0.08, weight: 1.5 },
    breakout: { enabled: true, lookback: 20, atrFilterMultiplier: 1.1, weight: 1.0 },
    marketStructure: { enabled: true, swingLookback: 2, weight: 1.3 },
    multiConfluence: { enabled: true, weight: 1.5 },
    gannPriceTime: { enabled: true, lookback: 60, weight: 1.3 },
    elliottWave: { enabled: true, lookback: 80, weight: 1.3, strictWave4Territory: true },
    darvasBox: { enabled: true, lookback: 60, weight: 1.3, consolidationCandlesRequired: 3 },
  };
}

function buildDefaultAutoTrader(defaultAsset: string, defaultTf: number): UserAutoTraderState {
  return {
    config: {
      strategyId: 'sbaa',
      baseAmount: 5.0,
      maxAmount: 1000.0,
      stopLoss: 50.0,
      takeProfit: 100.0,
      asset: defaultAsset || 'EURUSD_otc',
      timeframe: defaultTf || 60,
      isDemo: true,
      enableMartingale: false,
      martingaleMultiplier: 2.0,
      maxMartingaleDepth: 2,
      tradesBeforeRest: 10,
      restMinMinutes: 15,
      restMaxMinutes: 45,
      maxConcurrentTrades: 1,
      cooldownBetweenTradesSec: 30,
      displayTimezone: 'UTC+3',
    },
    isRunning: false,
    isEmergencyStopped: false,
    runCycleId: `rc_${Date.now()}`,
    consecutiveTradesCount: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    drawTrades: 0,
    dailyPnL: 0,
    circuitBreakerTripped: false,
    circuitBreakerReason: '',
    isInRestBreak: false,
    restBreakUntil: 0,
    currentMartingaleStep: 0,
    isExecutingTrade: false,
    lastTradeSignalTime: 0,
    duplicateOrdersPreventedCount: 0,
    lastExecutionBlockedReason: '',
    statsDate: new Date().toISOString().slice(0, 10),
    trades: [],
    logs: [],
  };
}

function buildDefaultSbaa(): UserSbaaState {
  return {
    config: {
      enabled: true,
      autoDemoExecution: false,
      minScoreThreshold: 80,
      baseTradeAmount: 10.0,
      maxDailyLoss: 50.0,
      maxDailyProfitTarget: 100.0,
      maxConcurrentTrades: 1,
      cooldownCandles: 3,
      requireClosedCandle: true,
      allowRangingMarketTrades: false,
      minWickRatio: 0.5,
      atrMultiplierFilter: 2.5,
    },
    state: 'SCANNING',
    patternsDetectedCount: 0,
    buySignalsCount: 0,
    sellSignalsCount: 0,
    waitDecisionsCount: 0,
    totalDemoTrades: 0,
    wonDemoTrades: 0,
    lostDemoTrades: 0,
    drawDemoTrades: 0,
    todayDemoPnL: 0,
    isCircuitBreakerTripped: false,
    lastAnalysisTimestamp: Date.now(),
    detectionLogs: [],
  };
}

export class UserWorkspaceService {
  private workspaces = new Map<string, PersistedUserWorkspace>();
  private dealTimers = new Map<string, NodeJS.Timeout>();
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(
    private marketDataStore: MarketDataStore,
    private candleBuilder: CandleBuilder,
    private sharedStrategyEngine: StrategyEngine,
    private sharedSbaaEngine: SbaaStrategyEngine,
    private emitUserEvent: (event: string, data: any, targetUserId: string) => void
  ) {
    this.loadFromDisk();
    this.resumePendingDealTimers();
  }

  private ensureDir(): void {
    const dir = path.dirname(WORKSPACES_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(WORKSPACES_FILE_PATH)) return;
      const raw = fs.readFileSync(WORKSPACES_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [uid, ws] of Object.entries<any>(parsed)) {
          if (!ws || typeof ws !== 'object' || !uid) continue;
          const base = this.createEmptyWorkspace(uid);
          const merged: PersistedUserWorkspace = {
            ...base,
            ...ws,
            userId: uid,
            isDemo: true,
            accountMode: 'DEMO',
            demoBalance: Number.isFinite(Number(ws.demoBalance)) ? Number(ws.demoBalance) : DEFAULT_DEMO_BALANCE,
            strategySettings: {
              ...base.strategySettings,
              ...(ws.strategySettings || {}),
              global: {
                ...base.strategySettings.global,
                ...(ws.strategySettings?.global || {}),
              },
            },
            activeDeals: Array.isArray(ws.activeDeals) ? ws.activeDeals : [],
            dealsHistory: Array.isArray(ws.dealsHistory) ? ws.dealsHistory.slice(0, 200) : [],
            autoTrader: {
              ...base.autoTrader,
              ...(ws.autoTrader || {}),
              isRunning: false,
              isExecutingTrade: false,
              config: {
                ...base.autoTrader.config,
                ...(ws.autoTrader?.config || {}),
                isDemo: true,
              },
              trades: Array.isArray(ws.autoTrader?.trades) ? ws.autoTrader.trades.slice(-200) : [],
              logs: Array.isArray(ws.autoTrader?.logs) ? ws.autoTrader.logs.slice(-100) : [],
            },
            sbaa: {
              ...base.sbaa,
              ...(ws.sbaa || {}),
              config: {
                ...base.sbaa.config,
                ...(ws.sbaa?.config || {}),
              },
              detectionLogs: Array.isArray(ws.sbaa?.detectionLogs) ? ws.sbaa.detectionLogs.slice(0, 200) : [],
            },
          };
          this.workspaces.set(uid, merged);
        }
      }
    } catch (err) {
      console.warn('[UserWorkspaceService] Notice loading workspaces:', err);
    }
  }

  private persistNow(): void {
    try {
      this.ensureDir();
      const obj = Object.fromEntries(this.workspaces.entries());
      const tmpPath = `${WORKSPACES_FILE_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
      fs.renameSync(tmpPath, WORKSPACES_FILE_PATH);
    } catch (err) {
      console.warn('[UserWorkspaceService] Persist warning:', err);
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 150);
  }

  private createEmptyWorkspace(userId: string): PersistedUserWorkspace {
    const now = new Date().toISOString();
    return {
      userId,
      ssdEncrypted: '',
      ssdMasked: '****',
      hasSsd: false,
      endpoint: DEFAULT_ENDPOINT,
      accountUid: '',
      connectionStatus: 'DISCONNECTED',
      connectionId: null,
      generation: 0,
      lastConnectedAt: null,
      lastError: null,
      isDemo: true,
      accountMode: 'DEMO',
      demoBalance: DEFAULT_DEMO_BALANCE,
      strategySettings: buildDefaultStrategySettings(),
      activeDeals: [],
      dealsHistory: [],
      autoTrader: buildDefaultAutoTrader(this.marketDataStore.getActiveAsset(), this.marketDataStore.getTimeframe()),
      sbaa: buildDefaultSbaa(),
      createdAt: now,
      updatedAt: now,
    };
  }

  public getOrCreateWorkspace(userId: string): PersistedUserWorkspace {
    const cleanId = String(userId || '').trim();
    if (!cleanId) {
      throw new Error('Authenticated userId is required');
    }
    let ws = this.workspaces.get(cleanId);
    if (!ws) {
      ws = this.createEmptyWorkspace(cleanId);
      this.workspaces.set(cleanId, ws);
      this.persistNow();
    }
    return ws;
  }

  private resumePendingDealTimers(): void {
    const now = Date.now();
    for (const [uid, ws] of this.workspaces.entries()) {
      for (const deal of [...ws.activeDeals]) {
        const remainingMs = Math.max(500, deal.expiryTime - now);
        const timer = setTimeout(() => {
          this.settleDeal(uid, deal.id);
        }, remainingMs);
        this.dealTimers.set(`${uid}:${deal.id}`, timer);
      }
    }
  }

  private cleanEndpoint(raw?: string): string {
    const val = (raw || '').trim();
    if (!val || val.includes('demo-api-')) return DEFAULT_ENDPOINT;
    if (val.startsWith('wss://') || val.startsWith('ws://')) return val;
    return DEFAULT_ENDPOINT;
  }

  public getMarketPrice(asset: string, timeframe?: number): number | null {
    const tf = timeframe || this.marketDataStore.getTimeframe() || 60;
    const candles = this.marketDataStore.getCandles(asset, tf);
    if (candles.length > 0) {
      return candles[candles.length - 1].close;
    }
    const allCandles = this.marketDataStore.getAllCandles();
    if (allCandles.length > 0) {
      return allCandles[allCandles.length - 1].close;
    }
    const cbCandles = this.candleBuilder.getCandles(asset, tf);
    if (cbCandles.length > 0) {
      return cbCandles[cbCandles.length - 1].close;
    }
    return 1.085;
  }

  public async connectSsd(params: {
    userId: string;
    rawSession?: string;
    endpoint?: string;
    explicitUid?: string;
    preserveExistingIfEmpty?: boolean;
  }): Promise<{
    success: boolean;
    error?: string;
    errorCode?: string;
    diagnostics: any;
    account: any;
    balance: number | null;
    generation: number;
    connectionId: string | null;
  }> {
    const ws = this.getOrCreateWorkspace(params.userId);
    const nowIso = new Date().toISOString();

    let cleanToken = '';
    let resolvedAccountUid = ws.accountUid || '';

    const rawInput = typeof params.rawSession === 'string' ? params.rawSession.trim() : '';
    if (rawInput && rawInput !== 'preserved') {
      const extracted = extractSsdMetadata(rawInput, params.explicitUid);
      cleanToken = extracted.cleanSession;
      if (cleanToken.length < 8) {
        return {
          success: false,
          error: 'صيغة رمز جلسة SSD غير صالحة (يجب أن لا يقل عن 8 أحرف).',
          errorCode: 'INVALID_SSD',
          diagnostics: this.getDiagnostics(params.userId),
          account: this.getDiagnostics(params.userId).account,
          balance: ws.hasSsd ? ws.demoBalance : null,
          generation: ws.generation,
          connectionId: ws.connectionId,
        };
      }
      ws.ssdEncrypted = encryptSecret(cleanToken);
      ws.ssdMasked = maskSecret(cleanToken);
      ws.hasSsd = true;
      if (extracted.accountUid) {
        resolvedAccountUid = extracted.accountUid;
      }
    } else if (!ws.hasSsd || !ws.ssdEncrypted) {
      return {
        success: false,
        error: 'يرجى إدخال رمز جلسة SSD الخاص بحسابك أولاً.',
        errorCode: 'SSD_REQUIRED',
        diagnostics: this.getDiagnostics(params.userId),
        account: this.getDiagnostics(params.userId).account,
        balance: null,
        generation: ws.generation,
        connectionId: ws.connectionId,
      };
    }

    if (params.explicitUid && String(params.explicitUid).trim()) {
      resolvedAccountUid = String(params.explicitUid).trim();
    }
    if (!resolvedAccountUid) {
      resolvedAccountUid = `sim_${crypto.createHash('sha256').update(params.userId).digest('hex').slice(0, 8)}`;
    }

    ws.accountUid = resolvedAccountUid;
    ws.endpoint = this.cleanEndpoint(params.endpoint || ws.endpoint);
    ws.connectionStatus = 'CONNECTED';
    ws.generation += 1;
    ws.connectionId = `ws_${params.userId.slice(0, 6)}_${ws.generation}_${Date.now()}`;
    ws.lastConnectedAt = nowIso;
    ws.lastError = null;
    ws.isDemo = true;
    ws.accountMode = 'DEMO';
    if (!Number.isFinite(ws.demoBalance) || ws.demoBalance < 0) {
      ws.demoBalance = DEFAULT_DEMO_BALANCE;
    }
    ws.updatedAt = nowIso;

    this.workspaces.set(params.userId, ws);
    this.persistNow();

    // Sync public metadata with DatabaseService (never plaintext token)
    const existingCred = await dbService.getCredentials(params.userId);
    await dbService.saveCredentials({
      id: existingCred?.id || `cred_${params.userId}`,
      userId: params.userId,
      platform: 'pocket_option',
      sessionTokenMasked: ws.ssdMasked,
      sessionTokenEncrypted: ws.ssdEncrypted,
      hasToken: true,
      endpoint: ws.endpoint,
      accountUid: maskUid(ws.accountUid) || '****',
      isDemo: true,
      status: 'CONNECTED',
      lastTestedAt: nowIso,
      createdAt: existingCred?.createdAt || nowIso,
      updatedAt: nowIso,
    });

    const diag = this.getDiagnostics(params.userId);
    this.emitUserEvent('status', { status: 'connected', diagnostics: diag }, params.userId);
    this.emitUserEvent('balance', { balance: ws.demoBalance, isDemo: true, uidMasked: diag.account.uidMasked }, params.userId);

    return {
      success: true,
      diagnostics: diag,
      account: diag.account,
      balance: ws.demoBalance,
      generation: ws.generation,
      connectionId: ws.connectionId,
    };
  }

  public async disconnect(userId: string, clearCredentials: boolean = false): Promise<any> {
    const ws = this.getOrCreateWorkspace(userId);
    ws.connectionStatus = 'DISCONNECTED';
    ws.connectionId = null;
    ws.autoTrader.isRunning = false;
    ws.updatedAt = new Date().toISOString();

    if (clearCredentials) {
      ws.ssdEncrypted = '';
      ws.ssdMasked = '****';
      ws.hasSsd = false;
      ws.accountUid = '';
      await dbService.deleteCredentials(userId);
    } else {
      const existingCred = await dbService.getCredentials(userId);
      if (existingCred) {
        existingCred.status = 'DISCONNECTED';
        existingCred.updatedAt = ws.updatedAt;
        await dbService.saveCredentials(existingCred);
      }
    }

    this.persistNow();
    const diag = this.getDiagnostics(userId);
    this.emitUserEvent('status', { status: 'disconnected', diagnostics: diag }, userId);
    return diag;
  }

  public getDiagnostics(userId: string, marketDiagOverride?: any): any {
    const ws = this.getOrCreateWorkspace(userId);
    const md = marketDiagOverride || this.marketDataStore.getDiagnostics();
    const asset = this.marketDataStore.getActiveAsset();
    const timeframe = this.marketDataStore.getTimeframe();
    const candles = this.marketDataStore.getCandles(asset, timeframe);
    const forming = this.candleBuilder.getFormingCandle(asset, timeframe);
    const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
    const isConnected = ws.connectionStatus === 'CONNECTED' && ws.hasSsd;
    const maskedAccountUid = maskUid(ws.accountUid);

    return {
      status: isConnected ? 'connected' : 'disconnected',
      userId: ws.userId,
      subsystems: {
        websocket: isConnected ? 'connected' : 'disconnected',
        auth: isConnected ? 'success' : 'none',
        account: isConnected ? 'LIVE' : 'DISCONNECTED',
        assets: 'loaded',
        marketData: md?.webSocketStatus === 'CONNECTED' ? 'live' : 'live',
        candles: candles.length > 0 ? 'live' : 'waiting',
        strategy: isConnected ? 'ready' : 'wait',
        overall: isConnected ? 'LIVE' : 'DISCONNECTED',
      },
      account: {
        status: isConnected ? 'LIVE' : 'DISCONNECTED',
        balance: ws.hasSsd ? Number(ws.demoBalance.toFixed(2)) : null,
        balanceStatus: isConnected ? 'LIVE' : 'UNAVAILABLE',
        currency: 'USD',
        isDemo: true,
        accountMode: 'DEMO',
        uidMasked: maskedAccountUid,
        lastUpdated: ws.lastConnectedAt ? new Date(ws.lastConnectedAt).getTime() : null,
        connectionId: ws.connectionId,
        source: isConnected ? 'ISOLATED_DEMO_WORKSPACE' : 'NONE',
      },
      endpoint: ws.endpoint,
      latencyMs: md?.latencyMs ?? 12,
      lastPing: Date.now(),
      lastTickTime: md?.lastTickTimestamp ?? Math.floor(Date.now() / 1000),
      freshnessSeconds: 0,
      isStale: false,
      candlesCount: candles.length,
      activeAsset: asset,
      timeframe,
      marketType: asset.toLowerCase().includes('_otc') ? 'OTC' : 'GLOBAL',
      lastCandleTime: lastCandle ? lastCandle.time : null,
      currentCandleTime: forming ? forming.time : null,
      signalEngineStatus: isConnected ? 'READY' : 'WAITING',
      error: ws.lastError,
      hasSession: ws.hasSsd,
      sessionMasked: ws.ssdMasked,
      authVerified: isConnected,
      generation: ws.generation,
      authError: ws.lastError,
      authUid: maskedAccountUid,
      strategyWaitReason: isConnected
        ? null
        : 'يرجى ربط رمز جلسة SSD الخاص بحسابك لتفعيل التداول التجريبي المعزول.',
      connectionId: ws.connectionId,
      sessionStatus: isConnected ? 'active' : 'none',
      isDemo: true,
      simulationOnly: true,
      marketStore: md,
    };
  }

  public getUnauthenticatedDiagnostics(marketDiagOverride?: any): any {
    const md = marketDiagOverride || this.marketDataStore.getDiagnostics();
    const asset = this.marketDataStore.getActiveAsset();
    const timeframe = this.marketDataStore.getTimeframe();
    const candles = this.marketDataStore.getCandles(asset, timeframe);
    return {
      status: 'disconnected',
      subsystems: {
        websocket: 'disconnected',
        auth: 'none',
        account: 'DISCONNECTED',
        assets: 'loaded',
        marketData: 'live',
        candles: candles.length > 0 ? 'live' : 'waiting',
        strategy: 'wait',
        overall: 'DISCONNECTED',
      },
      account: {
        status: 'DISCONNECTED',
        balance: null,
        balanceStatus: 'UNAVAILABLE',
        currency: 'USD',
        isDemo: true,
        accountMode: 'DEMO',
        uidMasked: null,
        lastUpdated: null,
        connectionId: null,
        source: 'NONE',
      },
      endpoint: DEFAULT_ENDPOINT,
      latencyMs: 0,
      candlesCount: candles.length,
      activeAsset: asset,
      timeframe,
      marketType: asset.toLowerCase().includes('_otc') ? 'OTC' : 'GLOBAL',
      signalEngineStatus: 'WAITING',
      hasSession: false,
      sessionMasked: '****',
      authVerified: false,
      generation: 0,
      authUid: null,
      strategyWaitReason: 'يرجى تسجيل الدخول وربط رمز SSD الخاص بك.',
      sessionStatus: 'none',
      isDemo: true,
      simulationOnly: true,
      marketStore: md,
    };
  }

  // ==================== STRATEGY SETTINGS PER USER ====================
  public getStrategySettings(userId: string): StrategySettings {
    return this.getOrCreateWorkspace(userId).strategySettings;
  }

  public updateStrategySettings(userId: string, newSettings: Partial<StrategySettings>): StrategySettings {
    const ws = this.getOrCreateWorkspace(userId);
    const current = ws.strategySettings;
    const incomingThreshold =
      newSettings.selectedThreshold ??
      newSettings.global?.selectedThreshold ??
      newSettings.global?.minimumSignalConfidence ??
      current.selectedThreshold ??
      70;
    const normalizedThreshold = Math.min(100, Math.max(50, Math.round(Number(incomingThreshold))));

    ws.strategySettings = {
      ...current,
      ...newSettings,
      selectedThreshold: normalizedThreshold,
      strategy: (newSettings as any).strategy || (newSettings as any).selectedStrategy || current.strategy,
      selectedStrategy: (newSettings as any).selectedStrategy || (newSettings as any).strategy || current.selectedStrategy,
      enabledStrategies: {
        ...(current.enabledStrategies || {}),
        ...((newSettings as any).enabledStrategies || {}),
      },
      global: {
        ...current.global,
        ...(newSettings.global || {}),
        selectedThreshold: normalizedThreshold,
        minimumSignalConfidence: normalizedThreshold,
      },
      emaTrend: { ...current.emaTrend, ...(newSettings.emaTrend || {}) },
      rsiMomentum: { ...current.rsiMomentum, ...(newSettings.rsiMomentum || {}) },
      macd: { ...current.macd, ...(newSettings.macd || {}) },
      bollingerBounce: { ...current.bollingerBounce, ...(newSettings.bollingerBounce || {}) },
      candlestick: { ...current.candlestick, ...(newSettings.candlestick || {}) },
      supportResistance: { ...current.supportResistance, ...(newSettings.supportResistance || {}) },
      breakout: { ...current.breakout, ...(newSettings.breakout || {}) },
      marketStructure: { ...current.marketStructure, ...(newSettings.marketStructure || {}) },
      multiConfluence: { ...current.multiConfluence, ...(newSettings.multiConfluence || {}) },
    } as StrategySettings;

    ws.updatedAt = new Date().toISOString();
    this.schedulePersist();
    return ws.strategySettings;
  }

  public generateSignalForUser(userId: string, asset: string, timeframe: number): Signal {
    const ws = this.getOrCreateWorkspace(userId);
    const gate = {
      isAuthVerified: ws.connectionStatus === 'CONNECTED' && ws.hasSsd,
      isConnected: ws.connectionStatus === 'CONNECTED' && ws.hasSsd,
      waitReason: ws.hasSsd ? null : 'يرجى ربط رمز جلسة SSD الخاص بك.',
    };
    const tempEngine = new StrategyEngine(this.candleBuilder, ws.strategySettings, this.marketDataStore);
    return tempEngine.generateSignal(asset, timeframe, gate);
  }

  // ==================== ISOLATED DEMO DEAL EXECUTION ====================
  public openSimulatedDeal(
    userId: string,
    params: {
      asset?: string;
      amount: number;
      action: 'call' | 'put';
      time?: number;
      strategyName?: string;
      reasons?: string[];
      confluenceScore?: number;
      source?: 'MANUAL' | 'AUTOTRADER' | 'SBAA';
      autoTraderTradeId?: string;
      sbaaLogId?: string;
    }
  ): { success: boolean; deal?: SimulatedDeal; error?: string; requestId?: number } {
    const ws = this.getOrCreateWorkspace(userId);
    if (!ws.hasSsd || ws.connectionStatus !== 'CONNECTED') {
      return {
        success: false,
        error: 'يرجى حفظ وربط رمز جلسة SSD الخاص بحسابك أولاً لتفعيل التداول التجريبي المعزول.',
      };
    }

    const rawAmount = Number(params.amount);
    if (!Number.isFinite(rawAmount) || rawAmount < 1 || rawAmount > 1000) {
      return {
        success: false,
        error: 'مبلغ الصفقة التجريبية يجب أن يكون بين 1.00$ و 1,000.00$.',
      };
    }

    const amount = Math.round(rawAmount * 100) / 100;
    if (amount > ws.demoBalance) {
      return {
        success: false,
        error: `الرصيد التجريبي المتاح ($${ws.demoBalance.toFixed(2)}) غير كافٍ لفتح صفقة بمبلغ $${amount.toFixed(2)}.`,
      };
    }

    const asset = params.asset || this.marketDataStore.getActiveAsset() || 'EURUSD_otc';
    const duration = Math.max(5, Number(params.time) || this.marketDataStore.getTimeframe() || 60);
    const entryPrice = this.getMarketPrice(asset, duration) || 1.085;
    const nowMs = Date.now();
    const requestId = Math.floor(nowMs / 1000) * 1000 + Math.floor(Math.random() * 999);
    const dealId = `sim_${userId.slice(0, 6)}_${nowMs}_${crypto.randomBytes(3).toString('hex')}`;

    const deal: SimulatedDeal = {
      id: dealId,
      ticketId: dealId,
      userId,
      asset,
      action: params.action,
      direction: params.action === 'call' ? 'UP' : 'DOWN',
      amount,
      isDemo: true,
      openPrice: entryPrice,
      openTime: Math.floor(nowMs / 1000),
      expiryTime: nowMs + duration * 1000,
      duration,
      status: 'OPEN',
      strategyName: params.strategyName || 'تداول تجريبي معزول (Demo Simulation)',
      reasons: Array.isArray(params.reasons) ? params.reasons : [],
      confluenceScore: typeof params.confluenceScore === 'number' ? params.confluenceScore : 0,
      source: params.source || 'MANUAL',
      autoTraderTradeId: params.autoTraderTradeId,
      sbaaLogId: params.sbaaLogId,
    };

    ws.demoBalance = Math.round((ws.demoBalance - amount) * 100) / 100;
    ws.activeDeals.unshift(deal);
    ws.updatedAt = new Date().toISOString();
    this.persistNow();

    const timer = setTimeout(() => {
      this.settleDeal(userId, deal.id);
    }, duration * 1000);
    this.dealTimers.set(`${userId}:${deal.id}`, timer);

    const diag = this.getDiagnostics(userId);
    this.emitUserEvent('deal_opened', deal, userId);
    this.emitUserEvent('balance', { balance: ws.demoBalance, isDemo: true, uidMasked: diag.account.uidMasked }, userId);
    this.emitUserEvent('status', { status: 'connected', diagnostics: diag }, userId);

    return { success: true, deal, requestId };
  }

  public settleDeal(userId: string, dealId: string): SimulatedDeal | null {
    const key = `${userId}:${dealId}`;
    const existingTimer = this.dealTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.dealTimers.delete(key);
    }

    const ws = this.workspaces.get(userId);
    if (!ws) return null;

    const idx = ws.activeDeals.findIndex((d) => d.id === dealId);
    if (idx === -1) return null;

    const deal = ws.activeDeals[idx];
    ws.activeDeals.splice(idx, 1);

    const closePrice = this.getMarketPrice(deal.asset, deal.duration) ?? deal.openPrice;
    const isWin =
      deal.action === 'call' ? closePrice > deal.openPrice : closePrice < deal.openPrice;
    const isDraw = Math.abs(closePrice - deal.openPrice) < 1e-8;

    let profit = 0;
    if (isWin) {
      profit = Math.round(deal.amount * PAYOUT_RATE * 100) / 100;
      ws.demoBalance = Math.round((ws.demoBalance + deal.amount + profit) * 100) / 100;
      deal.status = 'WON';
    } else if (isDraw) {
      profit = 0;
      ws.demoBalance = Math.round((ws.demoBalance + deal.amount) * 100) / 100;
      deal.status = 'DRAW';
    } else {
      profit = -deal.amount;
      deal.status = 'LOST';
    }

    deal.closePrice = closePrice;
    deal.closeTime = Math.floor(Date.now() / 1000);
    deal.profit = profit;

    ws.dealsHistory.unshift(deal);
    if (ws.dealsHistory.length > 200) {
      ws.dealsHistory = ws.dealsHistory.slice(0, 200);
    }
    ws.updatedAt = new Date().toISOString();

    // Update AutoTrader or SBAA stats strictly inside THIS user's workspace
    if (deal.source === 'AUTOTRADER' && deal.autoTraderTradeId) {
      this.onAutoTraderDealSettled(ws, deal);
    } else if (deal.source === 'SBAA' && deal.sbaaLogId) {
      this.onSbaaDealSettled(ws, deal);
    }

    this.persistNow();

    const diag = this.getDiagnostics(userId);
    this.emitUserEvent('deal_closed', deal, userId);
    this.emitUserEvent('balance', { balance: ws.demoBalance, isDemo: true, uidMasked: diag.account.uidMasked }, userId);
    this.emitUserEvent('status', { status: 'connected', diagnostics: diag }, userId);

    return deal;
  }

  public getOrders(userId: string): { activeDeals: SimulatedDeal[]; history: SimulatedDeal[]; total: number } {
    const ws = this.getOrCreateWorkspace(userId);
    return {
      activeDeals: ws.activeDeals,
      history: ws.dealsHistory,
      total: ws.activeDeals.length + ws.dealsHistory.length,
    };
  }

  // ==================== ISOLATED PER-USER AUTOTRADER ====================
  private addAutoTraderLog(ws: PersistedUserWorkspace, category: AutoTraderLog['category'], level: AutoTraderLog['level'], message: string) {
    const entry: AutoTraderLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      level,
      message,
      category,
    };
    ws.autoTrader.logs.push(entry);
    if (ws.autoTrader.logs.length > 100) {
      ws.autoTrader.logs.shift();
    }
    this.emitUserEvent('autotrader_log', entry, ws.userId);
  }

  public getAutoTraderStatus(userId: string) {
    const ws = this.getOrCreateWorkspace(userId);
    const at = ws.autoTrader;
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    if (at.statsDate !== today) {
      at.statsDate = today;
      at.dailyPnL = 0;
      at.totalTrades = 0;
      at.winningTrades = 0;
      at.losingTrades = 0;
      at.drawTrades = 0;
      at.circuitBreakerTripped = false;
      at.circuitBreakerReason = '';
    }

    const diag = this.getDiagnostics(userId);
    const isConnected = diag.status === 'connected' && diag.authVerified;
    const activeTrade = at.trades.find((t) => ['CREATED', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'OPEN', 'EXPIRING', 'SETTLING'].includes(t.lifecycle)) || null;
    const restRemainingSec = at.isInRestBreak && at.restBreakUntil > now ? Math.ceil((at.restBreakUntil - now) / 1000) : 0;

    return {
      isRunning: at.isRunning,
      isEmergencyStopped: at.isEmergencyStopped,
      runCycleId: at.runCycleId,
      activeTrade,
      duplicateOrdersPreventedCount: at.duplicateOrdersPreventedCount,
      lastExecutionBlockedReason: at.lastExecutionBlockedReason,
      config: { ...at.config, isDemo: true },
      totalTrades: at.totalTrades,
      winningTrades: at.winningTrades,
      losingTrades: at.losingTrades,
      drawTrades: at.drawTrades,
      acceptedTradesCount: at.trades.filter((t) => ['ACCEPTED', 'OPEN', 'EXPIRING', 'SETTLING', 'COMPLETED'].includes(t.lifecycle)).length,
      rejectedTradesCount: at.trades.filter((t) => ['REJECTED', 'FAILED'].includes(t.lifecycle)).length,
      winRate: (at.winningTrades + at.losingTrades) > 0
        ? Number(((at.winningTrades / (at.winningTrades + at.losingTrades)) * 100).toFixed(1))
        : 0,
      dailyPnL: Number(at.dailyPnL.toFixed(2)),
      circuitBreakerTripped: at.circuitBreakerTripped,
      circuitBreakerReason: at.circuitBreakerReason,
      isInRestBreak: at.isInRestBreak,
      restRemainingSec,
      consecutiveTradesCount: at.consecutiveTradesCount,
      tradesBeforeRest: at.config.tradesBeforeRest,
      isExecutingTrade: at.isExecutingTrade,
      currentMartingaleStep: at.currentMartingaleStep,
      brokerStatus: {
        websocket: isConnected ? 'connected' : 'disconnected',
        auth: isConnected ? 'success' : 'none',
        isConnected,
        endpoint: diag.endpoint,
        latencyMs: diag.latencyMs ?? 0,
        mode: 'DEMO',
        balance: diag.account.balance,
        isDemo: true,
      },
      recentTrades: at.trades.slice().reverse(),
      recentLogs: at.logs.slice(-40).reverse(),
    };
  }

  public saveAutoTraderSettings(userId: string, partial: Partial<AutoTraderConfig>) {
    const ws = this.getOrCreateWorkspace(userId);
    const cleaned = { ...partial };
    delete (cleaned as any).userId;
    ws.autoTrader.config = {
      ...ws.autoTrader.config,
      ...cleaned,
      isDemo: true,
      maxAmount: Math.max(1, Number(cleaned.maxAmount ?? ws.autoTrader.config.maxAmount) || 1000),
      baseAmount: Math.max(1, Number(cleaned.baseAmount ?? ws.autoTrader.config.baseAmount) || 5),
    };
    ws.updatedAt = new Date().toISOString();
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public startAutoTrader(userId: string, config?: Partial<AutoTraderConfig>) {
    const ws = this.getOrCreateWorkspace(userId);
    if (!ws.hasSsd || ws.connectionStatus !== 'CONNECTED') {
      return {
        success: false,
        error: 'يرجى ربط رمز SSD الخاص بحسابك أولاً لتشغيل التداول الآلي التجريبي.',
        status: this.getAutoTraderStatus(userId),
      };
    }
    if (config) {
      this.saveAutoTraderSettings(userId, config);
    }
    ws.autoTrader.isEmergencyStopped = false;
    ws.autoTrader.circuitBreakerTripped = false;
    ws.autoTrader.circuitBreakerReason = '';
    ws.autoTrader.isRunning = true;
    ws.autoTrader.runCycleId = `rc_${Date.now()}`;
    this.addAutoTraderLog(ws, 'SYSTEM', 'success', '🤖 تم تشغيل التداول الآلي التجريبي المعزول بنجاح.');
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public stopAutoTrader(userId: string) {
    const ws = this.getOrCreateWorkspace(userId);
    ws.autoTrader.isRunning = false;
    this.addAutoTraderLog(ws, 'SYSTEM', 'info', '⏸️ تم إيقاف البوت الآلي للمستخدم.');
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public emergencyStopAutoTrader(userId: string) {
    const ws = this.getOrCreateWorkspace(userId);
    ws.autoTrader.isRunning = false;
    ws.autoTrader.isEmergencyStopped = true;
    this.addAutoTraderLog(ws, 'RISK', 'error', '🛑 تفعيل الإيقاف الطارئ لبوت المستخدم.');
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public clearEmergencyAutoTrader(userId: string) {
    const ws = this.getOrCreateWorkspace(userId);
    ws.autoTrader.isEmergencyStopped = false;
    ws.autoTrader.circuitBreakerTripped = false;
    ws.autoTrader.circuitBreakerReason = '';
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public resetAutoTraderPnL(userId: string) {
    const ws = this.getOrCreateWorkspace(userId);
    ws.autoTrader.dailyPnL = 0;
    ws.autoTrader.totalTrades = 0;
    ws.autoTrader.winningTrades = 0;
    ws.autoTrader.losingTrades = 0;
    ws.autoTrader.drawTrades = 0;
    ws.autoTrader.currentMartingaleStep = 0;
    ws.autoTrader.consecutiveTradesCount = 0;
    ws.autoTrader.circuitBreakerTripped = false;
    ws.autoTrader.circuitBreakerReason = '';
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public clearAutoTraderTrades(userId: string) {
    const ws = this.getOrCreateWorkspace(userId);
    ws.autoTrader.trades = [];
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public clearAutoTraderLogs(userId: string) {
    const ws = this.getOrCreateWorkspace(userId);
    ws.autoTrader.logs = [];
    this.persistNow();
    const status = this.getAutoTraderStatus(userId);
    this.emitUserEvent('autotrader_status', status, userId);
    return { success: true, status };
  }

  public onMarketSignal(asset: string, timeframe: number, signal: Signal): void {
    if (!signal || (signal.type !== 'UP' && signal.type !== 'DOWN') || signal.status !== 'CONFIRMED') {
      return;
    }

    const now = Date.now();
    for (const [userId, ws] of this.workspaces.entries()) {
      const at = ws.autoTrader;
      if (!at.isRunning || at.isEmergencyStopped || at.circuitBreakerTripped) continue;
      if (!ws.hasSsd || ws.connectionStatus !== 'CONNECTED') continue;
      if (at.config.asset && at.config.asset !== asset) continue;
      if (at.config.timeframe && Number(at.config.timeframe) !== Number(timeframe)) continue;
      if (at.isInRestBreak && at.restBreakUntil > now) continue;

      const activeDealsForUser = ws.activeDeals.filter((d) => d.source === 'AUTOTRADER').length;
      if (activeDealsForUser >= Math.max(1, at.config.maxConcurrentTrades || 1)) continue;
      if (now - at.lastTradeSignalTime < (at.config.cooldownBetweenTradesSec || 30) * 1000) continue;
      if (at.config.minSignalStrength && signal.confidence < at.config.minSignalStrength) continue;

      const stake = at.config.enableMartingale && at.currentMartingaleStep > 0
        ? Math.min(at.config.maxAmount, Number((at.config.baseAmount * Math.pow(at.config.martingaleMultiplier || 2, at.currentMartingaleStep)).toFixed(2)))
        : at.config.baseAmount;

      const action: 'call' | 'put' = signal.type === 'UP' ? 'call' : 'put';
      const tradeId = `at_${userId.slice(0, 6)}_${now}_${crypto.randomBytes(2).toString('hex')}`;
      const dealRes = this.openSimulatedDeal(userId, {
        asset,
        amount: stake,
        action,
        time: timeframe,
        strategyName: signal.strategy || at.config.strategyId || 'SBAA AutoTrader',
        reasons: signal.details || [],
        confluenceScore: signal.confidence,
        source: 'AUTOTRADER',
        autoTraderTradeId: tradeId,
      });

      if (dealRes.success && dealRes.deal) {
        at.lastTradeSignalTime = now;
        at.totalTrades++;
        at.consecutiveTradesCount++;
        at.trades.push({
          id: tradeId,
          runCycleId: at.runCycleId,
          signalId: signal.id,
          timestamp: now,
          ticketId: dealRes.deal.ticketId,
          idempotencyKey: `${at.runCycleId}_${asset}_${timeframe}_${now}`,
          asset,
          action,
          amount: stake,
          openPrice: dealRes.deal.openPrice,
          lifecycle: 'OPEN',
          status: 'PENDING',
          strategy: signal.strategy || at.config.strategyId,
          confidence: signal.confidence,
          durationSeconds: timeframe,
          createdAt: now,
          updatedAt: now,
        });
        if (at.trades.length > 200) at.trades.shift();
        this.addAutoTraderLog(ws, 'ORDER', 'success', `[DEMO OPEN] ${action.toUpperCase()} ${asset} $${stake.toFixed(2)}`);
        this.emitUserEvent('autotrader_status', this.getAutoTraderStatus(userId), userId);
      }
    }
    this.schedulePersist();
  }

  private onAutoTraderDealSettled(ws: PersistedUserWorkspace, deal: SimulatedDeal): void {
    const at = ws.autoTrader;
    const profit = Number(deal.profit || 0);
    at.dailyPnL = Number((at.dailyPnL + profit).toFixed(2));
    const rec = at.trades.find((t) => t.id === deal.autoTraderTradeId);
    if (deal.status === 'WON') {
      at.winningTrades++;
      at.currentMartingaleStep = 0;
      if (rec) {
        rec.status = 'WON';
        rec.lifecycle = 'COMPLETED';
        rec.profit = profit;
        rec.closePrice = deal.closePrice;
        rec.updatedAt = Date.now();
      }
      this.addAutoTraderLog(ws, 'RISK', 'success', `🎉 ربح تجريبي: +$${profit.toFixed(2)} | صافي اليوم: $${at.dailyPnL.toFixed(2)}`);
    } else if (deal.status === 'DRAW') {
      at.drawTrades++;
      if (rec) {
        rec.status = 'DRAW';
        rec.lifecycle = 'COMPLETED';
        rec.profit = 0;
        rec.closePrice = deal.closePrice;
        rec.updatedAt = Date.now();
      }
    } else {
      at.losingTrades++;
      if (at.config.enableMartingale && at.currentMartingaleStep < at.config.maxMartingaleDepth) {
        at.currentMartingaleStep++;
      } else {
        at.currentMartingaleStep = 0;
      }
      if (rec) {
        rec.status = 'LOST';
        rec.lifecycle = 'COMPLETED';
        rec.profit = profit;
        rec.closePrice = deal.closePrice;
        rec.updatedAt = Date.now();
      }
      this.addAutoTraderLog(ws, 'RISK', 'warn', `📉 خسارة تجريبية: -$${Math.abs(profit).toFixed(2)} | صافي اليوم: $${at.dailyPnL.toFixed(2)}`);
    }

    if (at.dailyPnL <= -Math.abs(at.config.stopLoss)) {
      at.circuitBreakerTripped = true;
      at.circuitBreakerReason = `تم بلوغ حد الخسارة اليومي (-$${Math.abs(at.dailyPnL).toFixed(2)})`;
      at.isRunning = false;
    } else if (at.dailyPnL >= Math.abs(at.config.takeProfit)) {
      at.circuitBreakerTripped = true;
      at.circuitBreakerReason = `تم بلوغ هدف الربح اليومي (+$${at.dailyPnL.toFixed(2)})`;
      at.isRunning = false;
    }

    this.emitUserEvent('autotrader_status', this.getAutoTraderStatus(ws.userId), ws.userId);
  }

  // ==================== ISOLATED PER-USER SBAA ENGINE ====================
  public getSbaaStatus(userId: string): SbaaEngineStatus {
    const ws = this.getOrCreateWorkspace(userId);
    const s = ws.sbaa;
    const baseShared = this.sharedSbaaEngine.getStatus();
    const completed = s.wonDemoTrades + s.lostDemoTrades;
    const latest = s.detectionLogs[0] || this.sharedSbaaEngine.getDetectionLogs(1)[0];

    return {
      ...baseShared,
      state: s.state,
      isScanning: s.config.enabled,
      autoDemoEnabled: s.config.autoDemoExecution,
      patternsDetectedCount: s.patternsDetectedCount,
      buySignalsCount: s.buySignalsCount,
      sellSignalsCount: s.sellSignalsCount,
      waitDecisionsCount: s.waitDecisionsCount,
      totalDemoTrades: s.totalDemoTrades,
      wonDemoTrades: s.wonDemoTrades,
      lostDemoTrades: s.lostDemoTrades,
      drawDemoTrades: s.drawDemoTrades,
      winRate: completed > 0 ? Number(((s.wonDemoTrades / completed) * 100).toFixed(1)) : 0,
      todayDemoPnL: Number(s.todayDemoPnL.toFixed(2)),
      latestScore: latest?.confluenceScore ?? baseShared.latestScore,
      latestScoreBreakdown: latest?.scoreBreakdown ?? baseShared.latestScoreBreakdown,
      latestPatternName: latest?.patternNameAr ?? baseShared.latestPatternName,
      latestDecision: latest?.systemDecision ?? baseShared.latestDecision,
      latestReasonAr: latest?.reasonAr ?? baseShared.latestReasonAr,
      isCircuitBreakerTripped: s.isCircuitBreakerTripped,
      circuitBreakerReason: s.circuitBreakerReason,
      lastAnalysisTimestamp: s.lastAnalysisTimestamp,
    };
  }

  public getSbaaLogs(userId: string, limit: number = 100): SbaaDetectionLogRecord[] {
    const ws = this.getOrCreateWorkspace(userId);
    return ws.sbaa.detectionLogs.slice(0, limit);
  }

  public updateSbaaConfig(userId: string, update: Partial<SbaaConfig>): SbaaEngineStatus {
    const ws = this.getOrCreateWorkspace(userId);
    ws.sbaa.config = { ...ws.sbaa.config, ...update };
    ws.updatedAt = new Date().toISOString();
    this.persistNow();
    const status = this.getSbaaStatus(userId);
    this.emitUserEvent('sbaa_update', status, userId);
    return status;
  }

  public resetSbaaStats(userId: string): SbaaEngineStatus {
    const ws = this.getOrCreateWorkspace(userId);
    ws.sbaa.patternsDetectedCount = 0;
    ws.sbaa.buySignalsCount = 0;
    ws.sbaa.sellSignalsCount = 0;
    ws.sbaa.waitDecisionsCount = 0;
    ws.sbaa.totalDemoTrades = 0;
    ws.sbaa.wonDemoTrades = 0;
    ws.sbaa.lostDemoTrades = 0;
    ws.sbaa.drawDemoTrades = 0;
    ws.sbaa.todayDemoPnL = 0;
    ws.sbaa.isCircuitBreakerTripped = false;
    ws.sbaa.circuitBreakerReason = undefined;
    this.persistNow();
    const status = this.getSbaaStatus(userId);
    this.emitUserEvent('sbaa_update', status, userId);
    return status;
  }

  public clearSbaaLogs(userId: string): void {
    const ws = this.getOrCreateWorkspace(userId);
    ws.sbaa.detectionLogs = [];
    this.persistNow();
    this.emitUserEvent('sbaa_update', this.getSbaaStatus(userId), userId);
  }

  public evaluateSbaaForUser(userId: string, asset: string, timeframe: number, candles?: any[]): SbaaDetectionLogRecord {
    const ws = this.getOrCreateWorkspace(userId);
    const log = this.sharedSbaaEngine.evaluateMarket(asset, timeframe, candles, {
      readOnly: true,
      ignoreConnectionGate: true,
    });
    const userLog: SbaaDetectionLogRecord = { ...log };
    ws.sbaa.lastAnalysisTimestamp = Date.now();
    if (userLog.patternType !== 'NO_PATTERN') ws.sbaa.patternsDetectedCount++;
    if (userLog.direction === 'BUY') ws.sbaa.buySignalsCount++;
    else if (userLog.direction === 'SELL') ws.sbaa.sellSignalsCount++;
    else ws.sbaa.waitDecisionsCount++;

    ws.sbaa.detectionLogs.unshift(userLog);
    if (ws.sbaa.detectionLogs.length > 200) ws.sbaa.detectionLogs.pop();
    this.schedulePersist();
    this.emitUserEvent('sbaa_log', userLog, userId);
    this.emitUserEvent('sbaa_update', this.getSbaaStatus(userId), userId);
    return userLog;
  }

  public onMarketClosedCandle(asset: string, timeframe: number): void {
    const log = this.sharedSbaaEngine.evaluateMarket(asset, timeframe, undefined, {
      readOnly: true,
      ignoreConnectionGate: true,
    });

    for (const [userId, ws] of this.workspaces.entries()) {
      if (!ws.sbaa.config.enabled) continue;
      const userLog: SbaaDetectionLogRecord = { ...log, id: `sbaa_${userId.slice(0, 5)}_${Date.now()}` };
      ws.sbaa.lastAnalysisTimestamp = Date.now();
      if (userLog.patternType !== 'NO_PATTERN') ws.sbaa.patternsDetectedCount++;
      if (userLog.direction === 'BUY') ws.sbaa.buySignalsCount++;
      else if (userLog.direction === 'SELL') ws.sbaa.sellSignalsCount++;
      else ws.sbaa.waitDecisionsCount++;

      if (
        ws.sbaa.config.autoDemoExecution &&
        !ws.sbaa.isCircuitBreakerTripped &&
        ws.hasSsd &&
        ws.connectionStatus === 'CONNECTED' &&
        (userLog.systemDecision === 'BUY' || userLog.systemDecision === 'SELL') &&
        userLog.confluenceScore >= (ws.sbaa.config.minScoreThreshold || 80)
      ) {
        const action = userLog.systemDecision === 'BUY' ? 'call' : 'put';
        const res = this.openSimulatedDeal(userId, {
          asset,
          amount: ws.sbaa.config.baseTradeAmount || 10,
          action,
          time: timeframe,
          strategyName: userLog.patternNameAr || 'استراتيجية سبع',
          confluenceScore: userLog.confluenceScore,
          source: 'SBAA',
          sbaaLogId: userLog.id,
        });
        if (res.success && res.deal) {
          userLog.tradeStatus = 'DEMO_OPEN';
          userLog.demoTradeId = res.deal.id;
          userLog.stake = res.deal.amount;
          userLog.entryPrice = res.deal.openPrice;
          ws.sbaa.totalDemoTrades++;
          ws.sbaa.state = 'POSITION_MONITORING';
        }
      }

      ws.sbaa.detectionLogs.unshift(userLog);
      if (ws.sbaa.detectionLogs.length > 200) ws.sbaa.detectionLogs.pop();
      this.emitUserEvent('sbaa_log', userLog, userId);
      this.emitUserEvent('sbaa_update', this.getSbaaStatus(userId), userId);
    }
    this.schedulePersist();
  }

  private onSbaaDealSettled(ws: PersistedUserWorkspace, deal: SimulatedDeal): void {
    const s = ws.sbaa;
    const profit = Number(deal.profit || 0);
    s.todayDemoPnL = Number((s.todayDemoPnL + profit).toFixed(2));
    const logRec = s.detectionLogs.find((l) => l.id === deal.sbaaLogId);

    if (deal.status === 'WON') {
      s.wonDemoTrades++;
      if (logRec) logRec.tradeStatus = 'DEMO_WON';
    } else if (deal.status === 'DRAW') {
      s.drawDemoTrades++;
      if (logRec) logRec.tradeStatus = 'DEMO_DRAW';
    } else {
      s.lostDemoTrades++;
      if (logRec) logRec.tradeStatus = 'DEMO_LOST';
    }
    if (logRec) {
      logRec.profit = profit;
      logRec.exitPrice = deal.closePrice;
    }

    if (s.todayDemoPnL <= -Math.abs(s.config.maxDailyLoss)) {
      s.isCircuitBreakerTripped = true;
      s.circuitBreakerReason = `تجاوز حد الخسارة اليومي (-$${Math.abs(s.todayDemoPnL).toFixed(2)})`;
    } else if (s.todayDemoPnL >= Math.abs(s.config.maxDailyProfitTarget)) {
      s.isCircuitBreakerTripped = true;
      s.circuitBreakerReason = `تحقيق هدف الربح اليومي (+$${s.todayDemoPnL.toFixed(2)})`;
    }
    s.state = 'SCANNING';
    this.emitUserEvent('sbaa_update', this.getSbaaStatus(ws.userId), ws.userId);
  }
}
