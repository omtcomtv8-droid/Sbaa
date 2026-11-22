import type { Response } from 'express';
import { CandleBuilder } from '../CandleBuilder';
import { MarketDataStore } from '../MarketDataStore';
import { PocketOptionService } from '../PocketOptionService';
import { StrategyEngine } from '../StrategyEngine';
import { SabaaService } from '../sabaaServices';
import { HistoricalCandleService } from '../HistoricalCandleService';
import { AutoTraderEngine } from '../AutoTraderEngine';
import { SbaaStrategyEngine } from '../sbaa/SbaaStrategyEngine';
import { AccountMode } from '../types';
import { telegramBotService } from './TelegramBotService';

const OWNER_EMAIL = (process.env.ADMIN_OWNER_EMAIL || 'zakurmahmut@gmail.com').trim().toLowerCase();

export interface PublicMarketFeed {
  candleBuilder: CandleBuilder;
  marketDataStore: MarketDataStore;
  otcCandleStore: ReturnType<MarketDataStore['getOTCCandleStore']>;
  strategyEngine: StrategyEngine;
  sabaaService: SabaaService;
  poService: PocketOptionService;
  scannerHistoricalService: HistoricalCandleService;
}

export interface UserWorkspace {
  userId: string;
  userEmail: string;
  isOwner: boolean;
  candleBuilder: CandleBuilder;
  marketDataStore: MarketDataStore;
  otcCandleStore: ReturnType<MarketDataStore['getOTCCandleStore']>;
  strategyEngine: StrategyEngine;
  sabaaService: SabaaService;
  poService: PocketOptionService;
  sbaaEngine: SbaaStrategyEngine;
  autoTraderEngine: AutoTraderEngine;
  sseClients: Response[];
  lastActiveAt: number;
  broadcastSSE: (event: string, data: any) => void;
  getUpstreamGate: () => {
    isAuthVerified: boolean;
    isConnected: boolean;
    waitReason: string | null;
  };
}

export class UserWorkspaceManager {
  private static instance: UserWorkspaceManager;
  private workspaces = new Map<string, UserWorkspace>();
  private publicFeed: PublicMarketFeed | null = null;

  private constructor() {}

  public static getInstance(): UserWorkspaceManager {
    if (!UserWorkspaceManager.instance) {
      UserWorkspaceManager.instance = new UserWorkspaceManager();
    }
    return UserWorkspaceManager.instance;
  }

  public getPublicMarketFeed(): PublicMarketFeed {
    if (this.publicFeed) {
      return this.publicFeed;
    }

    const candleBuilder = new CandleBuilder();
    const marketDataStore = new MarketDataStore('EURUSD_otc', 60);
    const otcCandleStore = marketDataStore.getOTCCandleStore();
    const strategyEngine = new StrategyEngine(candleBuilder, undefined, marketDataStore);
    const sabaaService = new SabaaService();
    const scannerHistoricalService = new HistoricalCandleService();

    const defaultEndpoint = PocketOptionService.cleanEndpoint(
      process.env.PO_ENDPOINT || 'wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket'
    );

    // Public feed NEVER holds any user's SSD credentials
    const poService = new PocketOptionService(
      candleBuilder,
      defaultEndpoint,
      '',
      false,
      'EURUSD_otc',
      60,
      null
    );
    poService.switchAccountMode('REAL');

    const initialCandles = candleBuilder.getCandles('EURUSD_otc', 60);
    if (initialCandles.length > 0) {
      otcCandleStore.loadBrokerCandles('EURUSD_otc', 60, initialCandles);
      marketDataStore.loadHistoricalCandles('EURUSD_otc', 60, initialCandles);
    }

    this.publicFeed = {
      candleBuilder,
      marketDataStore,
      otcCandleStore,
      strategyEngine,
      sabaaService,
      poService,
      scannerHistoricalService,
    };
    return this.publicFeed;
  }

  public getWorkspace(userId: string): UserWorkspace | undefined {
    return this.workspaces.get(userId);
  }

  public getOrCreateWorkspace(userId: string, userEmail?: string): UserWorkspace {
    const cleanId = String(userId || '').trim();
    if (!cleanId) {
      throw new Error('Authenticated userId is required to create a workspace');
    }

    const existing = this.workspaces.get(cleanId);
    if (existing) {
      existing.lastActiveAt = Date.now();
      if (userEmail && !existing.userEmail) {
        existing.userEmail = userEmail.trim().toLowerCase();
        existing.isOwner = existing.userEmail === OWNER_EMAIL;
      }
      return existing;
    }

    const normalizedEmail = (userEmail || '').trim().toLowerCase();
    const isOwner = normalizedEmail === OWNER_EMAIL;

    const candleBuilder = new CandleBuilder();
    const marketDataStore = new MarketDataStore('EURUSD_otc', 60);
    const otcCandleStore = marketDataStore.getOTCCandleStore();
    const strategyEngine = new StrategyEngine(candleBuilder, undefined, marketDataStore);
    const sabaaService = new SabaaService();
    const sseClients: Response[] = [];

    const broadcastSSE = (event: string, data: any) => {
      if (sseClients.length === 0) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (let i = sseClients.length - 1; i >= 0; i--) {
        try {
          sseClients[i].write(payload);
        } catch {
          sseClients.splice(i, 1);
        }
      }
    };

    const defaultMode: AccountMode = 'REAL';
    const defaultEndpoint = PocketOptionService.cleanEndpoint(
      process.env.PO_ENDPOINT || 'wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket'
    );

    // Strictly empty credentials on workspace creation: user must explicitly supply their own SSD
    const poService = new PocketOptionService(
      candleBuilder,
      defaultEndpoint,
      '',
      false,
      'EURUSD_otc',
      60,
      null
    );

    const sbaaEngine = new SbaaStrategyEngine(
      candleBuilder,
      poService,
      marketDataStore,
      broadcastSSE,
      cleanId
    );

    const autoTraderEngine = new AutoTraderEngine(
      strategyEngine,
      poService,
      broadcastSSE,
      sbaaEngine,
      undefined,
      candleBuilder,
      true,
      marketDataStore,
      isOwner ? telegramBotService : undefined,
      cleanId
    );

    marketDataStore.onCandlesLoaded((asset, tf, loadedCandles) => {
      candleBuilder.loadHistoricalCandles(
        asset,
        tf,
        loadedCandles.filter((c) => c.isClosed)
      );
      broadcastSSE('candles_loaded', {
        asset,
        timeframe: tf,
        candles: loadedCandles,
      });
      broadcastSSE('tick', {
        asset,
        timeframe: tf,
        candles: loadedCandles,
        diagnostics: marketDataStore.getDiagnostics(),
      });
    });

    marketDataStore.setBrokerHistoryRequester((asset, tf) => {
      return poService.requestHistoricalCandles(asset, tf);
    });

    poService.onHistoricalCandles((asset, tf, candles) => {
      if (HistoricalCandleService.isOtcAsset(asset)) {
        otcCandleStore.loadBrokerCandles(asset, tf, candles);
      }
      marketDataStore.loadHistoricalCandles(asset, tf, candles);
      candleBuilder.loadHistoricalCandles(asset, tf, candles);
      broadcastSSE('candles_loaded', {
        asset,
        timeframe: tf,
        candles,
      });
    });

    const initialCandles = candleBuilder.getCandles('EURUSD_otc', 60);
    if (initialCandles.length > 0) {
      otcCandleStore.loadBrokerCandles('EURUSD_otc', 60, initialCandles);
      marketDataStore.loadHistoricalCandles('EURUSD_otc', 60, initialCandles);
    }

    poService.switchAccountMode(defaultMode);

    const getUpstreamGate = () => ({
      isAuthVerified: poService.isAuthVerified(),
      isConnected: poService.isConnected(),
      waitReason: poService.getStrategyWaitReason(),
    });

    poService.onTick((tick) => {
      try {
        marketDataStore.processTick(tick.asset, tick.timestamp, tick.price);

        const asset = poService.getActiveAsset();
        const timeframe = poService.getTimeframe();
        let candles = marketDataStore.getCandles(asset, timeframe);
        if (candles.length === 0) {
          candles = marketDataStore.getAllCandles();
        }
        if (candles.length === 0) {
          candles = candleBuilder.getCandles(asset, timeframe);
        }
        const staleInfo = candleBuilder.isStale(
          asset,
          strategyEngine.getSettings().global.maxDataFreshnessSeconds
        );

        sabaaService.updatePositionsMarkToMarket({ [asset]: tick.price });

        const signal = strategyEngine.evaluateLiveTick(asset, timeframe, getUpstreamGate());
        autoTraderEngine.onSignalUpdate(signal);
        const indicators = strategyEngine.calculateIndicators(asset, timeframe);
        const performance = strategyEngine.getPerformanceMetrics();
        const positions = sabaaService.getPositions();

        broadcastSSE('tick', {
          tick,
          candles,
          formingCandle: marketDataStore.getFormingCandle
            ? marketDataStore.getFormingCandle()
            : candleBuilder.getFormingCandle(asset, timeframe),
          signal,
          indicators,
          performance,
          positions,
          freshness: staleInfo.secondsSinceLastTick,
          isStale: staleInfo.isStale,
        });
      } catch (err) {
        console.error(`[Workspace:${cleanId}] Tick handler error:`, err);
      }
    });

    marketDataStore.onCandleClosed((closedCandle, allClosed) => {
      try {
        const asset = marketDataStore.getActiveAsset();
        const timeframe = marketDataStore.getTimeframe();
        candleBuilder.loadHistoricalCandles(asset, timeframe, allClosed);

        const signal = strategyEngine.evaluateClosedCandle(
          asset,
          timeframe,
          closedCandle,
          allClosed,
          getUpstreamGate()
        );
        autoTraderEngine.onSignalUpdate(signal);
        sbaaEngine.evaluateMarket(asset, timeframe);
        const indicators = strategyEngine.calculateIndicators(asset, timeframe);
        const performance = strategyEngine.getPerformanceMetrics();

        broadcastSSE('candle_closed', {
          candle: closedCandle,
          signal,
          indicators,
          performance,
          diagnostics: marketDataStore.getDiagnostics(),
        });

        if (
          isOwner &&
          signal &&
          (signal.type === 'UP' || signal.type === 'DOWN') &&
          signal.status === 'CONFIRMED'
        ) {
          telegramBotService
            .broadcastTradingSignal({
              asset,
              timeframe,
              type: signal.type,
              confidence: signal.confidence,
              price: signal.entryPrice || closedCandle.close,
              expirySeconds: signal.expiryDurationSec || (signal as any).expiryDurationSeconds || 120,
              strategy: signal.strategy,
              confirmations: signal.confirmations,
              reasons: signal.details || [],
              timestamp: signal.timestamp || Date.now(),
            })
            .catch((err) => {
              console.warn('[Workspace] Telegram signal broadcast notice:', err?.message || err);
            });
        }
      } catch (err) {
        console.error(`[Workspace:${cleanId}] onCandleClosed handler error:`, err);
      }
    });

    poService.onStatus((status) => {
      try {
        if (status === 'connected') {
          marketDataStore.setWebSocketStatus('CONNECTED');
        } else if (status === 'connecting' || status === 'reconnecting') {
          marketDataStore.setWebSocketStatus('CONNECTING');
        } else if (status === 'error') {
          marketDataStore.setWebSocketStatus('ERROR');
        } else {
          marketDataStore.setWebSocketStatus('DISCONNECTED');
        }

        broadcastSSE('status', {
          status,
          diagnostics: poService.getDiagnostics(),
          marketStore: marketDataStore.getDiagnostics(),
        });
      } catch (err) {
        console.error(`[Workspace:${cleanId}] Status handler error:`, err);
      }
    });

    poService.onAssetsUpdated((assets) => {
      try {
        broadcastSSE('assets', assets);
      } catch (err) {
        console.error(`[Workspace:${cleanId}] Assets updated broadcast error:`, err);
      }
    });

    poService.onBalanceUpdated((balanceInfo) => {
      try {
        broadcastSSE('balance', balanceInfo);
        broadcastSSE('status', {
          status: poService.getStatus ? poService.getStatus() : 'connected',
          diagnostics: poService.getDiagnostics(),
          marketStore: marketDataStore.getDiagnostics(),
        });
      } catch (err) {
        console.error(`[Workspace:${cleanId}] Balance updated broadcast error:`, err);
      }
    });

    poService.onDealOpened((deal) => {
      try {
        broadcastSSE('deal_opened', deal);
      } catch (err) {
        console.error(`[Workspace:${cleanId}] Deal opened broadcast error:`, err);
      }
    });

    poService.onDealClosed((deal) => {
      try {
        sbaaEngine.handleBrokerDealClosed(deal);
        broadcastSSE('deal_closed', deal);
      } catch (err) {
        console.error(`[Workspace:${cleanId}] Deal closed broadcast error:`, err);
      }
    });

    const workspace: UserWorkspace = {
      userId: cleanId,
      userEmail: normalizedEmail,
      isOwner,
      candleBuilder,
      marketDataStore,
      otcCandleStore,
      strategyEngine,
      sabaaService,
      poService,
      sbaaEngine,
      autoTraderEngine,
      sseClients,
      lastActiveAt: Date.now(),
      broadcastSSE,
      getUpstreamGate,
    };

    this.workspaces.set(cleanId, workspace);
    console.log(`[WorkspaceManager] Created isolated workspace for user ${cleanId}${isOwner ? ' (OWNER)' : ''}`);
    return workspace;
  }

  public disconnectUserWorkspace(userId: string): void {
    const cleanId = String(userId || '').trim();
    if (!cleanId) return;
    const ws = this.workspaces.get(cleanId);
    if (!ws) return;

    try {
      ws.autoTraderEngine.stop();
    } catch {}
    try {
      ws.poService.disconnect();
    } catch {}
    try {
      ws.broadcastSSE('status', {
        status: 'disconnected',
        diagnostics: ws.poService.getDiagnostics(),
        marketStore: ws.marketDataStore.getDiagnostics(),
      });
    } catch {}

    for (const client of [...ws.sseClients]) {
      try {
        client.end();
      } catch {}
    }
    ws.sseClients.length = 0;
  }

  public broadcastLicenseExpired(item: { userId?: string; codeId?: string; reason?: string }): void {
    if (item?.userId) {
      const ws = this.workspaces.get(item.userId);
      if (!ws) return;
      try {
        ws.autoTraderEngine.stop();
      } catch {}
      try {
        ws.poService.disconnect();
      } catch {}
      ws.broadcastSSE('license_expired', item);
      return;
    }

    for (const ws of this.workspaces.values()) {
      ws.broadcastSSE('license_expired', item);
    }
  }

  public getOwnerWorkspace(): UserWorkspace | null {
    for (const ws of this.workspaces.values()) {
      if (ws.isOwner || ws.userEmail === OWNER_EMAIL) {
        return ws;
      }
    }
    return null;
  }

  public getTotalSseClientCount(): number {
    let total = 0;
    for (const ws of this.workspaces.values()) {
      total += ws.sseClients.length;
    }
    return total;
  }

  public getWorkspaceCount(): number {
    return this.workspaces.size;
  }
}

export const workspaceManager = UserWorkspaceManager.getInstance();
