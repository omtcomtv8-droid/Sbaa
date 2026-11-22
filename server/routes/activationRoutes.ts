import { Router, Request, Response } from 'express';
import { ActivationManager } from '../services/ActivationManager';
import { dbService } from '../services/DatabaseService';
import {
  extractRequestTokens,
  resolveAuthenticatedUser,
  verifyFirebaseIdToken,
} from '../utils/authVerifier';
import { encryptSecret, extractSsdMetadata, maskSecret, maskUid } from '../utils/cryptoVault';
import type { UserWorkspaceService } from '../services/UserWorkspaceService';
import { workspaceManager } from '../services/UserWorkspaceManager';

export async function handleSubscriptionStatus(req: Request, res: Response): Promise<void> {
  try {
    const { sessionToken, deviceToken, firebaseIdToken } = extractRequestTokens(req);
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';
    const deviceFingerprint =
      (typeof req.headers['x-device-fingerprint'] === 'string' && req.headers['x-device-fingerprint']) ||
      (typeof req.query.deviceFingerprint === 'string' && req.query.deviceFingerprint) ||
      undefined;

    const manager = ActivationManager.getInstance();

    if (firebaseIdToken) {
      const verified = await verifyFirebaseIdToken(firebaseIdToken);
      if (verified.rateLimited) {
        res.setHeader('Retry-After', String(verified.retryAfterSec || 15));
        res.status(429).json({
          success: false,
          errorCode: 'RATE_LIMITED',
          retryAfterSeconds: verified.retryAfterSec || 15,
          error: 'Rate exceeded. يرجى الانتظار بضع ثوانٍ.',
        });
        return;
      }
      if (verified.ok && verified.user) {
        const subStatus = await manager.getSubscriptionStatus({
          uid: verified.user.uid,
          email: verified.user.email,
          displayName: verified.user.displayName,
          photoURL: verified.user.photoURL,
          sessionToken,
          deviceToken,
          deviceFingerprint,
          ipAddress: ip,
          userAgent,
          firebaseIdToken,
        });
        res.json(subStatus);
        return;
      }
    }

    if (sessionToken) {
      const check = await manager.validateUserSession(sessionToken, deviceToken);
      if (check.valid && check.user) {
        const isUnlimited = Boolean(
          check.activation &&
            (check.activation.id === 'code_master_sbaa0000' || check.activation.code === 'SBAA0000')
        );
        res.json({
          success: true,
          authenticated: true,
          hasActiveSubscription: true,
          hasActiveLicense: true,
          state: 'ACTIVE',
          user: check.user,
          activation: check.activation || null,
          activatedAt: check.activation?.activatedAt || null,
          expiresAt: isUnlimited ? null : (check.expiresAt || check.activation?.expiresAt || null),
          isUnlimited,
          sessionToken,
          deviceToken: check.device?.deviceToken || deviceToken || null,
          serverTime: check.serverTime || new Date().toISOString(),
        });
        return;
      }
      res.json({
        success: true,
        authenticated: false,
        hasActiveSubscription: false,
        hasActiveLicense: false,
        state: check.state || 'NEEDS_ACTIVATION',
        error: check.error,
        serverTime: check.serverTime || new Date().toISOString(),
      });
      return;
    }

    res.status(401).json({
      success: false,
      authenticated: false,
      hasActiveSubscription: false,
      hasActiveLicense: false,
      state: 'UNAUTHENTICATED',
      error: 'يرجى تسجيل الدخول بحساب Google أولاً.',
    });
  } catch (err: any) {
    console.error('[AUTH API] Subscription status error:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Internal subscription check error',
    });
  }
}

export function createActivationRouter(getWorkspaces?: () => UserWorkspaceService | null): Router {
  const router = Router();
  const activationManager = ActivationManager.getInstance();

  router.get('/subscription/status', handleSubscriptionStatus);

  // POST /api/auth/google-session - Step 1: Verify Google account & check existing license
  router.post('/google-session', async (req: Request, res: Response) => {
    try {
      const { idToken, deviceFingerprint, sessionToken, deviceToken } = req.body || {};
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';

      const verified = await verifyFirebaseIdToken(idToken);
      if (verified.rateLimited) {
        res.setHeader('Retry-After', String(verified.retryAfterSec || 15));
        return res.status(429).json({
          success: false,
          hasActiveLicense: false,
          errorCode: 'RATE_LIMITED',
          retryAfterSeconds: verified.retryAfterSec || 15,
          error: 'Rate exceeded.',
        });
      }
      if (!verified.ok || !verified.user) {
        return res.status(401).json({
          success: false,
          hasActiveLicense: false,
          state: 'UNAUTHENTICATED',
          error: verified.error || 'يرجى تسجيل الدخول بحساب Google أولاً.',
        });
      }

      const result = await activationManager.syncGoogleUserAndCheckLicense({
        uid: verified.user.uid,
        email: verified.user.email,
        displayName: verified.user.displayName,
        photoURL: verified.user.photoURL,
        deviceFingerprint,
        sessionToken,
        deviceToken,
        ipAddress: ip,
        userAgent,
        firebaseIdToken: idToken,
      });

      res.json(result);
    } catch (err: any) {
      console.error('[AUTH API] Google session sync error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal authentication error' });
    }
  });

  // POST /api/auth/activate - Step 2: Activate a license code for a verified Google user
  router.post('/activate', async (req: Request, res: Response) => {
    try {
      const { code, rawCode, idToken, deviceFingerprint } = req.body || {};
      const targetCode = code || rawCode;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';

      const verified = await verifyFirebaseIdToken(idToken);
      if (verified.rateLimited) {
        res.setHeader('Retry-After', String(verified.retryAfterSec || 15));
        return res.status(429).json({
          success: false,
          errorCode: 'RATE_LIMITED',
          retryAfterSeconds: verified.retryAfterSec || 15,
          error: 'Rate exceeded.',
        });
      }
      if (!verified.ok || !verified.user) {
        return res.status(401).json({
          success: false,
          error: verified.error || 'يرجى تسجيل الدخول بحساب Google أولاً قبل إدخال كود التفعيل.',
          errorCode: 'GOOGLE_AUTH_REQUIRED',
        });
      }

      const result = await activationManager.activateCode({
        userId: verified.user.uid,
        userEmail: verified.user.email,
        displayName: verified.user.displayName,
        photoURL: verified.user.photoURL,
        rawCode: targetCode,
        deviceFingerprint,
        userAgent,
        ipAddress: ip,
        firebaseIdToken: idToken,
      });

      if (!result.success) {
        if (result.errorCode === 'RATE_LIMITED') {
          const retrySec = result.retryAfterSeconds || 60;
          res.setHeader('Retry-After', String(retrySec));
          return res.status(429).json(result);
        }
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error('[AUTH API] Activation error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal activation error' });
    }
  });

  // POST /api/auth/verify
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const { sessionToken, deviceToken, userId, idToken } = req.body || {};
      const token = sessionToken || req.headers['x-session-token'] || req.cookies?.sabaa_session;
      const firebaseIdToken =
        (typeof idToken === 'string' && idToken) ||
        (req.headers['x-firebase-id-token'] as string) ||
        undefined;

      if (!token) {
        return res.status(401).json({ valid: false, state: 'NEEDS_ACTIVATION', error: 'No session token provided' });
      }

      const result = await activationManager.validateUserSession(
        token as string,
        deviceToken,
        userId,
        firebaseIdToken
      );
      res.json(result);
    } catch (err: any) {
      console.error('[AUTH API] Verify error:', err);
      res.status(500).json({ valid: false, error: err.message || 'Internal verification error' });
    }
  });

  // POST /api/auth/logout
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const { sessionToken, idToken } = req.body || {};
      const token = sessionToken || req.headers['x-session-token'];
      const firebaseIdToken =
        (typeof idToken === 'string' && idToken) ||
        (req.headers['x-firebase-id-token'] as string) ||
        undefined;
      if (token) {
        const session = await dbService.getSession(token as string, firebaseIdToken);
        if (session) {
          session.status = 'REVOKED';
          await dbService.saveSession(session, firebaseIdToken);
          workspaceManager.disconnectUserWorkspace(session.userId);
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET, POST & DELETE /api/auth/credentials - Strictly scoped by server-verified userId, encrypted at rest
  router.get('/credentials', async (req: Request, res: Response) => {
    try {
      const auth = await resolveAuthenticatedUser(req);
      if (!auth.authenticated || !auth.uid) {
        return res.status(auth.statusCode || 401).json({
          success: false,
          error: auth.error || 'Authenticated user session required',
          errorCode: auth.errorCode || 'AUTHENTICATION_REQUIRED',
        });
      }
      const creds = await dbService.getPublicCredentials(auth.uid);
      res.json({ success: true, credentials: creds });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/credentials', async (req: Request, res: Response) => {
    try {
      const auth = await resolveAuthenticatedUser(req);
      if (!auth.authenticated || !auth.uid) {
        return res.status(auth.statusCode || 401).json({
          success: false,
          error: auth.error || 'Authenticated user session required',
          errorCode: auth.errorCode || 'AUTHENTICATION_REQUIRED',
        });
      }

      const uid = auth.uid;
      const { session, sessionToken: bodySessionToken, accountUid, platform, endpoint } = req.body || {};
      const existing = await dbService.getCredentials(uid);
      const rawToken =
        typeof bodySessionToken === 'string' && bodySessionToken !== 'preserved'
          ? bodySessionToken.trim()
          : typeof session === 'string' && session !== 'preserved'
          ? session.trim()
          : '';

      if (!rawToken && !existing) {
        return res.status(400).json({ success: false, error: 'Platform session token is required' });
      }

      const workspaces = getWorkspaces?.() || null;
      if (workspaces) {
        const wsRes = await workspaces.connectSsd({
          userId: uid,
          rawSession: rawToken || 'preserved',
          endpoint: typeof endpoint === 'string' ? endpoint : existing?.endpoint,
          explicitUid: typeof accountUid === 'string' ? accountUid.trim() : undefined,
        });
        if (!wsRes.success) {
          return res.status(400).json({
            success: false,
            error: wsRes.error,
            errorCode: wsRes.errorCode,
          });
        }
        const pub = await dbService.getPublicCredentials(uid);
        return res.json({
          success: true,
          credentials: pub,
          diagnostics: wsRes.diagnostics,
          balance: wsRes.balance,
        });
      }

      const extracted = rawToken ? extractSsdMetadata(rawToken, accountUid) : null;
      const cleanToken = extracted?.cleanSession || '';
      const masked = cleanToken ? maskSecret(cleanToken) : (existing?.sessionTokenMasked || '****');
      const encrypted = cleanToken ? encryptSecret(cleanToken) : existing?.sessionTokenEncrypted;
      const resolvedUid =
        (typeof accountUid === 'string' && accountUid.trim()) ||
        extracted?.accountUid ||
        existing?.accountUid ||
        '';

      const now = new Date().toISOString();
      const record = {
        id: existing?.id || `cred_${uid}`,
        userId: uid,
        platform: platform || existing?.platform || 'pocket_option',
        sessionTokenMasked: masked,
        sessionTokenEncrypted: encrypted,
        hasToken: Boolean(encrypted || (masked && masked !== '****')),
        endpoint: typeof endpoint === 'string' && endpoint.trim() ? endpoint.trim() : existing?.endpoint,
        accountUid: maskUid(resolvedUid) || existing?.accountUid || '****',
        isDemo: true, // Isolated Demo Simulation Account Only
        status: 'CONNECTED' as const,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      await dbService.saveCredentials(record);
      res.json({ success: true, credentials: dbService.toPublicCredentialRecord(record) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/credentials', async (req: Request, res: Response) => {
    try {
      const auth = await resolveAuthenticatedUser(req);
      if (!auth.authenticated || !auth.uid) {
        return res.status(auth.statusCode || 401).json({
          success: false,
          error: auth.error || 'Authenticated user session required',
          errorCode: auth.errorCode || 'AUTHENTICATION_REQUIRED',
        });
      }
      const workspaces = getWorkspaces?.() || null;
      if (workspaces) {
        await workspaces.disconnect(auth.uid, true);
      } else {
        await dbService.deleteCredentials(auth.uid);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
