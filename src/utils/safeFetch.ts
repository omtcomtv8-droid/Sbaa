import { safeStorage } from '../lib/safeStorage';

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  rateLimited: boolean;
  retryAfterSec: number;
  data: T | null;
  error: string | null;
  rawText: string;
}

class AuthHeadersStore {
  private sessionToken: string | null = safeStorage.getLocalItem('sabaa_session_token');
  private deviceToken: string | null = safeStorage.getLocalItem('sabaa_device_token');
  private firebaseIdToken: string | null = null;

  public setAuthTokens(tokens: {
    sessionToken?: string | null;
    deviceToken?: string | null;
    firebaseIdToken?: string | null;
  }): void {
    if (tokens.sessionToken !== undefined) {
      this.sessionToken = tokens.sessionToken || null;
    }
    if (tokens.deviceToken !== undefined) {
      this.deviceToken = tokens.deviceToken || null;
    }
    if (tokens.firebaseIdToken !== undefined) {
      this.firebaseIdToken = tokens.firebaseIdToken || null;
    }
  }

  public clear(): void {
    this.sessionToken = null;
    this.deviceToken = null;
    this.firebaseIdToken = null;
  }

  public getTokens() {
    return {
      sessionToken: this.sessionToken || safeStorage.getLocalItem('sabaa_session_token'),
      deviceToken: this.deviceToken || safeStorage.getLocalItem('sabaa_device_token'),
      firebaseIdToken: this.firebaseIdToken,
    };
  }

  public getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const { sessionToken, deviceToken, firebaseIdToken } = this.getTokens();
    if (sessionToken) headers['x-session-token'] = sessionToken;
    if (deviceToken) headers['x-device-token'] = deviceToken;
    if (firebaseIdToken) headers['x-firebase-id-token'] = firebaseIdToken;
    return headers;
  }
}

export const authHeadersStore = new AuthHeadersStore();

function parseRetryAfterSeconds(res: Response, bodyText: string, parsedData: any): number {
  const fromBody = Number(parsedData?.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;

  const retryHeader = res.headers.get('retry-after');
  if (retryHeader) {
    const asNum = Number(retryHeader);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const asDate = Date.parse(retryHeader);
    if (Number.isFinite(asDate)) {
      const diff = Math.ceil((asDate - Date.now()) / 1000);
      if (diff > 0) return diff;
    }
  }

  if (/rate exceeded/i.test(bodyText)) {
    return 15;
  }
  return 0;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<SafeFetchResult<T>> {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const isApiCall = urlStr.startsWith('/api') || urlStr.includes('/api/');

  const mergedHeaders = new Headers(init.headers || {});
  if (isApiCall) {
    const authHeaders = authHeadersStore.getAuthHeaders();
    for (const [k, v] of Object.entries(authHeaders)) {
      if (!mergedHeaders.has(k)) {
        mergedHeaders.set(k, v);
      }
    }
  }

  try {
    const res = await fetch(input, {
      ...init,
      headers: mergedHeaders,
    });

    const rawText = await res.text();
    let parsed: any = null;
    let parseFailed = false;

    if (rawText && rawText.trim().length > 0) {
      const trimmed = rawText.trim();
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parseFailed = true;
        }
      } else {
        parseFailed = true;
      }
    }

    const rateLimited =
      res.status === 429 ||
      parsed?.errorCode === 'RATE_LIMITED' ||
      /rate exceeded|too many requests/i.test(rawText);

    const retryAfterSec = rateLimited ? parseRetryAfterSeconds(res, rawText, parsed) || 15 : 0;

    if (rateLimited) {
      return {
        ok: false,
        status: res.status || 429,
        rateLimited: true,
        retryAfterSec,
        data: parsed,
        error:
          (parsed && (parsed.error || parsed.message)) ||
          `تم تجاوز حد الطلبات مؤقتاً. يرجى الانتظار ${retryAfterSec} ثانية والمحاولة مجدداً.`,
        rawText,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        rateLimited: false,
        retryAfterSec: 0,
        data: parsed,
        error:
          (parsed && (parsed.error || parsed.message)) ||
          (parseFailed ? `استجابة غير صالحة من الخادم (${res.status})` : `HTTP ${res.status}`),
        rawText,
      };
    }

    if (parseFailed) {
      return {
        ok: false,
        status: res.status,
        rateLimited: false,
        retryAfterSec: 0,
        data: null,
        error: 'استجابة غير متوقعة من الخادم (ليست JSON صالحاً).',
        rawText,
      };
    }

    return {
      ok: true,
      status: res.status,
      rateLimited: false,
      retryAfterSec: 0,
      data: parsed as T,
      error: null,
      rawText,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      rateLimited: false,
      retryAfterSec: 0,
      data: null,
      error: err?.message || 'تعذر الاتصال بالخادم',
      rawText: '',
    };
  }
}
