import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { activationManager } from '../services/ActivationManager';

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  cachedAt: number;
  expiresAtMs: number;
}

export interface AuthResolutionResult {
  authenticated: boolean;
  statusCode?: 401 | 403;
  uid?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  sessionToken?: string;
  firebaseIdToken?: string;
  sessionValid?: boolean;
  error?: string;
  errorCode?: string;
}

let cachedFirebaseApiKey: string | null = null;
const verifiedTokenCache = new Map<string, VerifiedFirebaseUser>();
const TOKEN_CACHE_TTL_MS = 60_000;

export function getFirebaseApiKey(): string {
  if (cachedFirebaseApiKey) return cachedFirebaseApiKey;
  const envKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';
  if (envKey.trim()) {
    cachedFirebaseApiKey = envKey.trim();
    return cachedFirebaseApiKey;
  }
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cachedFirebaseApiKey = String(cfg?.apiKey || '').trim();
  } catch {
    cachedFirebaseApiKey = '';
  }
  return cachedFirebaseApiKey;
}

function decodeJwtExpiryMs(idToken: string): number {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return Date.now() + TOKEN_CACHE_TTL_MS;
    const payloadJson = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (typeof payload?.exp === 'number' && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    // ignore malformed JWT claims; Identity Toolkit will validate
  }
  return Date.now() + TOKEN_CACHE_TTL_MS;
}

function pruneTokenCache(nowMs: number): void {
  if (verifiedTokenCache.size <= 500) return;
  for (const [k, v] of verifiedTokenCache.entries()) {
    if (nowMs >= v.expiresAtMs || nowMs - v.cachedAt >= TOKEN_CACHE_TTL_MS) {
      verifiedTokenCache.delete(k);
    }
  }
}

export async function verifyFirebaseIdToken(
  idToken?: string | null
): Promise<{ ok: boolean; user?: VerifiedFirebaseUser; rateLimited?: boolean; retryAfterSec?: number; error?: string }> {
  if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
    return { ok: false, error: 'Google ID token is required.' };
  }
  const cleanToken = idToken.trim();
  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
  const nowMs = Date.now();

  const cached = verifiedTokenCache.get(tokenHash);
  if (cached && nowMs - cached.cachedAt < TOKEN_CACHE_TTL_MS && nowMs < cached.expiresAtMs) {
    return { ok: true, user: cached };
  }

  const apiKey = getFirebaseApiKey();
  if (!apiKey) {
    return { ok: false, error: 'Firebase API key is not configured on the server.' };
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: cleanToken }),
      }
    );

    const rawText = await res.text();
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (res.status === 429 || /rate exceeded|quota|too many/i.test(rawText)) {
      const retryHeader = Number(res.headers.get('retry-after') || '15');
      return {
        ok: false,
        rateLimited: true,
        retryAfterSec: Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 15,
        error: 'Rate exceeded.',
      };
    }

    if (!res.ok || !Array.isArray(data?.users) || data.users.length === 0) {
      verifiedTokenCache.delete(tokenHash);
      return {
        ok: false,
        error: data?.error?.message || 'Invalid or expired Google session token.',
      };
    }

    const u = data.users[0];
    if (!u?.localId || !u?.email) {
      return { ok: false, error: 'Google account UID and email are required.' };
    }

    const jwtExpMs = decodeJwtExpiryMs(cleanToken);
    const verifiedUser: VerifiedFirebaseUser = {
      uid: String(u.localId),
      email: String(u.email).toLowerCase(),
      displayName: u.displayName || undefined,
      photoURL: u.photoUrl || undefined,
      cachedAt: nowMs,
      expiresAtMs: Math.min(jwtExpMs, nowMs + TOKEN_CACHE_TTL_MS),
    };

    pruneTokenCache(nowMs);
    verifiedTokenCache.set(tokenHash, verifiedUser);

    return { ok: true, user: verifiedUser };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to verify Google authentication token.' };
  }
}

export function extractRequestTokens(req: Request): {
  sessionToken?: string;
  deviceToken?: string;
  firebaseIdToken?: string;
} {
  const authHeader =
    typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.substring(7).trim()
      : '';

  const headerSession = typeof req.headers['x-session-token'] === 'string' ? req.headers['x-session-token'].trim() : '';
  const cookieSession = typeof req.cookies?.sabaa_session === 'string' ? req.cookies.sabaa_session.trim() : '';
  const querySession = typeof req.query.sessionToken === 'string' ? req.query.sessionToken.trim() : '';
  const bodySession =
    typeof req.body?.authSessionToken === 'string'
      ? req.body.authSessionToken.trim()
      : '';

  let sessionToken = headerSession || cookieSession || querySession || bodySession || undefined;
  if (!sessionToken && authHeader.startsWith('sess_')) {
    sessionToken = authHeader;
  }

  const headerIdToken =
    typeof req.headers['x-firebase-id-token'] === 'string' ? req.headers['x-firebase-id-token'].trim() : '';
  const bodyIdToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
  const queryIdToken = typeof req.query.idToken === 'string' ? req.query.idToken.trim() : '';

  let firebaseIdToken = headerIdToken || bodyIdToken || queryIdToken || undefined;
  if (!firebaseIdToken && authHeader && !authHeader.startsWith('sess_') && !authHeader.startsWith('adm_')) {
    firebaseIdToken = authHeader;
  }

  const deviceToken =
    (typeof req.headers['x-device-token'] === 'string' ? req.headers['x-device-token'].trim() : '') ||
    (typeof req.body?.deviceToken === 'string' ? req.body.deviceToken.trim() : '') ||
    (typeof req.query.deviceToken === 'string' ? req.query.deviceToken.trim() : '') ||
    (typeof req.cookies?.device_token === 'string' ? req.cookies.device_token.trim() : '') ||
    undefined;

  return { sessionToken, deviceToken, firebaseIdToken };
}

/**
 * Strictly resolves the authenticated user from server-verified tokens (sessionToken and/or Firebase ID token).
 * Rejects unverified or mismatched client-supplied uid/userId parameters with HTTP 403.
 */
export async function resolveAuthenticatedUser(req: Request): Promise<AuthResolutionResult> {
  const { sessionToken, deviceToken, firebaseIdToken } = extractRequestTokens(req);

  const explicitUid =
    (typeof req.query.uid === 'string' && req.query.uid.trim()) ||
    (typeof req.query.userId === 'string' && req.query.userId.trim()) ||
    (typeof req.body?.userId === 'string' && req.body.userId.trim()) ||
    '';

  let verifiedUid: string | undefined;
  let verifiedEmail: string | undefined;
  let verifiedDisplayName: string | undefined;
  let verifiedPhotoURL: string | undefined;
  let sessionValid = false;

  if (sessionToken) {
    const check = await activationManager.validateUserSession(
      sessionToken,
      deviceToken,
      undefined,
      firebaseIdToken
    );
    if (check.valid && check.user?.uid) {
      verifiedUid = check.user.uid;
      verifiedEmail = check.user.email;
      verifiedDisplayName = check.user.displayName;
      verifiedPhotoURL = check.user.photoURL;
      sessionValid = true;
    }
  }

  if (firebaseIdToken) {
    const fbCheck = await verifyFirebaseIdToken(firebaseIdToken);
    if (fbCheck.ok && fbCheck.user) {
      if (verifiedUid && verifiedUid !== fbCheck.user.uid) {
        return {
          authenticated: false,
          statusCode: 403,
          error: 'تم رفض الطلب: الجلسة لا تطابق حساب Google المصادق عليه.',
          errorCode: 'UID_MISMATCH',
        };
      }
      verifiedUid = fbCheck.user.uid;
      verifiedEmail = verifiedEmail || fbCheck.user.email;
      verifiedDisplayName = verifiedDisplayName || fbCheck.user.displayName;
      verifiedPhotoURL = verifiedPhotoURL || fbCheck.user.photoURL;
    }
  }

  if (!verifiedUid) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'يرجى تسجيل الدخول بحساب Google وتفعيل اشتراكك أولاً.',
      errorCode: 'AUTHENTICATION_REQUIRED',
    };
  }

  if (explicitUid && explicitUid !== verifiedUid) {
    return {
      authenticated: false,
      statusCode: 403,
      error: 'غير مصرح بالوصول إلى بيانات مستخدم آخر.',
      errorCode: 'UID_MISMATCH',
    };
  }

  return {
    authenticated: true,
    uid: verifiedUid,
    email: verifiedEmail,
    displayName: verifiedDisplayName,
    photoURL: verifiedPhotoURL,
    sessionToken,
    firebaseIdToken,
    sessionValid,
  };
}
