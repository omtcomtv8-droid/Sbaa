import { Router, Request, Response } from 'express';
import { adminAuthService } from '../services/AdminAuthService';
import { ActivationManager } from '../services/ActivationManager';
import { dbService } from '../services/DatabaseService';

function getAdminToken(req: Request): string | null {
  const headerToken = req.headers['x-admin-token'] as string;
  if (headerToken) return headerToken;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.cookies?.sabaa_admin_token || null;
}

function getFirebaseIdToken(req: Request): string | undefined {
  const headerToken = req.headers['x-firebase-id-token'] as string;
  if (headerToken && headerToken.trim()) return headerToken.trim();
  const bodyToken = req.body?.firebaseIdToken;
  if (typeof bodyToken === 'string' && bodyToken.trim()) return bodyToken.trim();
  return undefined;
}

function requireAdminAuth(req: Request, res: Response, next: () => void) {
  const token = getAdminToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication token required' });
  }
  const session = adminAuthService.verifySession(token);
  if (!session.valid) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin token expired or invalid' });
  }
  (req as any).adminUser = session.username || 'admin';
  (req as any).mustChangePassword = Boolean(session.mustChangePassword);
  next();
}

export function createAdminRouter(): Router {
  const router = Router();
  const activationManager = ActivationManager.getInstance();

  // POST /api/admin/login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username = 'admin', password } = req.body;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';

      if (!password) {
        return res.status(400).json({ success: false, error: 'Password is required' });
      }

      const result = await adminAuthService.login(username, password, ip);
      if (!result.success) {
        return res.status(401).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error('[ADMIN ROUTE] Login error:', err);
      res.status(500).json({ success: false, error: err.message || 'Login failed' });
    }
  });

  // POST /api/admin/change-password
  router.post('/change-password', async (req: Request, res: Response) => {
    try {
      const token = getAdminToken(req);
      if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
      }
      const { currentPassword, newPassword } = req.body;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';

      const result = await adminAuthService.changePassword(token, currentPassword, newPassword, ip);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Protected Routes
  router.use(requireAdminAuth);

  // GET /api/admin/verify
  router.get('/verify', (req: Request, res: Response) => {
    res.json({
      success: true,
      valid: true,
      username: (req as any).adminUser || 'admin',
      mustChangePassword: Boolean((req as any).mustChangePassword),
    });
  });

  // POST /api/admin/logout
  router.post('/logout', (req: Request, res: Response) => {
    const token = getAdminToken(req);
    if (token) {
      adminAuthService.logout(token);
    }
    res.json({ success: true });
  });

  // GET /api/admin/dashboard-stats
  router.get('/dashboard-stats', async (req: Request, res: Response) => {
    try {
      const firebaseIdToken = getFirebaseIdToken(req);
      await activationManager.sweepExpiredLicenses(firebaseIdToken);
      const stats = await activationManager.getDashboardStats(firebaseIdToken);
      res.json({ success: true, stats, cloudConnected: Boolean(firebaseIdToken) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/codes/sync-cloud - Bidirectional sync between container & Firestore
  router.post('/codes/sync-cloud', async (req: Request, res: Response) => {
    try {
      const firebaseIdToken = getFirebaseIdToken(req);
      if (!firebaseIdToken) {
        return res.status(400).json({
          success: false,
          error: 'يرجى تسجيل الدخول بحساب Google المعتمد للمالك لتفعيل المزامنة السحابية.',
        });
      }
      const summary = await dbService.syncCloudStateForAdmin(firebaseIdToken);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/admin/codes
  router.get('/codes', async (req: Request, res: Response) => {
    try {
      const firebaseIdToken = getFirebaseIdToken(req);
      await activationManager.sweepExpiredLicenses(firebaseIdToken);
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || 'ALL';
      let codes = await dbService.getAllActivationCodes(firebaseIdToken);

      if (status && status !== 'ALL') {
        codes = codes.filter((c) => c.status === status);
      }
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        codes = codes.filter(
          (c) =>
            c.code.toLowerCase().includes(query) ||
            (c.boundUserEmail && c.boundUserEmail.toLowerCase().includes(query)) ||
            (c.durationLabel && c.durationLabel.toLowerCase().includes(query))
        );
      }

      res.json({ success: true, codes, cloudConnected: Boolean(firebaseIdToken) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/codes/generate
  router.post('/codes/generate', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { count = 1, durationHours = 720, customHours, exactExpiration, maxDevices = 1, boundUserEmail } = req.body;

      const codes = await activationManager.generateCodes({
        count: Number(count),
        durationHours: Number(durationHours),
        customHours: customHours ? Number(customHours) : undefined,
        exactExpiration,
        maxDevices: Number(maxDevices),
        boundUserEmail,
        createdBy: adminUser,
        firebaseIdToken,
      });

      res.json({ success: true, codes, cloudSynced: Boolean(firebaseIdToken) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/codes/:id/revoke
  router.post('/codes/:id/revoke', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;
      const { reason = 'Revoked from dashboard' } = req.body || {};

      const ok = await activationManager.revokeCode(id, adminUser, reason, undefined, firebaseIdToken);
      if (!ok) {
        return res.status(404).json({ success: false, error: 'Activation code not found.' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/codes/:id/toggle
  router.post('/codes/:id/toggle', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;
      const { enabled } = req.body || {};

      const ok = await activationManager.toggleCode(id, adminUser, Boolean(enabled), firebaseIdToken);
      if (!ok) {
        return res.status(404).json({ success: false, error: 'Activation code not found.' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/codes/:id/unbind
  router.post('/codes/:id/unbind', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;

      const result = await activationManager.unbindCode(id, adminUser, firebaseIdToken);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/admin/codes/:id
  router.delete('/codes/:id', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;

      const result = await activationManager.deleteCode(id, adminUser, firebaseIdToken);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/codes/:id/extend
  router.post('/codes/:id/extend', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;
      const { additionalHours = 24, newExactExpiration } = req.body || {};

      const result = await activationManager.extendCode(
        id,
        adminUser,
        Number(additionalHours),
        newExactExpiration,
        firebaseIdToken
      );
      if (!result.success) {
        return res.status(404).json({ success: false, error: 'Activation code not found.' });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/codes/:id/device-limit
  router.post('/codes/:id/device-limit', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;
      const { maxDevices } = req.body || {};

      const ok = await activationManager.changeDeviceLimit(id, adminUser, Number(maxDevices), firebaseIdToken);
      if (!ok) {
        return res.status(404).json({ success: false, error: 'Activation code not found.' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/admin/users
  router.get('/users', async (req: Request, res: Response) => {
    try {
      const firebaseIdToken = getFirebaseIdToken(req);
      const search = (req.query.search as string) || '';
      let users = await dbService.getAllUsers(firebaseIdToken);
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        users = users.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            u.displayName.toLowerCase().includes(q) ||
            u.uid.toLowerCase().includes(q)
        );
      }
      res.json({ success: true, users });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/users/:id/toggle
  router.post('/users/:id/toggle', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;
      const { active } = req.body || {};

      const ok = await activationManager.toggleUser(id, adminUser, Boolean(active), firebaseIdToken);
      if (!ok) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/admin/devices
  router.get('/devices', async (req: Request, res: Response) => {
    try {
      const firebaseIdToken = getFirebaseIdToken(req);
      const devices = await dbService.getAllDevices(firebaseIdToken);
      res.json({ success: true, devices });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/devices/:id/revoke
  router.post('/devices/:id/revoke', async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser || 'admin';
      const firebaseIdToken = getFirebaseIdToken(req);
      const { id } = req.params;
      const { reason = 'Revoked by admin' } = req.body || {};

      const ok = await activationManager.revokeDevice(id, adminUser, reason, undefined, firebaseIdToken);
      if (!ok) {
        return res.status(404).json({ success: false, error: 'Device not found.' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/admin/logs
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const firebaseIdToken = getFirebaseIdToken(req);
      const limit = Number(req.query.limit) || 100;
      const logs = await dbService.getAuditLogs(limit, firebaseIdToken);
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/admin/system-status
  router.get('/system-status', async (req: Request, res: Response) => {
    try {
      const activeConnections = await dbService.getActiveSessionsCount();
      res.json({
        success: true,
        status: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
          timestamp: new Date().toISOString(),
          activeConnections,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
