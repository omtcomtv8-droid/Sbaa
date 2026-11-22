import { safeFetchJson } from '../lib/safeFetchJson';

export interface TelegramStatus {
  success: boolean;
  configured: boolean;
  enabled: boolean;
  botUsername: string;
  botFirstName: string;
  chatId: string;
  autoBroadcastSignals: boolean;
  autoBroadcastTrades?: boolean;
  displayTimezone?: string;
  minConfidence: number;
  lastTestStatus?: 'SUCCESS' | 'FAILED' | 'IDLE';
  lastTestMessage?: string;
  lastBroadcastAt?: string;
  broadcastCount?: number;
}

export class TelegramService {
  private static instance: TelegramService;

  private constructor() {}

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  public async getStatus(): Promise<TelegramStatus> {
    const result = await safeFetchJson<TelegramStatus>('/api/telegram/status', {
      retryOnRateLimit: true,
      maxRetries: 2,
    });
    if (result.data) {
      return result.data;
    }
    return {
      success: false,
      configured: false,
      enabled: false,
      botUsername: '',
      botFirstName: '',
      chatId: '',
      autoBroadcastSignals: false,
      autoBroadcastTrades: true,
      minConfidence: 70,
      lastTestStatus: 'FAILED',
      lastTestMessage: result.errorMessage || 'Failed to connect to Telegram service',
    };
  }

  public async updateConfig(params: {
    botToken?: string;
    chatId?: string;
    enabled?: boolean;
    autoBroadcastSignals?: boolean;
    autoBroadcastTrades?: boolean;
    displayTimezone?: string;
    minConfidence?: number;
    password?: string;
    adminToken?: string;
  }): Promise<{ success: boolean; config?: any; error?: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (params.adminToken) {
      headers['x-admin-token'] = params.adminToken;
    }

    const result = await safeFetchJson<{ success: boolean; config?: any; error?: string }>(
      '/api/telegram/config',
      {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        retryOnRateLimit: true,
        maxRetries: 2,
      }
    );
    return result.data || { success: false, error: result.errorMessage || 'Error updating Telegram configuration' };
  }

  public async testConnection(chatId?: string): Promise<{ success: boolean; message: string }> {
    const result = await safeFetchJson<{ success: boolean; message: string }>('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
      retryOnRateLimit: true,
      maxRetries: 2,
    });
    return result.data || { success: false, message: result.errorMessage || 'Failed to send test message' };
  }

  public async shareKeyToTelegram(params: {
    code: string;
    durationLabel?: string;
    maxDevices?: number;
    expiresAt?: string;
    targetChatId?: string;
    adminToken?: string;
  }): Promise<{ success: boolean; deepLink?: string; message?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (params.adminToken) {
      headers['x-admin-token'] = params.adminToken;
    }
    const result = await safeFetchJson<{ success: boolean; deepLink?: string; message?: string }>(
      '/api/telegram/share-key',
      {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        retryOnRateLimit: true,
        maxRetries: 2,
      }
    );
    return result.data || { success: false, message: result.errorMessage || 'Failed to share key' };
  }

  public async broadcastSignal(signal: {
    asset: string;
    timeframe: number | string;
    type: 'UP' | 'DOWN';
    confidence: number;
    price?: number;
    expirySeconds?: number;
    strategy?: string;
    confirmations?: number;
  }): Promise<{ success: boolean; error?: string }> {
    const result = await safeFetchJson<{ success: boolean; error?: string }>(
      '/api/telegram/broadcast-signal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signal),
        retryOnRateLimit: false,
      }
    );
    return result.data || { success: false, error: result.errorMessage || 'Failed to broadcast signal' };
  }
}

export const telegramService = TelegramService.getInstance();
