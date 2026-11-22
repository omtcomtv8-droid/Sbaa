import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { PocketOptionService } from './server/PocketOptionService';
import { AccountMode } from './server/types';
import { HistoricalCandleService } from './server/HistoricalCandleService';
import { createAdminRouter } from './server/routes/adminRoutes';
import { createActivationRouter } from './server/routes/activationRoutes';
import { createTelegramRouter } from './server/routes/telegramRoutes';
import { telegramBotService } from './server/services/TelegramBotService';
import { activationManager } from './server/services/ActivationManager';
import { extractRequestTokens } from './server/utils/authVerifier';
import { workspaceManager, UserWorkspace } from './server/services/UserWorkspaceManager';

// Prevent process crash from unhandled socket drops or transient network rejections
process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]:', reason);
});

async function resolveUserWorkspace(req: Request, res: Response): Promise<UserWorkspace | null> {
  const { sessionToken, deviceToken, firebaseIdToken } = extractRequestTokens(req);

  if (!sessionToken) {
    res.status(401).json({
      success: false,
      ok: false,
      errorCode: 'AUTHENTICATION_REQUIRED',
      error: 'يرجى تسجيل الدخول بحساب Google وتفعيل اشتراكك أولاً.',
    });
    return null;
  }

  const validation = await activationManager.validateUserSession(
    sessionToken,
    deviceToken,
    undefined,
    firebaseIdToken
  );

  if (!validation.valid || !validation.user?.uid) {
    res.status(401).json({
      success: false,
      ok: false,
      errorCode: validation.errorCode || 'SESSION_INVALID',
      error: validation.error || 'انتهت صلاحية الجلسة أو الترخيص. يرجى إعادة تسجيل الدخول.',
    });
    return null;
  }

  return workspaceManager.getOrCreateWorkspace(validation.user.uid, validation.user.email);
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.set('trust proxy', 1);

  // Support large base64 image uploads for chart computer vision analysis
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(cookieParser());

  // Mount Admin, Authentication and Telegram Routes
  app.use('/api/admin', createAdminRouter());
  app.use('/api/auth', createActivationRouter());
  app.use('/api/telegram', createTelegramRouter());

  // Public unauthenticated market feed (no user SSD/credentials/balances ever stored here)
  const publicFeed = workspaceManager.getPublicMarketFeed();

  // Wire Telegram Bot ONLY to the platform owner's workspace if active
  telegramBotService.setPocketOptionService(() => workspaceManager.getOwnerWorkspace()?.poService || null);

  // Automatic server-side license expiration sweep (kicks only the expired user's workspace)
  setInterval(() => {
    activationManager
      .sweepExpiredLicenses()
      .then((expired) => {
        for (const item of expired) {
          workspaceManager.broadcastLicenseExpired(item);
        }
      })
      .catch((err) => {
        console.warn('[SERVER] License sweep error:', err);
      });
  }, 5000);

  // ==================== ISOLATED PER-USER TRADING & TERMINAL API ROUTES ====================

  app.get('/api/status', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const asset = ws.poService.getActiveAsset();
      const timeframe = ws.poService.getTimeframe();
      const signal = ws.strategyEngine.getActiveSignal(asset, timeframe, ws.getUpstreamGate());
      const indicators = ws.strategyEngine.calculateIndicators(asset, timeframe);
      const performance = ws.strategyEngine.getPerformanceMetrics();
      const marketDiagnostics = ws.marketDataStore.getDiagnostics();

      res.json({
        diagnostics: {
          ...ws.poService.getDiagnostics(),
          marketStore: marketDiagnostics,
        },
        marketDiagnostics,
        activeAsset: asset,
        timeframe,
        isAnalyzing: ws.strategyEngine.isAnalyzing(),
        strategySettings: ws.strategyEngine.getSettings(),
        activeSignal: signal,
        indicators,
        performance,
      });
    } catch (err: any) {
      console.error('[API] /api/status error:', err);
      res.status(200).json({
        diagnostics: ws.poService.getDiagnostics(),
        activeAsset: ws.poService.getActiveAsset(),
        timeframe: ws.poService.getTimeframe(),
        isAnalyzing: ws.strategyEngine.isAnalyzing(),
        strategySettings: ws.strategyEngine.getSettings(),
        activeSignal: null,
        indicators: null,
        performance: ws.strategyEngine.getPerformanceMetrics(),
        error: err?.message || 'Status calculation error',
      });
    }
  });

  app.get('/api/assets', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const assets = ws.poService.getAssets();
      res.json(assets || []);
    } catch (err: any) {
      console.error('[API] /api/assets error:', err);
      res.json([]);
    }
  });

  app.get('/api/candles', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const asset = (req.query.asset as string) || ws.poService.getActiveAsset();
      const tf = Number(req.query.timeframe) || ws.poService.getTimeframe();
      let candles = ws.marketDataStore.getCandles(asset, tf);
      if (candles.length === 0 && ws.marketDataStore.getActiveAsset() === asset) {
        candles = ws.marketDataStore.getAllCandles();
      }
      if (candles.length === 0) {
        candles = ws.candleBuilder.getCandles(asset, tf);
      }
      if (candles.length === 0 && HistoricalCandleService.isOtcAsset(asset)) {
        candles = ws.otcCandleStore.getAllCandles(asset, tf);
      }

      if (candles.length < 25) {
        if (HistoricalCandleService.isOtcAsset(asset)) {
          ws.poService.requestHistoricalCandles(asset, tf);
          const otcCandles = ws.otcCandleStore.getAllCandles(asset, tf);
          if (otcCandles.length > 0) {
            candles = otcCandles;
          }
        } else {
          await ws.marketDataStore.initHistoricalData(asset, tf);
          candles = ws.marketDataStore.getCandles(asset, tf);
          if (candles.length === 0) {
            candles = ws.marketDataStore.getAllCandles();
          }
        }
      }

      res.json(candles || []);
    } catch (err: any) {
      console.error('[API] /api/candles error:', err);
      res.json([]);
    }
  });

  app.get('/api/indicators', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const asset = (req.query.asset as string) || ws.poService.getActiveAsset();
      const tf = Number(req.query.timeframe) || ws.poService.getTimeframe();
      const indicators = ws.strategyEngine.calculateIndicators(asset, tf);
      const diagnostics = ws.marketDataStore.getDiagnostics();
      res.json({
        indicators,
        diagnostics,
      });
    } catch (err: any) {
      console.error('[API] /api/indicators error:', err);
      res.status(500).json({ error: err?.message || 'Indicator error' });
    }
  });

  app.get('/api/signals', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const asset = ws.poService.getActiveAsset();
      const timeframe = ws.poService.getTimeframe();
      const activeSignal = ws.strategyEngine.getActiveSignal(asset, timeframe, ws.getUpstreamGate());

      res.json({
        activeSignal,
        history: ws.strategyEngine.getSignalHistory(),
        performance: ws.strategyEngine.getPerformanceMetrics(),
      });
    } catch (err: any) {
      console.error('[API] /api/signals error:', err);
      res.status(200).json({
        activeSignal: null,
        history: ws.strategyEngine.getSignalHistory(),
        performance: ws.strategyEngine.getPerformanceMetrics(),
        error: err?.message || 'Signal generation error',
      });
    }
  });

  app.get('/api/history', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      res.json({
        history: ws.strategyEngine.getSignalHistory(),
        performance: ws.strategyEngine.getPerformanceMetrics(),
      });
    } catch (err: any) {
      console.error('[API] /api/history error:', err);
      res.json({ history: [], performance: ws.strategyEngine.getPerformanceMetrics() });
    }
  });

  app.post('/api/history/clear', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const result = ws.strategyEngine.clearSignalHistory();
      res.json({
        ...result,
        history: [],
        performance: ws.strategyEngine.getPerformanceMetrics(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to clear signal history' });
    }
  });

  app.get('/api/performance', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      res.json(ws.strategyEngine.getPerformanceMetrics());
    } catch (err: any) {
      console.error('[API] /api/performance error:', err);
      res.json({ totalSignals: 0, winRate: 0, profitFactor: 0 });
    }
  });

  app.get('/api/strategies', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const asset = ws.poService.getActiveAsset();
      const timeframe = ws.poService.getTimeframe();
      const signal = ws.strategyEngine.generateSignal(asset, timeframe, ws.getUpstreamGate());
      res.json({
        settings: ws.strategyEngine.getSettings(),
        strategies: signal.strategies || [],
      });
    } catch (err: any) {
      console.error('[API] /api/strategies error:', err);
      res.json({
        settings: ws.strategyEngine.getSettings(),
        strategies: [],
      });
    }
  });

  app.post('/api/strategy/settings', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const settings = req.body;
    if (settings) {
      ws.strategyEngine.updateSettings(settings);
    }
    const asset = ws.poService.getActiveAsset();
    const timeframe = ws.poService.getTimeframe();
    const signal = ws.strategyEngine.generateSignal(asset, timeframe, ws.getUpstreamGate());
    res.json({
      success: true,
      settings: ws.strategyEngine.getSettings(),
      signal,
    });
  });

  app.post('/api/strategy/threshold', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const threshold = Number(req.body.threshold ?? req.body.selectedThreshold);
      if (isNaN(threshold) || threshold < 50 || threshold > 100) {
        return res.status(400).json({ error: 'Threshold must be a number between 50 and 100' });
      }
      ws.strategyEngine.updateSettings({
        selectedThreshold: threshold,
        global: {
          ...ws.strategyEngine.getSettings().global,
          selectedThreshold: threshold,
          minimumSignalConfidence: threshold,
        },
      });
      const asset = ws.poService.getActiveAsset();
      const timeframe = ws.poService.getTimeframe();
      const signal = ws.strategyEngine.generateSignal(asset, timeframe, ws.getUpstreamGate());
      res.json({
        success: true,
        selectedThreshold: threshold,
        settings: ws.strategyEngine.getSettings(),
        signal,
      });
    } catch (err: any) {
      console.error('[API] /api/strategy/threshold error:', err);
      res.status(500).json({ error: err?.message || 'Error updating threshold' });
    }
  });

  app.post('/api/strategy/select', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const { strategy } = req.body;
    ws.strategyEngine.updateSettings({ strategy, selectedStrategy: strategy });
    const asset = ws.poService.getActiveAsset();
    const timeframe = ws.poService.getTimeframe();
    const signal = ws.strategyEngine.generateSignal(asset, timeframe, ws.getUpstreamGate());
    res.json({
      success: true,
      strategy,
      settings: ws.strategyEngine.getSettings(),
      signal,
    });
  });

  // START REAL-TIME ANALYSIS ENGINE
  app.post('/api/analysis/start', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const { asset, timeframe, strategy, enabledStrategies } = req.body;

    if (asset) {
      ws.poService.subscribeAsset(asset, timeframe ? Number(timeframe) : undefined);
    }
    if (strategy) {
      ws.strategyEngine.updateSettings({ strategy, selectedStrategy: strategy });
    }
    if (enabledStrategies) {
      ws.strategyEngine.updateSettings({ enabledStrategies });
    }

    ws.strategyEngine.startAnalysis();

    const activeAsset = ws.poService.getActiveAsset();
    const currentTf = ws.poService.getTimeframe();
    const signal = ws.strategyEngine.generateSignal(activeAsset, currentTf, ws.getUpstreamGate());
    const indicators = ws.strategyEngine.calculateIndicators(activeAsset, currentTf);
    const performance = ws.strategyEngine.getPerformanceMetrics();

    ws.broadcastSSE('analysis', {
      isAnalyzing: true,
      activeAsset,
      timeframe: currentTf,
      signal,
      indicators,
    });

    res.json({
      success: true,
      isAnalyzing: true,
      activeAsset,
      timeframe: currentTf,
      signal,
      indicators,
      performance,
    });
  });

  // STOP REAL-TIME ANALYSIS ENGINE
  app.post('/api/analysis/stop', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    ws.strategyEngine.stopAnalysis();

    const activeAsset = ws.poService.getActiveAsset();
    const currentTf = ws.poService.getTimeframe();
    const signal = ws.strategyEngine.generateSignal(activeAsset, currentTf, ws.getUpstreamGate());
    const indicators = ws.strategyEngine.calculateIndicators(activeAsset, currentTf);

    ws.broadcastSSE('analysis', {
      isAnalyzing: false,
      activeAsset,
      timeframe: currentTf,
      signal,
      indicators,
    });

    res.json({
      success: true,
      isAnalyzing: false,
      signal,
    });
  });

  app.get('/api/analysis/status', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    res.json({
      isAnalyzing: ws.strategyEngine.isAnalyzing(),
      stateMachineState: ws.strategyEngine.getStateMachineState(),
      latestSnapshot: ws.strategyEngine.getLatestCandleSnapshot(),
      activeAsset: ws.poService.getActiveAsset(),
      timeframe: ws.poService.getTimeframe(),
      strategySettings: ws.strategyEngine.getSettings(),
    });
  });

  app.get('/api/analysis/snapshots', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    res.json({
      stateMachineState: ws.strategyEngine.getStateMachineState(),
      latestSnapshot: ws.strategyEngine.getLatestCandleSnapshot(),
      snapshots: ws.strategyEngine.getRecentCandleSnapshots(),
    });
  });

  app.post('/api/analysis/evaluate-dataset', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const { candles, asset, timeframe } = req.body;
      const targetAsset = asset || ws.poService.getActiveAsset();
      const targetTf = Number(timeframe) || ws.poService.getTimeframe();
      const dataset =
        candles && Array.isArray(candles) && candles.length > 0
          ? candles
          : ws.marketDataStore.getClosedCandles().length > 0
          ? ws.marketDataStore.getClosedCandles()
          : ws.candleBuilder.getClosedCandles(targetAsset, targetTf);

      const result = ws.strategyEngine.evaluateCandleDataset(dataset, targetAsset, targetTf);
      res.json({
        success: true,
        asset: targetAsset,
        timeframe: targetTf,
        ...result,
      });
    } catch (err: any) {
      console.error('[API] /api/analysis/evaluate-dataset error:', err);
      res.status(500).json({ error: err?.message || 'Dataset evaluation failed' });
    }
  });

  app.post('/api/subscribe', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const { asset, timeframe } = req.body;
    if (asset) {
      ws.strategyEngine.resetActiveSignal();
      ws.poService.subscribeAsset(asset, timeframe);
      ws.sbaaEngine.setAsset(asset);
      if (!ws.autoTraderEngine.getStatus().isRunning) {
        ws.autoTraderEngine.setAsset(asset);
      }
      ws.marketDataStore.switchAsset(asset, timeframe ? Number(timeframe) : 60).then(() => {
        const closed = ws.marketDataStore.getClosedCandles();
        if (closed.length > 0) {
          ws.candleBuilder.loadHistoricalCandles(asset, timeframe ? Number(timeframe) : 60, closed);
        }
      });
    }
    res.json({ success: true, activeAsset: asset, timeframe });
  });

  app.post('/api/timeframe', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const rawTf = Number(req.body.timeframe);
      const VALID_TIMEFRAMES = [5, 15, 30, 60, 120, 180, 300, 900, 1800, 3600];
      const targetTf = VALID_TIMEFRAMES.includes(rawTf) ? rawTf : rawTf || 60;
      const activeAsset = ws.poService.getActiveAsset();
      const tfLabel =
        targetTf >= 3600
          ? `${Math.round(targetTf / 3600)}H`
          : targetTf >= 60
          ? `${Math.round(targetTf / 60)}M`
          : `${targetTf}s`;

      ws.strategyEngine.resetActiveSignal();
      ws.poService.setTimeframe(targetTf);
      ws.poService.subscribeAsset(activeAsset, targetTf);
      ws.autoTraderEngine.setTimeframe(targetTf);
      ws.sbaaEngine.setTimeframe(targetTf);

      await ws.marketDataStore.switchAsset(activeAsset, targetTf);

      const closed = ws.marketDataStore.getClosedCandles();
      if (closed.length > 0) {
        ws.candleBuilder.loadHistoricalCandles(activeAsset, targetTf, closed);
      }

      ws.broadcastSSE('timeframe_synced', {
        asset: activeAsset,
        timeframe: targetTf,
        timeframeLabel: tfLabel,
      });

      res.json({
        success: true,
        asset: activeAsset,
        timeframe: targetTf,
        timeframeLabel: tfLabel,
        candleCount: closed.length,
      });
    } catch (err: any) {
      console.error('[API] /api/timeframe error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to sync timeframe' });
    }
  });

  app.post('/api/settings', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    let { endpoint, sessionToken, isDemo, uid, settings } = req.body;

    if (typeof endpoint === 'object' && endpoint !== null) {
      sessionToken = endpoint.sessionToken || sessionToken;
      isDemo = endpoint.isDemo !== undefined ? endpoint.isDemo : isDemo;
      uid = endpoint.accountUid || endpoint.uid || uid;
      endpoint = endpoint.endpoint;
    }

    if (settings && typeof settings === 'object') {
      ws.strategyEngine.updateSettings(settings);
    }

    const lockedIsDemo = false;
    ws.marketDataStore.setAccountMode('REAL', ws.poService.getSessionGeneration());

    const safeEndpoint =
      typeof endpoint === 'string' && !endpoint.toLowerCase().includes('demo-api')
        ? endpoint
        : undefined;

    if (safeEndpoint || typeof sessionToken === 'string') {
      ws.poService.updateConfig(
        safeEndpoint,
        typeof sessionToken === 'string' ? sessionToken : undefined,
        lockedIsDemo,
        uid
      );
    }

    res.json({
      success: true,
      strategySettings: ws.strategyEngine.getSettings(),
      diagnostics: ws.poService.getDiagnostics(),
    });
  });

  app.post('/api/strategies/toggle', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const { strategyId, enabled } = req.body;
    if (strategyId) {
      const updateObj: any = {};
      updateObj[strategyId] = { enabled: Boolean(enabled) };
      ws.strategyEngine.updateSettings(updateObj);
    }
    res.json({ success: true, settings: ws.strategyEngine.getSettings() });
  });

  app.post('/api/account/connect', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const { endpoint, sessionToken, isDemo, uid, mode, attemptId, timeoutMs } = req.body;
      if (!sessionToken || typeof sessionToken !== 'string' || !sessionToken.trim()) {
        res.status(400).json({ success: false, ok: false, error: 'Session / SSD token is required' });
        return;
      }

      const effectiveSession = sessionToken.trim();
      const effectiveUid = uid;

      const preParse = PocketOptionService.parseCredentials(
        effectiveSession,
        isDemo === true,
        effectiveUid ? Number(effectiveUid) : undefined
      );

      let determinedMode: AccountMode = 'REAL';
      if (mode === 'REAL') {
        determinedMode = 'REAL';
      } else if (mode === 'DEMO' || isDemo === true || preParse.detectedModeFromPayload === 'DEMO') {
        res.status(400).json({
          success: false,
          ok: false,
          error: 'تم إيقاف الحساب التجريبي (DEMO). يرجى استخدام جلسة الحساب الحقيقي فقط (isDemo=0).',
          errorCode: 'DEMO_DISABLED',
        });
        return;
      }

      const isDemoBool = false;
      const parsed = PocketOptionService.parseCredentials(
        effectiveSession,
        isDemoBool,
        effectiveUid ? Number(effectiveUid) : undefined
      );
      const targetUid = effectiveUid || parsed.uid;

      let targetEndpoint =
        endpoint && typeof endpoint === 'string' && endpoint.trim().length > 0
          ? PocketOptionService.cleanEndpoint(endpoint.trim())
          : undefined;

      if (!targetEndpoint || targetEndpoint.includes('demo-api-')) {
        targetEndpoint = 'wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket';
      }

      console.log(
        `[PO-CONNECT:${ws.userId}] Connecting isolated account: Mode=${determinedMode} (isDemo=${isDemoBool}), PayloadDetected=${preParse.detectedModeFromPayload || 'NONE'}, Endpoint=${targetEndpoint}, UID=${targetUid || 'auto'}`
      );

      const result = await ws.poService.connectWithHandshake({
        sessionToken: effectiveSession,
        isDemo: isDemoBool,
        endpoint: targetEndpoint,
        uid: targetUid,
        attemptId,
        timeoutMs: timeoutMs ? Number(timeoutMs) : 15000,
      });

      ws.marketDataStore.setAccountMode(determinedMode, ws.poService.getSessionGeneration());

      if (result.success) {
        res.json({
          success: true,
          ok: true,
          state: result.state,
          account: result.account,
          balance: result.balance,
          accountMode: result.accountMode,
          isDemo: isDemoBool,
          detectedModeFromPayload: preParse.detectedModeFromPayload,
          diagnostics: result.diagnostics || ws.poService.getDiagnostics(),
          generation: result.generation,
          connectionId: result.connectionId,
        });
      } else {
        res.status(200).json({
          success: false,
          ok: false,
          state: result.state || 'CONNECTION_ERROR',
          error: result.error || 'Connection failed',
          errorCode: result.errorCode || 'UNKNOWN_ERROR',
          diagnostics: result.diagnostics || ws.poService.getDiagnostics(),
          generation: result.generation,
        });
      }
    } catch (err: any) {
      console.error('[API] /api/account/connect error:', err);
      res.status(200).json({
        success: false,
        ok: false,
        error: err?.message || 'Internal connection error',
        errorCode: 'UNKNOWN_ERROR',
        diagnostics: ws.poService.getDiagnostics(),
      });
    }
  });

  app.post('/api/account/switch-mode', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const { mode } = req.body;
    if (mode !== 'REAL') {
      res.status(400).json({
        success: false,
        error: 'تم إيقاف الحساب التجريبي (DEMO). المنصة تعمل بالحساب الحقيقي (REAL) فقط.',
        errorCode: 'DEMO_DISABLED',
      });
      return;
    }
    ws.poService.switchAccountMode('REAL');
    ws.marketDataStore.setAccountMode('REAL', ws.poService.getSessionGeneration());
    res.json({
      success: true,
      mode: 'REAL',
      diagnostics: ws.poService.getDiagnostics(),
    });
  });

  app.post('/api/account/balance/refresh', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    ws.poService.requestBalance();
    res.json({
      success: true,
      message: 'Balance update request dispatched to Pocket Option',
      diagnostics: ws.poService.getDiagnostics(),
    });
  });

  app.post('/api/account/disconnect', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    ws.autoTraderEngine.stop();
    ws.poService.disconnect();
    res.json({
      success: true,
      message: 'Account session disconnected and cleared',
      diagnostics: ws.poService.getDiagnostics(),
    });
  });

  app.post('/api/reconnect', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    ws.poService.reconnectExplicit();
    res.json({
      success: true,
      message: 'Reconnection evaluation initiated',
      diagnostics: ws.poService.getDiagnostics(),
    });
  });

  // Real Pocket Option Deal & Order Execution Routes (strictly per user)
  app.get('/api/orders', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const activeDeals = ws.poService.getActiveDeals();
      const history = ws.poService.getDealsHistory();
      res.json({
        success: true,
        activeDeals,
        history,
        total: activeDeals.length + history.length,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Error fetching orders' });
    }
  });

  app.post('/api/orders', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const { symbol, asset, amount, action, side, time, duration, strategyName, reasons, confluenceScore } = req.body;
      const targetAsset = asset || symbol || ws.poService.getActiveAsset();

      const rawAmount = Number(amount);
      if (isNaN(rawAmount) || rawAmount < 1.0 || rawAmount > 1000.0) {
        return res.status(400).json({
          success: false,
          error: 'مبلغ الصفقة يجب أن يكون بين 1.00$ و 1,000.00$.',
        });
      }

      const targetAmount = Math.round(rawAmount * 100) / 100;

      const currentBalance = ws.poService.getDiagnostics()?.account?.balance;
      if (typeof currentBalance === 'number' && currentBalance > 0 && targetAmount > currentBalance) {
        return res.status(400).json({
          success: false,
          error: `الرصيد المتاح ($${currentBalance.toFixed(2)}) غير كافٍ لفتح صفقة بمبلغ $${targetAmount.toFixed(2)}.`,
        });
      }

      const rawAction = String(action || side || 'call').toLowerCase();
      const targetAction: 'call' | 'put' =
        rawAction === 'sell' || rawAction === 'put' || rawAction === 'down' ? 'put' : 'call';
      const targetTime = Number(time || duration) || ws.poService.getTimeframe() || 60;

      const result = await ws.poService.openDeal({
        asset: targetAsset,
        amount: targetAmount,
        action: targetAction,
        time: targetTime,
        strategyName: strategyName || 'توافق الاستراتيجيات (Confluence Matrix)',
        reasons: Array.isArray(reasons) ? reasons : [],
        confluenceScore: typeof confluenceScore === 'number' ? confluenceScore : 0,
      });

      if (result.success) {
        ws.broadcastSSE('deal_opened', result.deal);
        res.json({
          success: true,
          deal: result.deal,
          message: 'تم فتح الصفقة بنجاح على منصة Pocket Option',
          requestId: result.requestId,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'فشل فتح الصفقة على المنصة',
          requestId: result.requestId,
        });
      }
    } catch (err: any) {
      console.error('[API] /api/orders trade execution error:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'فشل تنفيذ الصفقة بسبب خطأ في الخادم',
      });
    }
  });

  // ==================== STEALTH AUTO-TRADER REST & CONTROL API (ISOLATED PER USER) ====================
  app.get('/api/autotrader/status', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      res.json({ success: true, ...ws.autoTraderEngine.getStatus() });
    } catch (err: any) {
      console.error('[API] /api/autotrader/status error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Status error' });
    }
  });

  app.post('/api/autotrader/start', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const config = { ...req.body, isDemo: false };
    const result = ws.autoTraderEngine.start(config);
    const activeCfg = ws.autoTraderEngine.getStatus().config;
    const syncAsset = activeCfg.asset || ws.poService.getActiveAsset();
    const syncTf = Number(activeCfg.timeframe) || ws.poService.getTimeframe();
    if (syncAsset && syncTf && (syncAsset !== ws.poService.getActiveAsset() || syncTf !== ws.poService.getTimeframe())) {
      ws.poService.setTimeframe(syncTf);
      ws.poService.subscribeAsset(syncAsset, syncTf);
      ws.sbaaEngine.setAsset(syncAsset);
      ws.sbaaEngine.setTimeframe(syncTf);
      ws.marketDataStore.switchAsset(syncAsset, syncTf).catch(() => {});
    }
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/stop', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const result = ws.autoTraderEngine.stop();
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/emergency-stop', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const result = ws.autoTraderEngine.emergencyStop();
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/clear-emergency', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const result = ws.autoTraderEngine.clearEmergencyStop();
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/test-connection', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const testResult = ws.autoTraderEngine.testConnection();
    res.json({ success: testResult.ok, ...testResult });
  });

  app.post('/api/autotrader/save-settings', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const result = ws.autoTraderEngine.saveSettings({ ...req.body, isDemo: false });
    const activeCfg = ws.autoTraderEngine.getStatus().config;
    const syncAsset = activeCfg.asset || ws.poService.getActiveAsset();
    const syncTf = Number(activeCfg.timeframe) || ws.poService.getTimeframe();
    if (syncAsset && syncTf && (syncAsset !== ws.poService.getActiveAsset() || syncTf !== ws.poService.getTimeframe())) {
      ws.poService.setTimeframe(syncTf);
      ws.poService.subscribeAsset(syncAsset, syncTf);
      ws.sbaaEngine.setAsset(syncAsset);
      ws.sbaaEngine.setTimeframe(syncTf);
      ws.marketDataStore.switchAsset(syncAsset, syncTf).catch(() => {});
    }
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/reset-pnl', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const result = ws.autoTraderEngine.resetPnL();
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/clear-trades', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const result = ws.autoTraderEngine.clearTradeList();
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/clear-logs', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    const result = ws.autoTraderEngine.clearLogs();
    res.json({ ...result, status: ws.autoTraderEngine.getStatus() });
  });

  app.post('/api/autotrader/backtest', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const { strategyId, asset, timeframe, stake, payoutRatio } = req.body;
      const targetAsset = asset || ws.poService.getActiveAsset();
      const targetTf = Number(timeframe) || ws.poService.getTimeframe();

      let candles = ws.marketDataStore.getCandles(targetAsset, targetTf);
      if (candles.length === 0 && ws.marketDataStore.getActiveAsset() === targetAsset) {
        candles = ws.marketDataStore.getAllCandles();
      }
      if (candles.length === 0) {
        candles = ws.candleBuilder.getCandles(targetAsset, targetTf);
      }

      const report = ws.autoTraderEngine.runBacktest(
        strategyId || 'confluence',
        candles,
        stake ? Number(stake) : 10,
        payoutRatio ? Number(payoutRatio) : 0.88
      );

      res.json({ success: true, report });
    } catch (err: any) {
      console.error('[API] /api/autotrader/backtest error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Backtest error' });
    }
  });

  app.get('/api/positions', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    res.json(ws.poService.getActiveDeals());
  });

  // ==============================================================
  // SBAA STRATEGY ENGINE API (ISOLATED PER USER)
  // ==============================================================
  app.get('/api/sbaa/status', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      res.json(ws.sbaaEngine.getStatus());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error fetching SBAA status' });
    }
  });

  app.get('/api/sbaa/logs', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const limit = Number(req.query.limit) || 100;
      res.json(ws.sbaaEngine.getDetectionLogs(limit));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error fetching SBAA logs' });
    }
  });

  app.post('/api/sbaa/config', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      ws.sbaaEngine.updateConfig(req.body);
      res.json({ success: true, status: ws.sbaaEngine.getStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/sbaa/toggle', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const { autoDemoExecution, enabled } = req.body;
      const update: any = {};
      if (autoDemoExecution !== undefined) update.autoDemoExecution = Boolean(autoDemoExecution);
      if (enabled !== undefined) update.enabled = Boolean(enabled);
      ws.sbaaEngine.updateConfig(update);
      res.json({ success: true, status: ws.sbaaEngine.getStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/sbaa/reset-stats', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      ws.sbaaEngine.resetStats();
      res.json({ success: true, status: ws.sbaaEngine.getStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/sbaa/clear-logs', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      ws.sbaaEngine.clearLogs();
      res.json({ success: true, logs: [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/sbaa/analyze', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    try {
      const { asset, timeframe, candles } = req.body;
      const targetAsset = asset || ws.poService.getActiveAsset();
      const targetTf = Number(timeframe) || ws.poService.getTimeframe();
      const result = ws.sbaaEngine.evaluateMarket(targetAsset, targetTf, candles);
      res.json({ success: true, result, status: ws.sbaaEngine.getStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'SBAA analysis failed' });
    }
  });

  // Public Market Scanner (read-only spot/market feed, zero user credentials/balance)
  app.get('/api/scanner', async (_req: Request, res: Response) => {
    try {
      const scannerData = await publicFeed.sabaaService.getRealScannerData({
        poService: publicFeed.poService,
        marketDataStore: publicFeed.marketDataStore,
        candleBuilder: publicFeed.candleBuilder,
        strategyEngine: publicFeed.strategyEngine,
        historicalService: publicFeed.scannerHistoricalService,
      });
      res.json(scannerData);
    } catch (err: any) {
      console.error('[API] /api/scanner error:', err);
      res.json([]);
    }
  });

  // Public System Telemetry (unshadowed by /api/admin auth router)
  app.get('/api/telemetry/health', (_req: Request, res: Response) => {
    res.json(publicFeed.sabaaService.getHealthTelemetry(workspaceManager.getTotalSseClientCount(), process.memoryUsage()));
  });

  app.get('/api/telemetry/logs', (_req: Request, res: Response) => {
    res.json(publicFeed.sabaaService.getAuditLogs());
  });

  // Direct APK distribution and in-app update endpoints
  app.get(['/download', '/download/index.html'], (_req: Request, res: Response) => {
    const downloadPage = path.join(process.cwd(), 'public', 'download', 'index.html');
    if (fs.existsSync(downloadPage)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.sendFile(downloadPage);
    }
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>SABAA QUANT - Download</title></head><body style="background:#020617;color:white;text-align:center;padding:50px;font-family:sans-serif;"><h1>SABAA QUANT</h1><p>Android App</p><p><a href="/download/SABAA-AI.apk" style="background:#10b981;color:white;padding:15px 30px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Download APK</a></p></body></html>`);
  });

  const serveApkFile = (req: Request, res: Response, targetFilename?: string) => {
    const requested = targetFilename || req.params.filename || 'SABAA-AI.apk';
    const downloadFilename = requested.endsWith('.apk') ? requested : `${requested}.apk`;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600, no-transform');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const externalUrl = process.env.APK_DOWNLOAD_URL || process.env.EXTERNAL_APK_URL;

    const candidates = [
      path.join(process.cwd(), 'public', 'download', requested),
      path.join(process.cwd(), 'public', 'download', 'SABAA-AI.apk'),
      path.join(process.cwd(), 'public', 'app', requested),
      path.join(process.cwd(), 'public', 'app', 'SABAA-AI.apk'),
      path.join(process.cwd(), 'public', 'app', 'Sabaa-AI-Solution-v1.0.0-release.apk'),
      path.join(process.cwd(), 'public', 'app', 'app-release.apk'),
      path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public', 'download', requested),
      path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public', 'download', 'SABAA-AI.apk'),
      path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public', 'app', requested),
      path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public', 'app', 'Sabaa-AI-Solution-v1.0.0-release.apk'),
      path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public', 'app', 'app-release.apk'),
      path.join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'release', requested),
      path.join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'release', 'Sabaa-AI-Solution-v1.0.0-release.apk'),
      path.join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > 0) {
          res.setHeader('Content-Length', stats.size.toString());

          if (req.method === 'HEAD') {
            return res.status(200).end();
          }
          return res.status(200).sendFile(filePath);
        }
      }
    }

    if (externalUrl) {
      return res.redirect(302, externalUrl);
    }

    return res.redirect(302, '/download');
  };

  app.all('/download/SABAA-AI.apk', (req: Request, res: Response) => {
    serveApkFile(req, res, 'SABAA-AI.apk');
  });

  app.all(['/download/:filename'], (req: Request, res: Response) => {
    serveApkFile(req, res, req.params.filename || 'SABAA-AI.apk');
  });

  app.all(['/app/:filename'], (req: Request, res: Response) => {
    const filename = req.params.filename;
    if (filename === 'version.json') {
      const versionFile = path.join(process.cwd(), 'public', 'app', 'version.json');
      if (fs.existsSync(versionFile)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.sendFile(versionFile);
      }
      return res.json({
        versionName: '1.0.0',
        versionCode: 1,
        apkUrl: '/download/SABAA-AI.apk',
        mandatory: false,
        releaseNotes: 'الإصدار الرسمي لتطبيق SABAA QUANT لمنصة أندرويد',
      });
    }
    serveApkFile(req, res, filename);
  });

  app.get('/app/version.json', (_req: Request, res: Response) => {
    const versionFile = path.join(process.cwd(), 'public', 'app', 'version.json');
    if (fs.existsSync(versionFile)) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(versionFile);
    }
    res.json({
      versionName: '1.0.0',
      versionCode: 1,
      apkUrl: '/download/SABAA-AI.apk',
      mandatory: false,
      releaseNotes: 'الإصدار الرسمي لتطبيق SABAA QUANT لمنصة أندرويد',
    });
  });

  // Server-Sent Events Live Stream (strictly isolated per authenticated user workspace)
  app.get('/api/live', async (req: Request, res: Response) => {
    const ws = await resolveUserWorkspace(req, res);
    if (!ws) return;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    ws.sseClients.push(res);

    const asset = ws.poService.getActiveAsset();
    const timeframe = ws.poService.getTimeframe();
    let candles = ws.marketDataStore.getCandles(asset, timeframe);
    if (candles.length === 0 && ws.marketDataStore.getActiveAsset() === asset) {
      candles = ws.marketDataStore.getAllCandles();
    }
    if (candles.length === 0) {
      candles = ws.candleBuilder.getCandles(asset, timeframe);
    }
    const signal = ws.strategyEngine.generateSignal(asset, timeframe, ws.getUpstreamGate());
    const indicators = ws.strategyEngine.calculateIndicators(asset, timeframe);
    const performance = ws.strategyEngine.getPerformanceMetrics();

    res.write(
      `event: init\ndata: ${JSON.stringify({
        diagnostics: { ...ws.poService.getDiagnostics(), ...ws.marketDataStore.getDiagnostics() },
        candles,
        signal,
        indicators,
        performance,
        positions: ws.sabaaService.getPositions(),
        orders: ws.sabaaService.getOrders(),
        strategySettings: ws.strategyEngine.getSettings(),
        activeAsset: asset,
        timeframe,
      })}\n\n`
    );

    req.on('close', () => {
      const idx = ws.sseClients.indexOf(res);
      if (idx !== -1) ws.sseClients.splice(idx, 1);
    });
  });

  // Ensure any API middleware error (e.g. malformed JSON body) returns clean JSON instead of HTML
  app.use('/api', (err: any, _req: Request, res: Response, _next: any) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({
      success: false,
      error: err?.message || 'Internal server error',
    });
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pocket Option Signal Engine server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
