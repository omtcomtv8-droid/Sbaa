import crypto from 'crypto';
import { dbService } from './DatabaseService';
import { AdminAccount } from '../types/authSystemTypes';

interface FailedAttempt {
  count: number;
  lastAttempt: number;
  lockedUntil: number;
}

export class AdminAuthService {
  private static instance: AdminAuthService;
  private failedAttempts = new Map<string, FailedAttempt>();
  private activeSessions = new Map<string, { username: string; expiresAt: number; mustChangePassword: boolean }>();

  private readonly INITIAL_DEFAULT_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'sbaa0000';
  private readonly SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

  private constructor() {
    this.ensureRootAdminAccount();
  }

  public static getInstance(): AdminAuthService {
    if (!AdminAuthService.instance) {
      AdminAuthService.instance = new AdminAuthService();
    }
    return AdminAuthService.instance;
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  private generateSalt(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public async ensureRootAdminAccount(): Promise<void> {
    try {
      const existing = await dbService.getAdmin('admin');
      if (!existing) {
        const salt = this.generateSalt();
        const passwordHash = this.hashPassword(this.INITIAL_DEFAULT_PASSWORD, salt);
        const rootAdmin: AdminAccount = {
          id: 'admin_root',
          username: 'admin',
          passwordHash,
          passwordSalt: salt,
          mustChangePassword: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dbService.saveAdmin(rootAdmin);
        console.log('[AdminAuthService] Initialized root administrator account.');
      }
    } catch (err) {
      console.error('[AdminAuthService] Error setting up root admin:', err);
    }
  }

  private normalizeSecretInput(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .replace(/[٠۰]/g, '0')
      .replace(/[١۱]/g, '1')
      .replace(/[٢۲]/g, '2')
      .replace(/[٣۳]/g, '3')
      .replace(/[٤۴]/g, '4')
      .replace(/[٥۵]/g, '5')
      .replace(/[٦۶]/g, '6')
      .replace(/[٧۷]/g, '7')
      .replace(/[٨۸]/g, '8')
      .replace(/[٩۹]/g, '9')
      .trim();
  }

  private isRateLimited(ip: string): { limited: boolean; retryAfterSeconds?: number } {
    const record = this.failedAttempts.get(ip);
    if (!record) return { limited: false };

    const now = Date.now();
    if (record.lockedUntil > now) {
      return { limited: true, retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
    }
    if (now - record.lastAttempt > 5 * 60 * 1000) {
      this.failedAttempts.delete(ip);
      return { limited: false };
    }
    return { limited: false };
  }

  private recordFailedAttempt(ip: string) {
    const now = Date.now();
    const current = this.failedAttempts.get(ip) || { count: 0, lastAttempt: now, lockedUntil: 0 };
    current.count += 1;
    current.lastAttempt = now;

    if (current.count >= 10) {
      current.lockedUntil = now + 2 * 60 * 1000;
    }
    this.failedAttempts.set(ip, current);
  }

  private clearFailedAttempts(ip: string) {
    this.failedAttempts.delete(ip);
  }

  private matchesPassword(admin: AdminAccount, password: string): boolean {
    const cleanPw = this.normalizeSecretInput(password);
    if (!cleanPw) return false;

    const inputHash = this.hashPassword(cleanPw, admin.passwordSalt);
    try {
      if (
        crypto.timingSafeEqual(
          Buffer.from(inputHash, 'utf8'),
          Buffer.from(admin.passwordHash, 'utf8')
        )
      ) {
        return true;
      }
    } catch {
      // fallback below
    }

    // Allow case-insensitive matching while the default password (sbaa0000) is active
    const defaultHash = this.hashPassword(this.INITIAL_DEFAULT_PASSWORD, admin.passwordSalt);
    const isUsingDefaultPassword =
      admin.mustChangePassword ||
      admin.createdAt === admin.updatedAt ||
      defaultHash === admin.passwordHash;

    if (isUsingDefaultPassword) {
      const lowerHash = this.hashPassword(cleanPw.toLowerCase(), admin.passwordSalt);
      const upperHash = this.hashPassword(cleanPw.toUpperCase(), admin.passwordSalt);
      try {
        if (
          crypto.timingSafeEqual(Buffer.from(lowerHash, 'utf8'), Buffer.from(admin.passwordHash, 'utf8')) ||
          crypto.timingSafeEqual(Buffer.from(upperHash, 'utf8'), Buffer.from(admin.passwordHash, 'utf8'))
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  }

  public async verifyAdminPassword(password: string): Promise<boolean> {
    if (!password) return false;
    const admin = await dbService.getAdmin('admin');
    if (!admin) return false;
    return this.matchesPassword(admin, password);
  }

  public async login(username: string, password: string, ip: string): Promise<{
    success: boolean;
    token?: string;
    mustChangePassword?: boolean;
    expiresAt?: string;
    error?: string;
  }> {
    const rateCheck = this.isRateLimited(ip);
    if (rateCheck.limited) {
      await dbService.addAuditLog({
        action: 'ADMIN_LOGIN_RATE_LIMITED',
        actor: username,
        details: { ip, retryAfter: rateCheck.retryAfterSeconds },
        ipAddress: ip,
      });
      return {
        success: false,
        error: `Too many failed login attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
      };
    }

    const cleanUser = username.trim();
    let admin = await dbService.getAdmin(cleanUser);
    if (!admin) {
      admin = await dbService.getAdmin(cleanUser.toLowerCase());
    }
    if (!admin && (cleanUser.toLowerCase() === 'admin' || cleanUser.toLowerCase() === 'root' || cleanUser.toLowerCase() === 'sbaa')) {
      admin = await dbService.getAdmin('admin');
    }

    if (!admin) {
      this.recordFailedAttempt(ip);
      await dbService.addAuditLog({
        action: 'ADMIN_LOGIN_FAILED',
        actor: username,
        details: { reason: 'User not found', ip },
        ipAddress: ip,
      });
      return { success: false, error: 'Invalid username or password.' };
    }

    const isValid = this.matchesPassword(admin, password);

    if (!isValid) {
      this.recordFailedAttempt(ip);
      await dbService.addAuditLog({
        action: 'ADMIN_LOGIN_FAILED',
        actor: username,
        details: { reason: 'Password mismatch', ip },
        ipAddress: ip,
      });
      return { success: false, error: 'Invalid username or password.' };
    }

    this.clearFailedAttempts(ip);

    const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = Date.now() + this.SESSION_DURATION_MS;
    const sessionData = {
      username: admin.username,
      expiresAt,
      mustChangePassword: admin.mustChangePassword,
    };
    this.activeSessions.set(token, sessionData);
    dbService.saveAdminSession({
      token,
      ...sessionData,
      createdAt: new Date().toISOString(),
    });

    admin.lastLoginAt = new Date().toISOString();
    await dbService.saveAdmin(admin);

    await dbService.addAuditLog({
      action: 'ADMIN_LOGIN_SUCCESS',
      actor: admin.username,
      details: { mustChangePassword: admin.mustChangePassword, ip },
      ipAddress: ip,
    });

    return {
      success: true,
      token,
      mustChangePassword: admin.mustChangePassword,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async changePassword(
    token: string,
    currentPass: string,
    newPass: string,
    ip: string
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.verifySession(token);
    if (!session.valid || !session.username) {
      return { success: false, error: 'Unauthorized: Admin session expired or invalid.' };
    }

    if (!newPass || newPass.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long.' };
    }

    if (newPass.toLowerCase() === this.INITIAL_DEFAULT_PASSWORD.toLowerCase()) {
      return { success: false, error: 'You cannot reuse the default initial password.' };
    }

    const admin = await dbService.getAdmin(session.username);
    if (!admin) {
      return { success: false, error: 'Admin account not found.' };
    }

    if (!this.matchesPassword(admin, currentPass)) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    const newSalt = this.generateSalt();
    admin.passwordHash = this.hashPassword(newPass, newSalt);
    admin.passwordSalt = newSalt;
    admin.mustChangePassword = false;
    admin.updatedAt = new Date().toISOString();

    await dbService.saveAdmin(admin);

    const currentSession = this.activeSessions.get(token) || dbService.getAdminSession(token);
    if (currentSession) {
      const updatedSession = {
        username: currentSession.username,
        expiresAt: currentSession.expiresAt,
        mustChangePassword: false,
      };
      this.activeSessions.set(token, updatedSession);
      dbService.saveAdminSession({
        token,
        ...updatedSession,
        createdAt: new Date().toISOString(),
      });
    }

    await dbService.addAuditLog({
      action: 'ADMIN_PASSWORD_CHANGED',
      actor: admin.username,
      details: { ip },
      ipAddress: ip,
    });

    return { success: true };
  }

  public verifySession(token: string): { valid: boolean; username?: string; mustChangePassword?: boolean } {
    if (!token || typeof token !== 'string') return { valid: false };
    const cleanToken = token.trim();

    let session = this.activeSessions.get(cleanToken);
    if (!session) {
      const persisted = dbService.getAdminSession(cleanToken);
      if (persisted) {
        session = {
          username: persisted.username,
          expiresAt: persisted.expiresAt,
          mustChangePassword: persisted.mustChangePassword,
        };
        this.activeSessions.set(cleanToken, session);
      }
    }

    if (!session) return { valid: false };

    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(cleanToken);
      dbService.deleteAdminSession(cleanToken);
      return { valid: false };
    }

    return {
      valid: true,
      username: session.username,
      mustChangePassword: session.mustChangePassword,
    };
  }

  public verifyToken(token: string): boolean {
    return this.verifySession(token).valid;
  }

  public logout(token: string) {
    if (!token) return;
    this.activeSessions.delete(token);
    dbService.deleteAdminSession(token);
  }

  public createAdminSession(username: string = 'admin'): string {
    const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = Date.now() + this.SESSION_DURATION_MS;
    const sessionData = {
      username,
      expiresAt,
      mustChangePassword: false,
    };
    this.activeSessions.set(token, sessionData);
    dbService.saveAdminSession({
      token,
      ...sessionData,
      createdAt: new Date().toISOString(),
    });
    return token;
  }
}

export const adminAuthService = AdminAuthService.getInstance();
