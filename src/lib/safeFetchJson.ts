import { authFetch } from './installAuthenticatedFetch';

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  rawText: string;
  rateLimited: boolean;
  isNetworkError: boolean;
  errorMessage?: string;
}

export interface SafeFetchOptions extends RequestInit {
  retryOnRateLimit?: boolean;
  maxRetries?: number;
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerVal: string | null, attempt: number, baseDelayMs: number): number {
  if (headerVal) {
    const sec = Number(headerVal);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(Math.max(sec * 1000, 500), 4000);
    }
  }
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, 4000);
}

/**
 * Resilient fetch wrapper that safely reads text before parsing JSON and
 * automatically retries transient HTTP 429 ("Rate exceeded.") / 503 proxy bursts
 * with exponential backoff so plain-text proxy responses never throw SyntaxError.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult<T>> {
  const {
    retryOnRateLimit = true,
    maxRetries = 3,
    baseDelayMs = 650,
    ...fetchInit
  } = options;

  let lastStatus = 0;
  let lastRawText = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await authFetch(url, fetchInit);
      lastStatus = res.status;
      lastRawText = await res.text().catch(() => '');

      const trimmed = lastRawText.trim();
      const isRateText =
        res.status === 429 ||
        /^rate\s*exceeded/i.test(trimmed) ||
        /too\s*many\s*requests/i.test(trimmed);

      const isTransientGateway = res.status === 502 || res.status === 503 || res.status === 504;

      if ((isRateText || isTransientGateway) && retryOnRateLimit && attempt < maxRetries) {
        const waitMs = parseRetryAfterMs(res.headers.get('retry-after'), attempt, baseDelayMs);
        await sleep(waitMs);
        continue;
      }

      let parsed: T | null = null;
      if (trimmed.length > 0 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        try {
          parsed = JSON.parse(trimmed) as T;
        } catch {
          parsed = null;
        }
      }

      if (isRateText) {
        return {
          ok: false,
          status: res.status || 429,
          data: parsed,
          rawText: lastRawText,
          rateLimited: true,
          isNetworkError: false,
          errorMessage:
            (parsed as any)?.error ||
            'تم تجاوز حد الطلبات اللحظي من الخادم (Rate exceeded). يرجى الانتظار ثانيتين ثم المحاولة مجدداً.',
        };
      }

      if (!res.ok) {
        const fallbackError =
          (parsed as any)?.error ||
          (parsed as any)?.message ||
          (trimmed && !trimmed.startsWith('<') ? trimmed.slice(0, 180) : `HTTP ${res.status}`);
        return {
          ok: false,
          status: res.status,
          data: parsed,
          rawText: lastRawText,
          rateLimited: false,
          isNetworkError: false,
          errorMessage: fallbackError,
        };
      }

      if (parsed === null && trimmed.length > 0) {
        return {
          ok: false,
          status: res.status,
          data: null,
          rawText: lastRawText,
          rateLimited: false,
          isNetworkError: false,
          errorMessage: 'استجابة غير متوقعة من الخادم. يرجى إعادة المحاولة.',
        };
      }

      return {
        ok: true,
        status: res.status,
        data: parsed,
        rawText: lastRawText,
        rateLimited: false,
        isNetworkError: false,
      };
    } catch (err: any) {
      if (attempt < maxRetries && retryOnRateLimit) {
        const waitMs = parseRetryAfterMs(null, attempt, baseDelayMs);
        await sleep(waitMs);
        continue;
      }
      return {
        ok: false,
        status: lastStatus,
        data: null,
        rawText: lastRawText,
        rateLimited: false,
        isNetworkError: true,
        errorMessage: err?.message || 'تعذر الاتصال بالخادم. يرجى التحقق من الإنترنت والمحاولة مرة أخرى.',
      };
    }
  }

  return {
    ok: false,
    status: lastStatus || 429,
    data: null,
    rawText: lastRawText,
    rateLimited: lastStatus === 429,
    isNetworkError: false,
    errorMessage: 'تم تجاوز حد الطلبات اللحظي. يرجى الانتظار لحظة ثم المحاولة مجدداً.',
  };
}
