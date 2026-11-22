import { safeStorage } from './safeStorage';
import { authHeadersStore } from '../utils/safeFetch';

let installed = false;

const nativeFetch: typeof window.fetch | null =
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : null;

function isSameOriginApiUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/')) return true;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return url.startsWith(`${window.location.origin}/api/`);
  }
  return false;
}

export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const baseFetch =
    nativeFetch ||
    (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : null);

  if (!baseFetch) {
    return Promise.reject(new Error('Fetch API is unavailable'));
  }

  try {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const isAdminRoute = rawUrl.startsWith('/api/admin/') || rawUrl.includes('/api/admin/');
    if (isSameOriginApiUrl(rawUrl) && !isAdminRoute) {
      const tokens = authHeadersStore.getTokens();
      const sessionToken = tokens.sessionToken || safeStorage.getLocalItem('sabaa_session_token');
      const deviceToken = tokens.deviceToken || safeStorage.getLocalItem('sabaa_device_token');

      if (sessionToken || deviceToken) {
        const baseHeaders =
          input instanceof Request
            ? new Headers(input.headers)
            : new Headers(init?.headers || {});

        if (init?.headers && input instanceof Request) {
          const extra = new Headers(init.headers);
          extra.forEach((value, key) => baseHeaders.set(key, value));
        }

        if (sessionToken && !baseHeaders.has('x-session-token')) {
          baseHeaders.set('x-session-token', sessionToken);
        }
        if (deviceToken && !baseHeaders.has('x-device-token')) {
          baseHeaders.set('x-device-token', deviceToken);
        }

        if (input instanceof Request) {
          const clonedReq = new Request(input, { headers: baseHeaders });
          return baseFetch(clonedReq, init);
        }

        return baseFetch(input, {
          ...init,
          headers: baseHeaders,
        });
      }
    }
  } catch {
    // Fall back cleanly to native fetch
  }

  return baseFetch(input, init);
}

export function installAuthenticatedFetch(): void {
  if (installed || typeof window === 'undefined' || !nativeFetch) {
    return;
  }
  installed = true;

  try {
    const ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (ownDesc && !ownDesc.configurable) {
      // Cannot redefine non-configurable property; components use authFetch/safeFetchJson directly
      return;
    }

    Object.defineProperty(window, 'fetch', {
      value: authFetch,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  } catch {
    // Some WebViews / proxies forbid redefining window.fetch; authFetch handles headers directly
  }
}
