import { Router, Request, Response } from 'express';
import { telegramBotService } from '../services/TelegramBotService';
import { adminAuthService } from '../services/AdminAuthService';

function getAdminToken(req: Request): string | null {
  const headerToken = req.headers['x-admin-token'] as string;
  if (headerToken) return headerToken;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export function createTelegramRouter(): Router {
  const router = Router();

  // GET /api/telegram/status
  router.get('/status', (req: Request, res: Response) => {
    try {
      const cfg = telegramBotService.getConfig();
      res.json({
        success: true,
        configured: Boolean(cfg.botToken),
        enabled: cfg.enabled,
        botUsername: cfg.botUsername || '',
        botFirstName: cfg.botFirstName || '',
        chatId: cfg.chatId || '',
        autoBroadcastSignals: cfg.autoBroadcastSignals,
        autoBroadcastTrades: cfg.autoBroadcastTrades !== false,
        displayTimezone: cfg.displayTimezone || '',
        minConfidence: cfg.minConfidence,
        lastTestStatus: cfg.lastTestStatus,
        lastTestMessage: cfg.lastTestMessage,
        lastBroadcastAt: cfg.lastBroadcastAt,
        broadcastCount: cfg.broadcastCount || 0,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Error fetching Telegram status.' });
    }
  });

  // POST /api/telegram/config - Save telegram configuration (Protected by Admin token or password)
  router.post('/config', async (req: Request, res: Response) => {
    try {
      const { botToken, chatId, enabled, autoBroadcastSignals, autoBroadcastTrades, displayTimezone, minConfidence, password, adminToken: bodyAdminToken } = req.body || {};
      const adminToken = getAdminToken(req) || bodyAdminToken;

      let isAuthorized = false;
      if (adminToken && adminAuthService.verifyToken(adminToken)) {
        isAuthorized = true;
      } else if (password && (await adminAuthService.verifyAdminPassword(String(password)))) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        res.status(401).json({ success: false, error: 'Unauthorized. Valid Admin session or password required.' });
        return;
      }

      const updated = telegramBotService.saveConfig({
        ...(botToken !== undefined && String(botToken).trim() ? { botToken: String(botToken).trim() } : {}),
        ...(chatId !== undefined ? { chatId: String(chatId).trim() } : {}),
        ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
        ...(autoBroadcastSignals !== undefined ? { autoBroadcastSignals: Boolean(autoBroadcastSignals) } : {}),
        ...(autoBroadcastTrades !== undefined ? { autoBroadcastTrades: Boolean(autoBroadcastTrades) } : {}),
        ...(displayTimezone !== undefined ? { displayTimezone: String(displayTimezone).trim() } : {}),
        ...(minConfidence !== undefined ? { minConfidence: Math.max(50, Math.min(100, Number(minConfidence))) } : {}),
      });

      if (updated.botToken) {
        await telegramBotService.initBotInfo();
      }

      res.json({ success: true, config: telegramBotService.getConfig() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to update Telegram config.' });
    }
  });

  // POST /api/telegram/test - Test bot connectivity
  router.post('/test', async (req: Request, res: Response) => {
    try {
      const { chatId } = req.body || {};
      const result = await telegramBotService.testConnection(chatId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Failed to execute test.' });
    }
  });

  // POST /api/telegram/broadcast-signal - Manually broadcast a signal
  router.post('/broadcast-signal', async (req: Request, res: Response) => {
    try {
      const { asset, timeframe, type, confidence, price, expirySeconds, strategy, confirmations } = req.body || {};

      if (!asset || !type || !confidence) {
        res.status(400).json({ success: false, error: 'Missing signal parameters.' });
        return;
      }

      const result = await telegramBotService.broadcastTradingSignal({
        asset,
        timeframe: timeframe || 60,
        type,
        confidence: Number(confidence),
        price: price ? Number(price) : undefined,
        expirySeconds: expirySeconds ? Number(expirySeconds) : undefined,
        strategy,
        confirmations: confirmations ? Number(confirmations) : undefined,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Broadcast failed.' });
    }
  });

  // POST /api/telegram/bot-command - Execute command on behalf of user
  router.post('/bot-command', async (req: Request, res: Response) => {
    try {
      const { command, sender } = req.body || {};
      if (!command) {
        res.status(400).json({ success: false, error: 'Command text required.' });
        return;
      }

      const reply = await telegramBotService.handleBotCommand(command, sender || { id: 123456, username: 'trader' });
      res.json({ success: true, reply });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Error processing bot command.' });
    }
  });

  // POST /api/telegram/share-key - Share activation key to Telegram (Admin only)
  router.post('/share-key', async (req: Request, res: Response) => {
    try {
      const { code, durationLabel, maxDevices, expiresAt, targetChatId, adminToken: bodyAdminToken } = req.body || {};
      const adminToken = getAdminToken(req) || bodyAdminToken;
      if (!adminToken || !adminAuthService.verifyToken(adminToken)) {
        res.status(401).json({ success: false, error: 'Unauthorized. Admin authentication required.' });
        return;
      }
      if (!code) {
        res.status(400).json({ success: false, error: 'Code is required.' });
        return;
      }
      if (String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === 'SBAA0000') {
        res.status(403).json({ success: false, error: 'Master administrator key cannot be shared.' });
        return;
      }

      const cfg = telegramBotService.getConfig();
      const botUser = cfg.botUsername || '';
      const deepLink = botUser ? `https://t.me/${botUser}?start=${encodeURIComponent(code)}` : '';

      const messageHtml =
        `<b>🔑 ترخيص تفعيل جديد - SABAA QUANT</b>\n\n` +
        `كود التفعيل: <code>${code}</code>\n` +
        `⏳ <b>المدة:</b> ${durationLabel || 'صلاحية محددة'}\n` +
        `📱 <b>حد الأجهزة:</b> ${maxDevices || 1} أجهزة\n` +
        (expiresAt ? `📅 <b>الانتهاء:</b> ${new Date(expiresAt).toLocaleString()}\n` : '') +
        (deepLink ? `\n🔗 <b>رابط التفعيل المباشر بالبوت:</b>\n<a href="${deepLink}">${deepLink}</a>\n` : '') +
        `\n🌐 <i>للتفعيل عبر الموقع: افتح منصة التداول بالمتصفح وسجّل الدخول بحساب Google أولاً ثم ألصق الكود.</i>`;

      const result = await telegramBotService.sendMessage(messageHtml, targetChatId);
      res.json({
        success: result.success,
        deepLink: deepLink || undefined,
        message: result.success ? 'Key shared to Telegram successfully!' : result.error,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to share key.' });
    }
  });

  // POST /api/telegram/webhook - Official Telegram webhook endpoint
  router.post('/webhook', async (req: Request, res: Response) => {
    try {
      const update = req.body;
      if (update && update.message && update.message.text) {
        const reply = await telegramBotService.handleBotCommand(update.message.text, {
          id: update.message.from?.id || update.message.chat?.id,
          username: update.message.from?.username,
          firstName: update.message.from?.first_name,
        });

        if (reply && update.message.chat && update.message.chat.id) {
          await telegramBotService.sendMessage(reply, String(update.message.chat.id));
        }
      }
      res.status(200).send('OK');
    } catch (err) {
      console.error('[TelegramRouter] Webhook error:', err);
      res.status(200).send('OK'); // Always return 200 to Telegram
    }
  });

  return router;
}
