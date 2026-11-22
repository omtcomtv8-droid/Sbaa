import crypto from 'crypto';
import { dbService } from './DatabaseService';
import { adminAuthService } from './AdminAuthService';
import { normalizeActivationCode } from '../utils/codeNormalizer';
import {
  ActivationCodeRecord,
  CodeStatus,
  DeviceRecord,
  UserRecord,
  UserSessionRecord,
  DashboardStats,
} from '../types/authSystemTypes';

export class ActivationManager {
  private static instance: ActivationManager;

  // Rate limiting for activation attempts per IP/user (max 10 attempts per 10 minutes)
  private activationAttempts = new Map<string, { count: number; lastAttempt: number }>();

  private constructor() {}

  public static getInstance(): ActivationManager {
    if (!ActivationManager.instance) {
      ActivationManager.instance = new ActivationManager();
    }
    return ActivationManager.instance;
  }

  public isMasterAdminCode(code: string): boolean {
    if (!code) return false;
    return normalizeActivationCode(code).isMasterAdmin;
  }

  /**
   * Cryptographically secure activation code generator
   * Formats: SABAA-XXXX-XXXX-XXXX (16 chars alphanumeric)
   */
  public generateSecureCodeString(): string {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 chars
    const chunk1 = raw.substring(0, 4);
    const chunk2 = raw.substring(4, 8);
    const chunk3 = raw.substring(8, 12);
    return `SABAA-${chunk1}-${chunk2}-${chunk3}`;
  }

  public getDurationLabel(hours: number): string {
    if (hours === 1) return '1 Hour (ساعة واحدة)';
    if (hours === 24) return '24 Hours (يوم كامل)';
    if (hours === 168) return '7 Days (أسبوع)';
    if (hours === 720) return '30 Days (شهر واحد)';
    if (hours === 2160) return '90 Days (3 أشهر)';
    if (hours === 4320) return '180 Days (6 أشهر)';
    if (hours === 8760) return '1 Year (سنة كاملة - 365 يوماً)';
    if (hours >= 8760) {
      const years = Math.floor(hours / 8760);
      return `${years} Year${years > 1 ? 's' : ''} (سنة)`;
    }
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} Days (أيام)`;
    }
    return `${hours} Hours (ساعة)`;
  }

  /**
   * Admin generates batch or single activation codes
   */
  public async generateCodes(options: {
    count?: number;
    durationHours?: number;
    customHours?: number;
    exactExpiration?: string;
    maxDevices?: number;
    boundUserEmail?: string;
    boundUserId?: string;
    createdBy?: string;
    firebaseIdToken?: string;
  }): Promise<ActivationCodeRecord[]> {
    const count = Math.min(Math.max(options.count || 1, 1), 100);
    const rawDuration = Number(options.customHours || options.durationHours || 720);
    const durationHours = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 720;
    const maxDevices = Math.min(Math.max(options.maxDevices || 1, 1), 20);
    const createdBy = options.createdBy || 'admin';
    const now = new Date().toISOString();

    const createdCodes: ActivationCodeRecord[] = [];

    for (let i = 0; i < count; i++) {
      const codeStr = this.generateSecureCodeString();
      const codeId = `code_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      let expiresAt: string | null = null;
      if (options.exactExpiration) {
        const parsedExp = new Date(options.exactExpiration);
        if (isNaN(parsedExp.getTime())) {
          throw new Error('تاريخ الانتهاء المحدد غير صالح.');
        }
        expiresAt = parsedExp.toISOString();
      }

      const record: ActivationCodeRecord = {
        id: codeId,
        code: codeStr,
        status: 'UNUSED',
        durationHours,
        durationLabel: options.exactExpiration ? `محدد حتى ${new Date(expiresAt!).toLocaleDateString()}` : this.getDurationLabel(durationHours),
        maxDevices,
        activeDevicesCount: 0,
        boundUserId: options.boundUserId || null,
        boundUserEmail: options.boundUserEmail ? options.boundUserEmail.trim().toLowerCase() : null,
        createdAt: now,
        createdBy,
        updatedAt: now,
        exactExpiration: options.exactExpiration || null,
        expiresAt,
      };

      await dbService.saveActivationCode(record, options.firebaseIdToken);
      createdCodes.push(record);
    }

    await dbService.addAuditLog(
      {
        action: 'CODES_GENERATED',
        actor: createdBy,
        details: {
          count: createdCodes.length,
          durationHours,
          maxDevices,
          exactExpiration: options.exactExpiration || null,
          boundUserEmail: options.boundUserEmail || null,
        },
        ipAddress: 'internal',
      },
      options.firebaseIdToken
    );

    return createdCodes;
  }

  private checkActivationRateLimit(key: string): { limited: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const record = this.activationAttempts.get(key);
    if (!record) {
      this.activationAttempts.set(key, { count: 1, lastAttempt: now });
      return { limited: false, retryAfterSeconds: 0 };
    }
    if (now - record.lastAttempt > windowMs) {
      this.activationAttempts.set(key, { count: 1, lastAttempt: now });
      return { limited: false, retryAfterSeconds: 0 };
    }
    if (record.count >= 10) {
      const remainingMs = Math.max(1000, windowMs - (now - record.lastAttempt));
      return { limited: true, retryAfterSeconds: Math.min(600, Math.ceil(remainingMs / 1000)) };
    }
    record.count += 1;
    record.lastAttempt = now;
    return { limited: false, retryAfterSeconds: 0 };
  }

  /**
   * Synchronizes a verified Google Firebase user and checks whether they already hold an active license
   */
  public async syncGoogleUserAndCheckLicense(params: {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
    deviceFingerprint?: string;
    sessionToken?: string;
    deviceToken?: string;
    ipAddress: string;
    userAgent?: string;
    firebaseIdToken?: string;
  }): Promise<{
    success: boolean;
    hasActiveLicense: boolean;
    state: 'ACTIVE' | 'NEEDS_ACTIVATION' | 'EXPIRED' | 'REVOKED' | 'DEVICE_LIMIT_REACHED';
    user: UserRecord;
    activation?: ActivationCodeRecord;
    sessionToken?: string;
    deviceToken?: string;
    adminToken?: string;
    error?: string;
  }> {
    const nowIso = new Date().toISOString();
    const cleanEmail = (params.email || '').trim().toLowerCase();
    const cleanName = (params.displayName || cleanEmail.split('@')[0] || 'Trader').trim();
    const idToken = params.firebaseIdToken;

    let user = await dbService.getUser(params.uid, idToken);
    if (!user) {
      user = {
        uid: params.uid,
        email: cleanEmail,
        displayName: cleanName,
        ...(params.photoURL ? { photoURL: params.photoURL } : {}),
        role: 'trader',
        status: 'ACTIVE',
        activeActivationId: null,
        activeExpiresAt: null,
        activeCode: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };
    } else {
      user.email = cleanEmail || user.email;
      user.displayName = cleanName || user.displayName;
      if (params.photoURL) user.photoURL = params.photoURL;
      user.lastLoginAt = nowIso;
      user.updatedAt = nowIso;
    }
    await dbService.saveUser(user, idToken);

    if (user.status === 'DISABLED') {
      await dbService.invalidateUserSessions(user.uid, idToken);
      return {
        success: true,
        hasActiveLicense: false,
        state: 'REVOKED',
        user,
        error: 'تم تعطيل هذا الحساب من قِبل المشرف.',
      };
    }

    // 1. Check existing session token if provided & matching this Google user
    let existingExpiredNotice: string | undefined;
    if (params.sessionToken) {
      const existingCheck = await this.validateUserSession(
        params.sessionToken,
        params.deviceToken,
        user.uid,
        idToken
      );
      if (existingCheck.valid && existingCheck.activation && existingCheck.user) {
        return {
          success: true,
          hasActiveLicense: true,
          state: 'ACTIVE',
          user: existingCheck.user,
          activation: existingCheck.activation,
          sessionToken: params.sessionToken,
          deviceToken: existingCheck.device?.deviceToken || params.deviceToken,
        };
      }
      if (existingCheck.state === 'EXPIRED') {
        existingExpiredNotice = existingCheck.error;
      }
    }

    // 2. Look up previously activated license bound to this Google user
    let code: ActivationCodeRecord | null = null;
    if (user.activeCode && user.activeCode !== '••••••••') {
      code = await dbService.getActivationCode(user.activeCode, idToken);
    }
    if (!code && user.activeActivationId) {
      code = await dbService.getActivationCode(user.activeActivationId, idToken);
    }
    if (!code) {
      const allCodes = await dbService.getAllActivationCodes();
      code =
        allCodes.find(
          (c) =>
            c.status === 'ACTIVE' &&
            (c.boundUserId === user!.uid ||
              (c.boundUserEmail && cleanEmail && c.boundUserEmail.toLowerCase() === cleanEmail))
        ) || null;
    }

    if (!code) {
      if (existingExpiredNotice) {
        return {
          success: true,
          hasActiveLicense: false,
          state: 'EXPIRED',
          user,
          error: existingExpiredNotice,
        };
      }
      return {
        success: true,
        hasActiveLicense: false,
        state: 'NEEDS_ACTIVATION',
        user,
      };
    }

    const isUnlimitedCode = code.id === 'code_master_sbaa0000' || code.code === 'SBAA0000';
    if (isUnlimitedCode) {
      code = dbService.ensureMasterCode();
    }

    // Verify code belongs to this user and was already activated (UNUSED codes require explicit code entry)
    if (!isUnlimitedCode && code.status === 'UNUSED') {
      return {
        success: true,
        hasActiveLicense: false,
        state: 'NEEDS_ACTIVATION',
        user,
      };
    }

    if (!isUnlimitedCode && code.boundUserId && code.boundUserId !== user.uid) {
      return {
        success: true,
        hasActiveLicense: false,
        state: 'NEEDS_ACTIVATION',
        user,
      };
    }

    if (!isUnlimitedCode && (code.status === 'REVOKED' || code.status === 'DISABLED')) {
      return {
        success: true,
        hasActiveLicense: false,
        state: 'REVOKED',
        user,
        activation: code,
        error: 'تم تعطيل أو إلغاء كود التفعيل المرتبط بهذا الحساب.',
      };
    }

    const nowMs = Date.now();
    if (!isUnlimitedCode && (code.status === 'EXPIRED' || (code.expiresAt && new Date(code.expiresAt).getTime() <= nowMs))) {
      await this.expireCodeAndSessions(code, nowIso, idToken);
      return {
        success: true,
        hasActiveLicense: false,
        state: 'EXPIRED',
        user,
        activation: code,
        error: 'انتهت صلاحية كود التفعيل الخاص بك. يرجى إدخال كود جديد من غرفة المدير.',
      };
    }

    if (code.status !== 'ACTIVE') {
      return {
        success: true,
        hasActiveLicense: false,
        state: 'NEEDS_ACTIVATION',
        user,
      };
    }

    // Check/register device for this Google user & active code
    const fingerprint =
      params.deviceFingerprint ||
      crypto.createHash('sha256').update(params.userAgent || 'web').digest('hex').substring(0, 32);

    const existingDevices = await dbService.getDevicesByUserAndCode(user.uid, code.id, idToken);
    let matchedDevice = existingDevices.find(
      (d) =>
        d.status === 'ACTIVE' &&
        ((params.deviceToken && d.deviceToken === params.deviceToken) || d.fingerprint === fingerprint)
    );

    let deviceToken = params.deviceToken;
    if (matchedDevice) {
      matchedDevice.lastActiveAt = nowIso;
      matchedDevice.ipAddress = params.ipAddress;
      if (params.userAgent) matchedDevice.userAgent = params.userAgent;
      await dbService.saveDevice(matchedDevice, idToken);
      deviceToken = matchedDevice.deviceToken;
    } else {
      if (!isUnlimitedCode && existingDevices.length >= code.maxDevices) {
        return {
          success: true,
          hasActiveLicense: false,
          state: 'DEVICE_LIMIT_REACHED',
          user,
          activation: code,
          error: `تم الوصول للحد الأقصى للأجهزة (${code.maxDevices}) لهذا الكود.`,
        };
      }

      deviceToken = `dev_${crypto.randomBytes(32).toString('hex')}`;
      const deviceId = `device_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const ua = params.userAgent || '';
      const os = ua.includes('Android')
        ? 'Android'
        : ua.includes('iPhone')
        ? 'iOS'
        : ua.includes('Windows')
        ? 'Windows'
        : ua.includes('Mac')
        ? 'macOS'
        : 'Web Browser';
      const browser = ua.includes('Chrome')
        ? 'Chrome'
        : ua.includes('Safari')
        ? 'Safari'
        : ua.includes('Firefox')
        ? 'Firefox'
        : 'Browser';

      const newDevice: DeviceRecord = {
        id: deviceId,
        deviceId,
        userId: user.uid,
        userEmail: user.email,
        codeId: code.id,
        code: code.code,
        deviceToken,
        fingerprint,
        userAgent: ua || 'Web Client',
        ipAddress: params.ipAddress,
        os,
        browser,
        status: 'ACTIVE',
        createdAt: nowIso,
        lastActiveAt: nowIso,
      };
      await dbService.saveDevice(newDevice, idToken);
      matchedDevice = newDevice;
      const allCodeDevices = await dbService.getDevicesByCode(code.id, idToken);
      code.activeDevicesCount = allCodeDevices.filter((d) => d.status === 'ACTIVE').length;
      await dbService.saveActivationCode(code, idToken);
    }

    const userNeedsSave =
      user.activeActivationId !== code.id ||
      user.activeCode !== code.code ||
      user.activeExpiresAt !== (isUnlimitedCode ? null : (code.expiresAt || null));

    if (userNeedsSave) {
      user.activeActivationId = code.id;
      user.activeCode = code.code;
      user.activeExpiresAt = isUnlimitedCode ? null : (code.expiresAt || null);
      await dbService.saveUser(user, idToken);
    }

    // Reuse existing non-expired ACTIVE session for this user & device so refresh doesn't mint duplicate sessions
    const existingSessions = await dbService.getSessionsByUser(user.uid, idToken);
    const reusableSession = existingSessions.find(
      (s) =>
        s.status === 'ACTIVE' &&
        s.codeId === code!.id &&
        s.deviceToken === deviceToken &&
        (isUnlimitedCode || !s.expiresAt || new Date(s.expiresAt).getTime() > Date.now())
    );

    if (reusableSession) {
      return {
        success: true,
        hasActiveLicense: true,
        state: 'ACTIVE',
        user,
        activation: code,
        sessionToken: reusableSession.sessionToken,
        deviceToken,
      };
    }

    const sessionToken = `sess_${crypto.randomBytes(32).toString('hex')}`;
    const sessionRecord: UserSessionRecord = {
      id: sessionToken,
      sessionToken,
      userId: user.uid,
      userEmail: user.email,
      deviceToken: deviceToken!,
      deviceId: matchedDevice.id,
      codeId: code.id,
      expiresAt: isUnlimitedCode
        ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
        : (code.expiresAt || new Date(Date.now() + Math.max(code.durationHours || 24, 1) * 60 * 60 * 1000).toISOString()),
      status: 'ACTIVE',
      createdAt: nowIso,
      lastSeenAt: nowIso,
    };
    await dbService.saveSession(sessionRecord, idToken);

    return {
      success: true,
      hasActiveLicense: true,
      state: 'ACTIVE',
      user,
      activation: code,
      sessionToken,
      deviceToken,
    };
  }

  /**
   * Non-destructive subscription status check used on page reload & /api/subscription/status
   */
  public async getSubscriptionStatus(params: {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
    sessionToken?: string;
    deviceToken?: string;
    deviceFingerprint?: string;
    ipAddress: string;
    userAgent?: string;
    firebaseIdToken?: string;
  }) {
    const syncRes = await this.syncGoogleUserAndCheckLicense(params);
    const activation = syncRes.activation;
    const isUnlimited = Boolean(
      activation && (activation.id === 'code_master_sbaa0000' || activation.code === 'SBAA0000')
    );

    return {
      success: true,
      authenticated: true,
      hasActiveSubscription: Boolean(syncRes.hasActiveLicense && syncRes.state === 'ACTIVE'),
      hasActiveLicense: Boolean(syncRes.hasActiveLicense && syncRes.state === 'ACTIVE'),
      state: syncRes.state,
      user: syncRes.user,
      activation: activation || null,
      activatedAt: activation?.activatedAt || null,
      expiresAt: isUnlimited ? null : (activation?.expiresAt || syncRes.user?.activeExpiresAt || null),
      isUnlimited,
      sessionToken: syncRes.sessionToken || null,
      deviceToken: syncRes.deviceToken || null,
      serverTime: new Date().toISOString(),
      error: syncRes.error,
    };
  }

  /**
   * User activates a code atomically with device limit validation and Google account binding
   */
  public async activateCode(params: {
    userId: string;
    userEmail: string;
    displayName?: string;
    photoURL?: string;
    rawCode: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipAddress: string;
    firebaseIdToken?: string;
  }): Promise<{
    success: boolean;
    sessionToken?: string;
    deviceToken?: string;
    adminToken?: string;
    codeId?: string;
    code?: string;
    durationLabel?: string;
    user?: UserRecord;
    role?: string;
    expiresAt?: string;
    durationHours?: number;
    maxDevices?: number;
    activeDevicesCount?: number;
    retryAfterSeconds?: number;
    error?: string;
    errorCode?: string;
  }> {
    const {
      userId,
      userEmail,
      displayName,
      photoURL,
      rawCode,
      deviceFingerprint,
      userAgent,
      ipAddress,
      firebaseIdToken,
    } = params;

    if (!rawCode || typeof rawCode !== 'string') {
      return { success: false, error: 'Activation code is required.', errorCode: 'INVALID_INPUT' };
    }

    if (!userId || !userEmail || userEmail === 'trader@sabaa.quant' || userEmail === 'user@sabaa.trader') {
      return {
        success: false,
        error: 'يرجى تسجيل الدخول بحساب Google أولاً قبل إدخال كود التفعيل.',
        errorCode: 'GOOGLE_AUTH_REQUIRED',
      };
    }

    const norm = normalizeActivationCode(rawCode);
    const isMasterAdmin = norm.isMasterAdmin;
    const cleanCode = isMasterAdmin ? 'SBAA0000' : (norm.formatted || norm.cleaned);

    const rateKey = `${ipAddress}_${userId}`;
    const rateStatus = !isMasterAdmin ? this.checkActivationRateLimit(rateKey) : { limited: false, retryAfterSeconds: 0 };
    if (rateStatus.limited) {
      return {
        success: false,
        error: `تم تجاوز الحد المؤقت لمحاولات التفعيل. يرجى الانتظار ${rateStatus.retryAfterSeconds} ثانية والمحاولة مجدداً.`,
        errorCode: 'RATE_LIMITED',
        retryAfterSeconds: rateStatus.retryAfterSeconds,
      };
    }

    return await dbService.withLock(`code_${cleanCode}`, async () => {
      const existingUser = await dbService.getUser(userId, firebaseIdToken);
      if (existingUser && existingUser.status === 'DISABLED') {
        return {
          success: false,
          error: 'تم تعطيل حساب Google هذا بواسطة المشرف.',
          errorCode: 'USER_DISABLED',
        };
      }

      const resolved = await dbService.resolveActivationCode(cleanCode, firebaseIdToken);
      let codeRecord = resolved.record;

      if (isMasterAdmin) {
        codeRecord = dbService.ensureMasterCode();
      }

      if (!codeRecord) {
        if (resolved.permissionDenied) {
          await dbService.addAuditLog(
            {
              action: 'ACTIVATION_REJECTED_ALREADY_USED',
              actor: `user:${userEmail || userId}`,
              details: { reason: 'Cloud code already claimed or bound to another account', code: cleanCode, ip: ipAddress },
              ipAddress,
            },
            firebaseIdToken
          );
          return {
            success: false,
            error: 'تم الاستخدام — تم استخدام هذا الكود مسبقاً أو أنه مخصص لحساب آخر ولا يمكن إعادة استخدامه.',
            errorCode: 'CODE_ALREADY_USED',
          };
        }

        await dbService.addAuditLog(
          {
            action: 'ACTIVATION_FAILED',
            actor: `user:${userEmail || userId}`,
            details: { reason: 'Code not found', code: cleanCode, ip: ipAddress },
            ipAddress,
          },
          firebaseIdToken
        );
        return {
          success: false,
          error: 'كود التفعيل الذي أدخلته غير صالح. يرجى التأكد من الكود الصادر من غرفة المدير والمحاولة مجدداً.',
          errorCode: 'CODE_INVALID',
        };
      }

      const now = new Date();
      let finalExpiresAt: string | null = null;

      if (!isMasterAdmin) {
        if (codeRecord.status === 'REVOKED') {
          return {
            success: false,
            error: 'تم إلغاء كود التفعيل هذا من قِبل المدير.',
            errorCode: 'CODE_REVOKED',
          };
        }
        if (codeRecord.status === 'DISABLED') {
          return {
            success: false,
            error: 'كود التفعيل هذا معطل حالياً من قِبل المدير.',
            errorCode: 'CODE_DISABLED',
          };
        }

        // Strict expiry check before reuse check
        const expiredByDate =
          codeRecord.status === 'EXPIRED' ||
          (codeRecord.expiresAt && new Date(codeRecord.expiresAt).getTime() <= now.getTime()) ||
          (codeRecord.exactExpiration && new Date(codeRecord.exactExpiration).getTime() <= now.getTime());

        if (expiredByDate) {
          await this.expireCodeAndSessions(codeRecord, now.toISOString(), firebaseIdToken);
          await dbService.addAuditLog(
            {
              action: 'ACTIVATION_REJECTED_ALREADY_USED',
              actor: `user:${userEmail}`,
              details: { reason: 'Code already used and expired', code: codeRecord.code, ip: ipAddress },
              ipAddress,
            },
            firebaseIdToken
          );
          return {
            success: false,
            error: 'تم الاستخدام — تم استخدام هذا الكود مسبقاً وانتهت صلاحيته. لا يمكن إعادة استخدام الكود، يرجى طلب كود جديد من غرفة المدير.',
            errorCode: 'CODE_ALREADY_USED',
          };
        }

        const alreadyOwnedActiveBySameUser =
          codeRecord.status === 'ACTIVE' &&
          codeRecord.boundUserId === userId &&
          (!codeRecord.expiresAt || new Date(codeRecord.expiresAt).getTime() > now.getTime());

        // Enforce strict one-time redemption for other users, while staying idempotent for the SAME owner
        if (!alreadyOwnedActiveBySameUser && (codeRecord.status !== 'UNUSED' || Boolean(codeRecord.activatedAt))) {
          await dbService.addAuditLog(
            {
              action: 'ACTIVATION_REJECTED_ALREADY_USED',
              actor: `user:${userEmail}`,
              details: {
                reason: 'Code already redeemed',
                code: codeRecord.code,
                status: codeRecord.status,
                boundTo: codeRecord.boundUserEmail,
                ip: ipAddress,
              },
              ipAddress,
            },
            firebaseIdToken
          );
          return {
            success: false,
            error: 'تم الاستخدام — تم استخدام هذا الكود مسبقاً ولا يمكن إعادة استخدامه مرة أخرى.',
            errorCode: 'CODE_ALREADY_USED',
          };
        }

        if (codeRecord.boundUserId && codeRecord.boundUserId !== userId) {
          await dbService.addAuditLog({
            action: 'ACTIVATION_FAILED',
            actor: `user:${userEmail}`,
            details: { reason: 'Code bound to different user', boundTo: codeRecord.boundUserEmail, ip: ipAddress },
            ipAddress,
          });
          return {
            success: false,
            error: `هذا الكود مخصص مسبقاً لحساب Google آخر (${codeRecord.boundUserEmail || 'حساب مختلف'}).`,
            errorCode: 'CODE_BOUND_TO_OTHER',
          };
        }

        if (codeRecord.boundUserEmail && codeRecord.boundUserEmail.toLowerCase() !== userEmail.toLowerCase()) {
          return {
            success: false,
            error: `تم إصدار هذا الكود حصرياً لحساب ${codeRecord.boundUserEmail}.`,
            errorCode: 'CODE_EMAIL_MISMATCH',
          };
        }

        // Preserve original expiresAt on idempotent repeat call by same user; compute once on initial activation
        if (alreadyOwnedActiveBySameUser && codeRecord.expiresAt) {
          finalExpiresAt = codeRecord.expiresAt;
        } else if (codeRecord.exactExpiration) {
          finalExpiresAt = new Date(codeRecord.exactExpiration).toISOString();
        } else {
          const hours = codeRecord.durationHours && codeRecord.durationHours > 0 ? codeRecord.durationHours : 24;
          finalExpiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
        }
      } else {
        // ONLY SBAA0000: Always open, lifetime unlimited duration (no expiry)
        codeRecord.status = 'ACTIVE';
        codeRecord.durationHours = 0;
        codeRecord.durationLabel = 'دائم • وقت لا محدود (Unlimited)';
        codeRecord.maxDevices = 999999;
        codeRecord.boundUserId = null;
        codeRecord.boundUserEmail = null;
        codeRecord.expiresAt = null;
        codeRecord.exactExpiration = null;
        finalExpiresAt = null;
      }

      const fingerprint = deviceFingerprint || crypto.createHash('sha256').update(userAgent || 'web').digest('hex').substring(0, 32);
      const existingDevices = await dbService.getDevicesByUserAndCode(userId, codeRecord.id, firebaseIdToken);

      let matchedDevice = existingDevices.find((d) => d.fingerprint === fingerprint && d.status === 'ACTIVE');
      let deviceToken: string;

      if (matchedDevice) {
        matchedDevice.lastActiveAt = now.toISOString();
        matchedDevice.ipAddress = ipAddress;
        if (userAgent) matchedDevice.userAgent = userAgent;
        await dbService.saveDevice(matchedDevice, firebaseIdToken);
        deviceToken = matchedDevice.deviceToken;
      } else {
        const activeCount = existingDevices.length;
        if (!isMasterAdmin && activeCount >= codeRecord.maxDevices) {
          await dbService.addAuditLog(
            {
              action: 'DEVICE_LIMIT_REACHED',
              actor: `user:${userEmail}`,
              details: {
                code: codeRecord.code,
                maxDevices: codeRecord.maxDevices,
                activeCount,
                fingerprint,
                ip: ipAddress,
              },
              ipAddress,
            },
            firebaseIdToken
          );
          return {
            success: false,
            error: `تم الوصول للحد الأقصى للأجهزة المسموحة (${codeRecord.maxDevices}) لهذا الكود.`,
            errorCode: 'DEVICE_LIMIT_REACHED',
            maxDevices: codeRecord.maxDevices,
            activeDevicesCount: activeCount,
          };
        }

        deviceToken = `dev_${crypto.randomBytes(32).toString('hex')}`;
        const deviceId = `device_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const os = (userAgent || '').includes('Android') ? 'Android' : (userAgent || '').includes('iPhone') ? 'iOS' : (userAgent || '').includes('Windows') ? 'Windows' : (userAgent || '').includes('Mac') ? 'macOS' : 'Web Browser';
        const browser = (userAgent || '').includes('Chrome') ? 'Chrome' : (userAgent || '').includes('Safari') ? 'Safari' : (userAgent || '').includes('Firefox') ? 'Firefox' : 'Browser';

        const newDevice: DeviceRecord = {
          id: deviceId,
          deviceId,
          userId,
          userEmail,
          codeId: codeRecord.id,
          code: codeRecord.code,
          deviceToken,
          fingerprint,
          userAgent: userAgent || 'Web Client',
          ipAddress,
          os,
          browser,
          status: 'ACTIVE',
          createdAt: now.toISOString(),
          lastActiveAt: now.toISOString(),
        };

        await dbService.saveDevice(newDevice, firebaseIdToken);
        existingDevices.push(newDevice);
      }

      codeRecord.status = 'ACTIVE';
      if (!isMasterAdmin) {
        codeRecord.boundUserId = userId;
        codeRecord.boundUserEmail = userEmail.toLowerCase();
        codeRecord.expiresAt = finalExpiresAt;
        codeRecord.activeDevicesCount = existingDevices.filter((d) => d.status === 'ACTIVE').length;
      } else {
        // Keep SBAA0000 unbound so anyone can use it with unlimited duration
        codeRecord.boundUserId = null;
        codeRecord.boundUserEmail = null;
        codeRecord.expiresAt = null;
        const allMasterDevices = await dbService.getDevicesByCode(codeRecord.id);
        codeRecord.activeDevicesCount = allMasterDevices.filter((d) => d.status === 'ACTIVE').length;
      }
      codeRecord.activatedAt = codeRecord.activatedAt || now.toISOString();
      codeRecord.lastUsageAt = now.toISOString();
      codeRecord.updatedAt = now.toISOString();

      const codeSaveRes = await dbService.saveActivationCode(
        codeRecord,
        firebaseIdToken,
        !isMasterAdmin ? resolved.updateTime : undefined
      );

      if (!codeSaveRes.ok && codeSaveRes.conflict) {
        return {
          success: false,
          error: 'تم الاستخدام — تم تفعيل هذا الكود للتو على جهاز آخر ولا يمكن إعادة استخدامه.',
          errorCode: 'CODE_ALREADY_USED',
        };
      }

      let userRecord = existingUser;
      const resolvedName = (displayName || userEmail.split('@')[0] || 'Trader').trim();
      if (!userRecord) {
        userRecord = {
          uid: userId,
          email: userEmail.toLowerCase(),
          displayName: resolvedName,
          ...(photoURL ? { photoURL } : {}),
          role: 'trader',
          status: 'ACTIVE',
          activeActivationId: codeRecord.id,
          activeExpiresAt: finalExpiresAt,
          activeCode: codeRecord.code,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          lastLoginAt: now.toISOString(),
        };
      } else {
        userRecord.email = userEmail.toLowerCase();
        if (displayName) userRecord.displayName = resolvedName;
        if (photoURL) userRecord.photoURL = photoURL;
        userRecord.status = 'ACTIVE';
        userRecord.activeActivationId = codeRecord.id;
        userRecord.activeExpiresAt = finalExpiresAt;
        userRecord.activeCode = codeRecord.code;
        userRecord.updatedAt = now.toISOString();
        userRecord.lastLoginAt = now.toISOString();
      }
      await dbService.saveUser(userRecord, firebaseIdToken);

      const existingActiveSession = (await dbService.getSessionsByUser(userId, firebaseIdToken)).find(
        (s) =>
          s.status === 'ACTIVE' &&
          s.codeId === codeRecord!.id &&
          s.deviceToken === deviceToken &&
          (isMasterAdmin || !s.expiresAt || new Date(s.expiresAt).getTime() > now.getTime())
      );

      let sessionToken: string;
      if (existingActiveSession) {
        sessionToken = existingActiveSession.sessionToken;
      } else {
        sessionToken = `sess_${crypto.randomBytes(32).toString('hex')}`;
        const sessionExpiresAt = finalExpiresAt || new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
        const sessionRecord: UserSessionRecord = {
          id: sessionToken,
          sessionToken,
          userId,
          userEmail: userRecord.email,
          deviceToken,
          deviceId: matchedDevice ? matchedDevice.id : deviceToken,
          codeId: codeRecord.id,
          expiresAt: sessionExpiresAt,
          status: 'ACTIVE',
          createdAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
        };
        await dbService.saveSession(sessionRecord, firebaseIdToken);
      }

      let adminToken: string | undefined;
      if (userRecord.role === 'admin') {
        adminToken = adminAuthService.createAdminSession(userRecord.email || 'admin');
      }

      await dbService.addAuditLog(
        {
          action: 'USER_ACTIVATION_SUCCESS',
          actor: `user:${userRecord.email}`,
          details: {
            code: codeRecord.code,
            isUnlimitedLifetime: isMasterAdmin,
            role: userRecord.role,
            durationHours: codeRecord.durationHours,
            expiresAt: finalExpiresAt,
            activeDevices: codeRecord.activeDevicesCount,
            maxDevices: codeRecord.maxDevices,
            ip: ipAddress,
          },
          ipAddress,
        },
        firebaseIdToken
      );

      this.activationAttempts.delete(rateKey);

      return {
        success: true,
        sessionToken,
        deviceToken,
        adminToken,
        codeId: codeRecord.id,
        code: codeRecord.code,
        durationLabel: codeRecord.durationLabel,
        user: userRecord,
        role: userRecord.role,
        expiresAt: finalExpiresAt || undefined,
        durationHours: codeRecord.durationHours,
        maxDevices: codeRecord.maxDevices,
        activeDevicesCount: codeRecord.activeDevicesCount,
      };
    });
  }

  private async expireCodeAndSessions(
    code: ActivationCodeRecord,
    nowIso: string,
    firebaseIdToken?: string
  ): Promise<void> {
    const wasActive = code.status !== 'EXPIRED';
    if (code.status !== 'EXPIRED') {
      code.status = 'EXPIRED';
      code.updatedAt = nowIso;
      await dbService.saveActivationCode(code, firebaseIdToken);
    }

    await dbService.expireCodeSessions(code.id, firebaseIdToken);

    if (code.boundUserId) {
      const boundUser = await dbService.getUser(code.boundUserId, firebaseIdToken);
      if (boundUser && boundUser.activeActivationId === code.id) {
        boundUser.activeActivationId = null;
        boundUser.activeCode = null;
        boundUser.activeExpiresAt = null;
        boundUser.updatedAt = nowIso;
        await dbService.saveUser(boundUser, firebaseIdToken);
      }
    }

    if (wasActive) {
      await dbService.addAuditLog(
        {
          action: 'LICENSE_EXPIRED',
          actor: code.boundUserEmail || code.boundUserId || 'system',
          details: {
            codeId: code.id,
            code: code.code,
            expiresAt: code.expiresAt || code.exactExpiration || null,
          },
          ipAddress: 'system',
        },
        firebaseIdToken
      );
    }
  }

  /**
   * Periodic background sweep to immediately expire any overdue licenses & sessions
   */
  public async sweepExpiredLicenses(firebaseIdToken?: string): Promise<
    Array<{ codeId: string; code: string; userId: string | null; expiresAt: string | null }>
  > {
    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const expiredEvents: Array<{ codeId: string; code: string; userId: string | null; expiresAt: string | null }> = [];

    const allCodes = await dbService.getAllActivationCodes(firebaseIdToken);
    for (const code of allCodes) {
      const isUnlimitedCode = code.id === 'code_master_sbaa0000' || code.code === 'SBAA0000';
      if (isUnlimitedCode || code.status !== 'ACTIVE') continue;

      if (code.expiresAt && new Date(code.expiresAt).getTime() <= nowMs) {
        const targetUserId = code.boundUserId || null;
        await this.expireCodeAndSessions(code, nowIso, firebaseIdToken);
        expiredEvents.push({
          codeId: code.id,
          code: code.code,
          userId: targetUserId,
          expiresAt: code.expiresAt,
        });
      }
    }

    const allSessions = await dbService.getAllSessions();
    for (const session of allSessions) {
      if (session.status !== 'ACTIVE') continue;
      if (session.codeId === 'code_master_sbaa0000') continue;
      if (session.expiresAt && new Date(session.expiresAt).getTime() <= nowMs) {
        session.status = 'EXPIRED';
        await dbService.saveSession(session, firebaseIdToken);
        const alreadyRecorded = expiredEvents.some(
          (e) => e.userId === session.userId && e.codeId === session.codeId
        );
        if (!alreadyRecorded) {
          expiredEvents.push({
            codeId: session.codeId,
            code: '',
            userId: session.userId,
            expiresAt: session.expiresAt,
          });
        }
      }
    }

    return expiredEvents;
  }

  /**
   * Real-time verification of user session, device status, and license expiration
   */
  public async validateUserSession(
    sessionToken: string,
    deviceToken?: string,
    expectedUserId?: string,
    firebaseIdToken?: string
  ): Promise<{
    valid: boolean;
    state?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NEEDS_ACTIVATION';
    user?: UserRecord;
    activation?: ActivationCodeRecord;
    device?: DeviceRecord;
    serverTime?: string;
    expiresAt?: string | null;
    error?: string;
    errorCode?: string;
  }> {
    const now = new Date();
    const nowIso = now.toISOString();

    if (!sessionToken) {
      return {
        valid: false,
        state: 'NEEDS_ACTIVATION',
        serverTime: nowIso,
        error: 'Session token required',
        errorCode: 'NO_SESSION',
      };
    }

    const session = await dbService.getSession(sessionToken, firebaseIdToken);
    if (!session) {
      return {
        valid: false,
        state: 'REVOKED',
        serverTime: nowIso,
        error: 'تم إنهاء الجلسة. يرجى تسجيل الدخول مرة أخرى.',
        errorCode: 'SESSION_INVALID',
      };
    }

    if (session.status === 'EXPIRED') {
      return {
        valid: false,
        state: 'EXPIRED',
        serverTime: nowIso,
        expiresAt: session.expiresAt,
        error: 'انتهت صلاحية كود التفعيل الخاص بك، تم تسجيل خروجك تلقائياً. يرجى تسجيل الدخول مرة أخرى وإدخال كود جديد.',
        errorCode: 'ACTIVATION_EXPIRED',
      };
    }

    if (session.status !== 'ACTIVE') {
      return {
        valid: false,
        state: 'REVOKED',
        serverTime: nowIso,
        error: 'تم إنهاء الجلسة أو إلغاؤها من قِبل المدير.',
        errorCode: 'SESSION_INVALID',
      };
    }

    if (expectedUserId && session.userId !== expectedUserId) {
      return {
        valid: false,
        state: 'NEEDS_ACTIVATION',
        serverTime: nowIso,
        error: 'Session belongs to a different account',
        errorCode: 'USER_MISMATCH',
      };
    }

    const user = await dbService.getUser(session.userId, firebaseIdToken);
    if (!user || user.status !== 'ACTIVE') {
      return {
        valid: false,
        state: 'REVOKED',
        serverTime: nowIso,
        error: 'User account is disabled',
        errorCode: 'USER_DISABLED',
      };
    }

    let code = await dbService.getActivationCode(session.codeId, firebaseIdToken);
    if (!code && user.activeCode && user.activeCode !== '••••••••') {
      code = await dbService.getActivationCode(user.activeCode, firebaseIdToken);
    }
    if (!code) {
      return {
        valid: false,
        state: 'REVOKED',
        serverTime: nowIso,
        error: 'Activation code not found or deleted',
        errorCode: 'CODE_INACTIVE',
      };
    }

    const isUnlimitedCode = code.id === 'code_master_sbaa0000' || code.code === 'SBAA0000';
    if (!isUnlimitedCode && code.status === 'EXPIRED') {
      session.status = 'EXPIRED';
      await dbService.saveSession(session, firebaseIdToken);
      return {
        valid: false,
        state: 'EXPIRED',
        user,
        activation: code,
        serverTime: nowIso,
        expiresAt: code.expiresAt || session.expiresAt,
        error: 'انتهت صلاحية كود التفعيل الخاص بك، تم تسجيل خروجك تلقائياً. يرجى تسجيل الدخول مرة أخرى وإدخال كود جديد.',
        errorCode: 'ACTIVATION_EXPIRED',
      };
    }

    if (code.status !== 'ACTIVE') {
      return {
        valid: false,
        state: 'REVOKED',
        serverTime: nowIso,
        error: 'Activation code is not active or has been revoked',
        errorCode: 'CODE_INACTIVE',
      };
    }

    if (
      !isUnlimitedCode &&
      ((code.expiresAt && new Date(code.expiresAt).getTime() <= now.getTime()) ||
        (session.expiresAt && new Date(session.expiresAt).getTime() <= now.getTime()))
    ) {
      await this.expireCodeAndSessions(code, nowIso, firebaseIdToken);
      session.status = 'EXPIRED';
      await dbService.saveSession(session, firebaseIdToken);
      return {
        valid: false,
        state: 'EXPIRED',
        user,
        activation: code,
        serverTime: nowIso,
        expiresAt: code.expiresAt || session.expiresAt,
        error: 'انتهت صلاحية كود التفعيل الخاص بك، تم تسجيل خروجك تلقائياً. يرجى تسجيل الدخول مرة أخرى وإدخال كود جديد.',
        errorCode: 'ACTIVATION_EXPIRED',
      };
    }

    let device: DeviceRecord | null = null;
    const targetDevToken = deviceToken || session.deviceToken;
    if (targetDevToken) {
      device = await dbService.getDevice(session.deviceId || targetDevToken, firebaseIdToken);
      if (!device) {
        device = await dbService.getDevice(targetDevToken, firebaseIdToken);
      }
      if (device && device.status !== 'ACTIVE') {
        return {
          valid: false,
          state: 'REVOKED',
          user,
          activation: code,
          serverTime: nowIso,
          error: 'This device has been revoked by the administrator',
          errorCode: 'DEVICE_REVOKED',
        };
      }
    }

    // Throttle disk/cloud writes for lastSeenAt to at most once every 60 seconds per session/device
    const prevSessionSeenMs = session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : 0;
    if (now.getTime() - prevSessionSeenMs > 60_000) {
      session.lastSeenAt = nowIso;
      await dbService.saveSession(session, firebaseIdToken);
    }
    if (device) {
      const prevDevSeenMs = device.lastActiveAt ? new Date(device.lastActiveAt).getTime() : 0;
      if (now.getTime() - prevDevSeenMs > 60_000) {
        device.lastActiveAt = nowIso;
        await dbService.saveDevice(device, firebaseIdToken);
      }
    }

    return {
      valid: true,
      state: 'ACTIVE',
      user,
      activation: code,
      device: device || undefined,
      serverTime: nowIso,
      expiresAt: isUnlimitedCode ? null : (code.expiresAt || session.expiresAt),
    };
  }

  public async generateBatchCodes(options: {
    count?: number;
    durationHours?: number;
    customHours?: number;
    exactExpiration?: string;
    maxDevices?: number;
    boundUserEmail?: string;
    boundUserId?: string;
    createdBy?: string;
    customDurationLabel?: string;
    ipAddress?: string;
    firebaseIdToken?: string;
  }): Promise<ActivationCodeRecord[]> {
    return this.generateCodes(options);
  }

  // ================= ADMIN MANAGEMENT =================

  public async revokeCode(
    codeId: string,
    adminUser: string = 'admin',
    reason: string = 'Revoked by administrator',
    ipAddress?: string,
    firebaseIdToken?: string
  ): Promise<boolean> {
    const code = await dbService.getActivationCode(codeId, firebaseIdToken);
    if (!code) return false;
    if (code.id === 'code_master_sbaa0000' || code.code === 'SBAA0000') {
      return false;
    }

    code.status = 'REVOKED';
    code.revokedAt = new Date().toISOString();
    code.revocationReason = reason;
    code.updatedAt = new Date().toISOString();
    await dbService.saveActivationCode(code, firebaseIdToken);

    await dbService.invalidateCodeSessions(code.id, firebaseIdToken);
    if (code.boundUserId) {
      await dbService.invalidateUserSessions(code.boundUserId, firebaseIdToken);
      const user = await dbService.getUser(code.boundUserId, firebaseIdToken);
      if (user && user.activeActivationId === code.id) {
        user.activeActivationId = null;
        user.activeCode = null;
        user.activeExpiresAt = null;
        user.updatedAt = new Date().toISOString();
        await dbService.saveUser(user, firebaseIdToken);
      }
    }

    await dbService.addAuditLog(
      {
        action: 'CODE_REVOKED',
        actor: adminUser,
        details: { code: code.code, boundUser: code.boundUserEmail, reason },
        ipAddress: ipAddress || 'admin_panel',
      },
      firebaseIdToken
    );

    return true;
  }

  public async toggleCode(
    codeId: string,
    adminUser: string,
    enabled: boolean,
    firebaseIdToken?: string
  ): Promise<boolean> {
    const code = await dbService.getActivationCode(codeId, firebaseIdToken);
    if (!code) return false;
    if (code.id === 'code_master_sbaa0000' || code.code === 'SBAA0000') {
      return false;
    }

    if (enabled) {
      if (code.id !== 'code_master_sbaa0000' && code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) {
        code.status = 'EXPIRED';
      } else if (!code.boundUserId && !code.activatedAt && code.id !== 'code_master_sbaa0000') {
        code.status = 'UNUSED';
      } else {
        code.status = 'ACTIVE';
      }
    } else {
      code.status = 'DISABLED';
      await dbService.invalidateCodeSessions(code.id, firebaseIdToken);
    }

    code.updatedAt = new Date().toISOString();
    await dbService.saveActivationCode(code, firebaseIdToken);

    await dbService.addAuditLog(
      {
        action: enabled ? 'CODE_ENABLED' : 'CODE_DISABLED',
        actor: adminUser,
        details: { code: code.code, boundUser: code.boundUserEmail, status: code.status },
        ipAddress: 'admin_panel',
      },
      firebaseIdToken
    );

    return true;
  }

  public async unbindCode(
    codeId: string,
    adminUser: string = 'admin',
    firebaseIdToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    const code = await dbService.getActivationCode(codeId, firebaseIdToken);
    if (!code) return { success: false, error: 'Activation code not found.' };

    const previousUser = code.boundUserEmail || code.boundUserId;

    await dbService.invalidateCodeSessions(code.id, firebaseIdToken);

    if (code.boundUserId) {
      const user = await dbService.getUser(code.boundUserId, firebaseIdToken);
      if (user && user.activeActivationId === code.id) {
        user.activeActivationId = null;
        user.activeCode = null;
        user.activeExpiresAt = null;
        user.updatedAt = new Date().toISOString();
        await dbService.saveUser(user, firebaseIdToken);
      }
    }

    const attachedDevices = await dbService.getDevicesByCode(code.id, firebaseIdToken);
    for (const dev of attachedDevices) {
      if (dev.status === 'ACTIVE') {
        dev.status = 'REVOKED';
        dev.revokedAt = new Date().toISOString();
        dev.revokedBy = adminUser;
        dev.revocationReason = 'Code unbound by administrator';
        await dbService.saveDevice(dev, firebaseIdToken);
      }
    }

    code.boundUserId = null;
    code.boundUserEmail = null;
    code.activeDevicesCount = 0;
    if (code.id !== 'code_master_sbaa0000' && code.status === 'ACTIVE') {
      code.status = 'UNUSED';
      code.activatedAt = null;
      code.expiresAt = code.exactExpiration ? new Date(code.exactExpiration).toISOString() : null;
    }
    code.updatedAt = new Date().toISOString();
    await dbService.saveActivationCode(code, firebaseIdToken);

    await dbService.addAuditLog(
      {
        action: 'CODE_UNBOUND',
        actor: adminUser,
        details: { code: code.code, previousUser },
        ipAddress: 'admin_panel',
      },
      firebaseIdToken
    );

    return { success: true };
  }

  public async deleteCode(
    codeId: string,
    adminUser: string = 'admin',
    firebaseIdToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    const code = await dbService.getActivationCode(codeId, firebaseIdToken);
    if (!code) return { success: false, error: 'Activation code not found.' };
    if (code.id === 'code_master_sbaa0000' || code.code === 'SBAA0000') {
      return { success: false, error: 'لا يمكن حذف كود المدير الرئيسي.' };
    }

    await dbService.invalidateCodeSessions(code.id, firebaseIdToken);
    if (code.boundUserId) {
      const user = await dbService.getUser(code.boundUserId, firebaseIdToken);
      if (user && user.activeActivationId === code.id) {
        user.activeActivationId = null;
        user.activeCode = null;
        user.activeExpiresAt = null;
        user.updatedAt = new Date().toISOString();
        await dbService.saveUser(user, firebaseIdToken);
      }
    }

    await dbService.deleteActivationCode(code.id, firebaseIdToken);

    await dbService.addAuditLog(
      {
        action: 'CODE_DELETED',
        actor: adminUser,
        details: { code: code.code, boundUser: code.boundUserEmail },
        ipAddress: 'admin_panel',
      },
      firebaseIdToken
    );

    return { success: true };
  }

  public async extendCode(
    codeId: string,
    adminUser: string,
    additionalHours?: number,
    newExactExpiration?: string,
    firebaseIdToken?: string
  ): Promise<{ success: boolean; newExpiresAt?: string }> {
    const code = await dbService.getActivationCode(codeId, firebaseIdToken);
    if (!code) return { success: false };

    let newExpDate: Date;
    if (newExactExpiration) {
      newExpDate = new Date(newExactExpiration);
    } else {
      const baseTime = code.expiresAt && new Date(code.expiresAt).getTime() > Date.now()
        ? new Date(code.expiresAt)
        : new Date();
      newExpDate = new Date(baseTime.getTime() + (additionalHours || 24) * 60 * 60 * 1000);
    }

    code.expiresAt = newExpDate.toISOString();
    if (code.status === 'EXPIRED') {
      code.status = 'ACTIVE';
    }
    code.updatedAt = new Date().toISOString();
    await dbService.saveActivationCode(code, firebaseIdToken);

    if (code.boundUserId) {
      const user = await dbService.getUser(code.boundUserId, firebaseIdToken);
      if (user) {
        user.activeExpiresAt = code.expiresAt;
        await dbService.saveUser(user, firebaseIdToken);
      }
      const userSessions = await dbService.getSessionsByUser(code.boundUserId, firebaseIdToken);
      for (const s of userSessions) {
        if (s.codeId === code.id && s.status === 'ACTIVE') {
          s.expiresAt = code.expiresAt!;
          await dbService.saveSession(s, firebaseIdToken);
        }
      }
    }

    await dbService.addAuditLog(
      {
        action: 'CODE_EXTENDED',
        actor: adminUser,
        details: { code: code.code, newExpiresAt: code.expiresAt, boundUser: code.boundUserEmail },
        ipAddress: 'admin_panel',
      },
      firebaseIdToken
    );

    return { success: true, newExpiresAt: code.expiresAt };
  }

  public async changeDeviceLimit(
    codeId: string,
    adminUser: string,
    newLimit: number,
    firebaseIdToken?: string
  ): Promise<boolean> {
    const code = await dbService.getActivationCode(codeId, firebaseIdToken);
    if (!code) return false;

    code.maxDevices = Math.max(1, newLimit);
    code.updatedAt = new Date().toISOString();
    await dbService.saveActivationCode(code, firebaseIdToken);

    await dbService.addAuditLog(
      {
        action: 'DEVICE_LIMIT_CHANGED',
        actor: adminUser,
        details: { code: code.code, newLimit: code.maxDevices },
        ipAddress: 'admin_panel',
      },
      firebaseIdToken
    );

    return true;
  }

  public async revokeDevice(
    deviceId: string,
    adminUser: string = 'admin',
    reason: string = 'Revoked by administrator',
    ipAddress?: string,
    firebaseIdToken?: string
  ): Promise<boolean> {
    const device = await dbService.getDevice(deviceId, firebaseIdToken);
    if (!device) return false;

    device.status = 'REVOKED';
    device.revokedAt = new Date().toISOString();
    device.revokedBy = adminUser;
    device.revocationReason = reason;
    await dbService.saveDevice(device, firebaseIdToken);

    const code = await dbService.getActivationCode(device.codeId, firebaseIdToken);
    if (code) {
      const activeDevices = await dbService.getDevicesByCode(code.id, firebaseIdToken);
      code.activeDevicesCount = activeDevices.filter((d) => d.status === 'ACTIVE').length;
      await dbService.saveActivationCode(code, firebaseIdToken);
    }

    await dbService.addAuditLog(
      {
        action: 'DEVICE_REVOKED',
        actor: adminUser,
        details: { deviceId, userEmail: device.userEmail, ip: device.ipAddress, reason },
        ipAddress: ipAddress || 'admin_panel',
      },
      firebaseIdToken
    );

    return true;
  }

  public async toggleUser(
    userId: string,
    adminUser: string,
    active: boolean,
    firebaseIdToken?: string
  ): Promise<boolean> {
    const user = await dbService.getUser(userId, firebaseIdToken);
    if (!user) return false;

    user.status = active ? 'ACTIVE' : 'DISABLED';
    user.updatedAt = new Date().toISOString();
    await dbService.saveUser(user, firebaseIdToken);

    if (!active) {
      await dbService.invalidateUserSessions(userId, firebaseIdToken);
    }

    await dbService.addAuditLog(
      {
        action: active ? 'USER_ENABLED' : 'USER_DISABLED',
        actor: adminUser,
        details: { userId, userEmail: user.email },
        ipAddress: 'admin_panel',
      },
      firebaseIdToken
    );

    return true;
  }

  public async getDashboardStats(firebaseIdToken?: string): Promise<DashboardStats> {
    const users = await dbService.getAllUsers(firebaseIdToken);
    const codes = await dbService.getAllActivationCodes(firebaseIdToken);
    const devices = await dbService.getAllDevices(firebaseIdToken);
    const now = Date.now();
    const in48Hours = now + 48 * 60 * 60 * 1000;

    const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
    const activeActivations = codes.filter((c) => c.status === 'ACTIVE').length;
    const expiredActivations = codes.filter((c) => c.status === 'EXPIRED' || (c.expiresAt && new Date(c.expiresAt).getTime() <= now)).length;
    const revokedActivations = codes.filter((c) => c.status === 'REVOKED').length;
    const activeDevices = devices.filter((d) => d.status === 'ACTIVE').length;

    const codesExpiringSoon = codes.filter((c) => {
      if (c.status !== 'ACTIVE' || !c.expiresAt) return false;
      const expTime = new Date(c.expiresAt).getTime();
      return expTime > now && expTime <= in48Hours;
    }).length;

    const logs = await dbService.getAuditLogs(100, firebaseIdToken);
    const recentSecurityEvents = logs.filter((l) => l.action.includes('FAILED') || l.action.includes('LIMITED') || l.action.includes('REVOKED')).length;

    return {
      totalUsers: users.length,
      activeUsers,
      activeActivations,
      expiredActivations,
      revokedActivations,
      activeDevices,
      totalCodesCreated: codes.length,
      codesExpiringSoon,
      recentSecurityEvents,
    };
  }
}

export const activationManager = ActivationManager.getInstance();
