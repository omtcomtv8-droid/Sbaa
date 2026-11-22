import fs from 'fs';
import path from 'path';
import {
  AdminAccount,
  ActivationCodeRecord,
  UserRecord,
  DeviceRecord,
  UserSessionRecord,
  UserApiCredentialRecord,
  AuditLogRecord,
} from '../types/authSystemTypes';
import { firestoreRest } from './FirestoreRestService';
import { normalizeActivationCode } from '../utils/codeNormalizer';

export interface PersistedAdminSession {
  token: string;
  username: string;
  expiresAt: number;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface ActivationCodeResolveResult {
  record: ActivationCodeRecord | null;
  permissionDenied?: boolean;
  updateTime?: string;
  fromCloud?: boolean;
}

export interface CloudSyncSummary {
  success: boolean;
  pushedCodes: number;
  pulledCodes: number;
  pulledUsers: number;
  pulledDevices: number;
  error?: string;
}

function toCleanActivationCode(code: ActivationCodeRecord): Record<string, any> {
  return {
    id: String(code.id).slice(0, 128),
    code: String(code.code).slice(0, 64),
    status: code.status,
    durationHours: Number(code.durationHours ?? 0),
    durationLabel: code.durationLabel ? String(code.durationLabel).slice(0, 128) : '',
    maxDevices: Number(code.maxDevices ?? 1),
    activeDevicesCount: Number(code.activeDevicesCount ?? 0),
    boundUserId: code.boundUserId ?? null,
    boundUserEmail: code.boundUserEmail ?? null,
    createdAt: String(code.createdAt).slice(0, 64),
    createdBy: String(code.createdBy || 'admin').slice(0, 128),
    updatedAt: String(code.updatedAt || code.createdAt).slice(0, 64),
    activatedAt: code.activatedAt ?? null,
    expiresAt: code.expiresAt ?? null,
    exactExpiration: code.exactExpiration ?? null,
    lastUsageAt: code.lastUsageAt ?? null,
    revokedAt: code.revokedAt ?? null,
    revocationReason: code.revocationReason ? String(code.revocationReason).slice(0, 256) : null,
  };
}

function toCleanUserProfile(user: UserRecord): Record<string, any> {
  const maskedCode =
    user.activeCode && user.activeCode.toUpperCase().replace(/[^A-Z0-9]/g, '') === 'SBAA0000'
      ? '••••••••'
      : user.activeCode ?? null;
  const payload: Record<string, any> = {
    uid: String(user.uid).slice(0, 128),
    email: String(user.email || '').slice(0, 254),
    displayName: String(user.displayName || '').slice(0, 128),
    role: user.role || 'trader',
    status: user.status || 'ACTIVE',
    activeActivationId: user.activeActivationId ?? null,
    activeExpiresAt: user.activeExpiresAt ?? null,
    activeCode: maskedCode ? String(maskedCode).slice(0, 64) : null,
    createdAt: String(user.createdAt).slice(0, 64),
    updatedAt: String(user.updatedAt).slice(0, 64),
    lastLoginAt: String(user.lastLoginAt || user.updatedAt).slice(0, 64),
  };
  if (user.photoURL) {
    payload.photoURL = String(user.photoURL).slice(0, 512);
  }
  return payload;
}

function toCleanDeviceRecord(device: DeviceRecord): Record<string, any> {
  return {
    id: String(device.id).slice(0, 128),
    deviceId: String(device.deviceId).slice(0, 128),
    userId: String(device.userId).slice(0, 128),
    userEmail: device.userEmail ? String(device.userEmail).slice(0, 254) : null,
    codeId: String(device.codeId).slice(0, 128),
    code: device.code ? String(device.code).slice(0, 64) : null,
    deviceToken: String(device.deviceToken).slice(0, 256),
    fingerprint: device.fingerprint ? String(device.fingerprint).slice(0, 128) : null,
    userAgent: device.userAgent ? String(device.userAgent).slice(0, 512) : null,
    ipAddress: device.ipAddress ? String(device.ipAddress).slice(0, 64) : null,
    os: device.os ? String(device.os).slice(0, 64) : null,
    browser: device.browser ? String(device.browser).slice(0, 64) : null,
    status: device.status,
    createdAt: String(device.createdAt).slice(0, 64),
    lastActiveAt: String(device.lastActiveAt).slice(0, 64),
    revokedAt: device.revokedAt ?? null,
    revokedBy: device.revokedBy ? String(device.revokedBy).slice(0, 128) : null,
    revocationReason: device.revocationReason ? String(device.revocationReason).slice(0, 256) : null,
  };
}

function toCleanSessionRecord(session: UserSessionRecord): Record<string, any> {
  return {
    id: String(session.id).slice(0, 256),
    sessionToken: String(session.sessionToken).slice(0, 256),
    userId: String(session.userId).slice(0, 128),
    userEmail: session.userEmail ? String(session.userEmail).slice(0, 254) : null,
    deviceToken: session.deviceToken ? String(session.deviceToken).slice(0, 256) : null,
    deviceId: session.deviceId ? String(session.deviceId).slice(0, 128) : null,
    codeId: String(session.codeId).slice(0, 128),
    expiresAt: String(session.expiresAt).slice(0, 64),
    status: session.status,
    createdAt: String(session.createdAt).slice(0, 64),
    lastSeenAt: String(session.lastSeenAt).slice(0, 64),
  };
}

export class DatabaseService {
  private static instance: DatabaseService;

  // Resilient memory cache backing with atomic transaction locks + Firestore cloud sync
  private adminsCache = new Map<string, AdminAccount>();
  private adminSessionsCache = new Map<string, PersistedAdminSession>();
  private codesCache = new Map<string, ActivationCodeRecord>();
  private usersCache = new Map<string, UserRecord>();
  private devicesCache = new Map<string, DeviceRecord>();
  private sessionsCache = new Map<string, UserSessionRecord>();
  private credentialsCache = new Map<string, UserApiCredentialRecord>();
  private auditLogsCache: AuditLogRecord[] = [];

  private lockMap = new Map<string, Promise<void>>();

  private constructor() {
    this.initStorage();
    this.loadLocalState();
    this.ensureMasterCode();
  }

  public ensureMasterCode(): ActivationCodeRecord {
    const existing =
      this.codesCache.get('code_master_sbaa0000') ||
      Array.from(this.codesCache.values()).find(
        (c) => c.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === 'SBAA0000'
      );

    // Clean any legacy duplicate alias keys from cache
    this.codesCache.delete('SBAA0000');
    this.codesCache.delete('SABAA0000');

    const now = new Date();
    if (existing) {
      existing.id = 'code_master_sbaa0000';
      existing.code = 'SBAA0000';
      existing.status = 'ACTIVE';
      existing.durationHours = 0;
      existing.durationLabel = 'دائم • وقت لا محدود (Unlimited)';
      existing.maxDevices = 999999;
      existing.boundUserId = null;
      existing.boundUserEmail = null;
      existing.expiresAt = null;
      existing.exactExpiration = null;
      existing.updatedAt = now.toISOString();
      this.codesCache.set(existing.id, existing);
      this.persistLocalState('activation_codes');
      return existing;
    }

    const masterCode: ActivationCodeRecord = {
      id: 'code_master_sbaa0000',
      code: 'SBAA0000',
      status: 'ACTIVE',
      durationHours: 0,
      durationLabel: 'دائم • وقت لا محدود (Unlimited)',
      maxDevices: 999999,
      activeDevicesCount: 0,
      boundUserId: null,
      boundUserEmail: null,
      createdAt: now.toISOString(),
      createdBy: 'system_root_admin',
      updatedAt: now.toISOString(),
      exactExpiration: null,
      expiresAt: null,
    };

    this.codesCache.set(masterCode.id, masterCode);
    this.persistLocalState('activation_codes');
    return masterCode;
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private initStorage() {
    console.log('[DatabaseService] Initialized hybrid local (.data/) + Firestore REST cloud persistence');
  }

  // Backup persistence state for fast warm reboots
  private getStorageFilePath(collectionName: string): string {
    const dir = path.resolve(process.cwd(), '.data');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // ignore
      }
    }
    return path.join(dir, `${collectionName}.json`);
  }

  private loadLocalState() {
    try {
      const collections = [
        'admins',
        'admin_sessions',
        'activation_codes',
        'users',
        'devices',
        'sessions',
        'api_credentials',
        'audit_logs',
      ];
      let needsCodeDedupePersist = false;
      let needsDeviceDedupePersist = false;

      for (const col of collections) {
        const filePath = this.getStorageFilePath(col);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);
          if (col === 'admins') {
            Object.values(data).forEach((item: any) => this.adminsCache.set(item.id || item.username, item));
          } else if (col === 'admin_sessions') {
            const now = Date.now();
            Object.values(data).forEach((item: any) => {
              if (item && item.token && item.expiresAt > now) {
                this.adminSessionsCache.set(item.token, item);
              }
            });
          } else if (col === 'activation_codes') {
            const entries = Object.entries(data);
            entries.forEach(([key, item]: [string, any]) => {
              if (!item) return;
              const canonicalId = item.id || item.code;
              if (key !== canonicalId) needsCodeDedupePersist = true;
              const prev = this.codesCache.get(canonicalId);
              if (!prev || new Date(item.updatedAt || 0).getTime() >= new Date(prev.updatedAt || 0).getTime()) {
                this.codesCache.set(canonicalId, item);
              }
            });
          } else if (col === 'users') {
            Object.values(data).forEach((item: any) => {
              if (item && item.uid) this.usersCache.set(item.uid, item);
            });
          } else if (col === 'devices') {
            const entries = Object.entries(data);
            entries.forEach(([key, item]: [string, any]) => {
              if (!item) return;
              const canonicalId = item.id || item.deviceId;
              if (key !== canonicalId) needsDeviceDedupePersist = true;
              const prev = this.devicesCache.get(canonicalId);
              if (!prev || new Date(item.lastActiveAt || 0).getTime() >= new Date(prev.lastActiveAt || 0).getTime()) {
                this.devicesCache.set(canonicalId, item);
              }
            });
          } else if (col === 'sessions') {
            Object.values(data).forEach((item: any) => {
              if (item && (item.sessionToken || item.id)) {
                this.sessionsCache.set(item.sessionToken || item.id, item);
              }
            });
          } else if (col === 'api_credentials') {
            Object.values(data).forEach((item: any) => {
              if (item && (item.userId || item.id)) {
                this.credentialsCache.set(item.userId || item.id, item);
              }
            });
          } else if (col === 'audit_logs') {
            this.auditLogsCache = Array.isArray(data) ? data : [];
          }
        }
      }

      if (needsCodeDedupePersist) this.persistLocalState('activation_codes');
      if (needsDeviceDedupePersist) this.persistLocalState('devices');
    } catch (e) {
      console.warn('[DatabaseService] Notice loading local cache:', e);
    }
  }

  private persistLocalState(col: string) {
    try {
      const filePath = this.getStorageFilePath(col);
      let data: any;
      if (col === 'admins') data = Object.fromEntries(this.adminsCache);
      else if (col === 'admin_sessions') data = Object.fromEntries(this.adminSessionsCache);
      else if (col === 'activation_codes') data = Object.fromEntries(this.codesCache);
      else if (col === 'users') data = Object.fromEntries(this.usersCache);
      else if (col === 'devices') data = Object.fromEntries(this.devicesCache);
      else if (col === 'sessions') data = Object.fromEntries(this.sessionsCache);
      else if (col === 'api_credentials') data = Object.fromEntries(this.credentialsCache);
      else if (col === 'audit_logs') data = this.auditLogsCache;

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }

  /**
   * Acquire atomic transaction lock for key to prevent activation and device race conditions
   */
  public async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    while (this.lockMap.has(key)) {
      await this.lockMap.get(key);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.lockMap.set(key, lockPromise);

    try {
      return await task();
    } finally {
      this.lockMap.delete(key);
      resolveLock();
    }
  }

  // ================= ADMINS =================
  public async getAdmin(idOrUsername: string): Promise<AdminAccount | null> {
    const cached =
      this.adminsCache.get(idOrUsername) ||
      Array.from(this.adminsCache.values()).find((a) => a.username === idOrUsername);
    return cached || null;
  }

  public async saveAdmin(admin: AdminAccount): Promise<void> {
    this.adminsCache.set(admin.id, admin);
    this.persistLocalState('admins');
  }

  // ================= ADMIN SESSIONS =================
  public getAdminSession(token: string): PersistedAdminSession | null {
    const sess = this.adminSessionsCache.get(token);
    if (!sess) return null;
    if (Date.now() > sess.expiresAt) {
      this.adminSessionsCache.delete(token);
      this.persistLocalState('admin_sessions');
      return null;
    }
    return sess;
  }

  public saveAdminSession(session: PersistedAdminSession): void {
    const now = Date.now();
    for (const [tok, s] of this.adminSessionsCache.entries()) {
      if (now > s.expiresAt) this.adminSessionsCache.delete(tok);
    }
    this.adminSessionsCache.set(session.token, session);
    this.persistLocalState('admin_sessions');
  }

  public deleteAdminSession(token: string): void {
    this.adminSessionsCache.delete(token);
    this.persistLocalState('admin_sessions');
  }

  // ================= ACTIVATION CODES =================
  private findLocalActivationCode(codeOrId: string): ActivationCodeRecord | null {
    if (!codeOrId) return null;
    const norm = normalizeActivationCode(codeOrId);
    if (norm.isMasterAdmin) {
      return this.ensureMasterCode();
    }

    return (
      this.codesCache.get(codeOrId) ||
      Array.from(this.codesCache.values()).find(
        (c) =>
          c.id === codeOrId ||
          c.code.toUpperCase() === norm.cleaned ||
          c.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === norm.alphanumeric
      ) ||
      null
    );
  }

  public async resolveActivationCode(
    codeOrId: string,
    idToken?: string
  ): Promise<ActivationCodeResolveResult> {
    if (!codeOrId) return { record: null };

    const norm = normalizeActivationCode(codeOrId);
    if (norm.isMasterAdmin) {
      return { record: this.ensureMasterCode(), fromCloud: false };
    }

    const localCached = this.findLocalActivationCode(codeOrId);

    // Determine deterministic Firestore doc key (`SABAAXXXXXXXXXXXX`)
    const docKey = localCached
      ? normalizeActivationCode(localCached.code).firestoreDocId
      : norm.firestoreDocId;

    if (idToken && docKey && !docKey.startsWith('CODE_')) {
      const cloudRes = await firestoreRest.getDocument<ActivationCodeRecord>(
        'activation_codes',
        docKey,
        idToken
      );

      if (cloudRes.status === 'OK') {
        const cloudRecord = cloudRes.data;
        const localTime = localCached ? new Date(localCached.updatedAt || 0).getTime() : -1;
        const cloudTime = new Date(cloudRecord.updatedAt || 0).getTime();

        // Always honor cloud if newer or if cloud is already redeemed/revoked/expired
        if (
          !localCached ||
          cloudTime >= localTime ||
          cloudRecord.status !== localCached.status
        ) {
          this.codesCache.set(cloudRecord.id, cloudRecord);
          this.persistLocalState('activation_codes');
          return { record: cloudRecord, updateTime: cloudRes.updateTime, fromCloud: true };
        }
        return { record: localCached, updateTime: cloudRes.updateTime, fromCloud: false };
      }

      if (cloudRes.status === 'PERMISSION_DENIED') {
        // Document exists in Firestore but rules denied non-admin access
        // (i.e. already claimed/bound by another user or restricted to another email).
        if (localCached) {
          return { record: localCached, permissionDenied: true };
        }
        return { record: null, permissionDenied: true, fromCloud: true };
      }

      if (cloudRes.status === 'NOT_FOUND' && localCached) {
        return { record: localCached, fromCloud: false };
      }
    }

    return { record: localCached, fromCloud: false };
  }

  public async getActivationCode(
    codeOrId: string,
    idToken?: string
  ): Promise<ActivationCodeRecord | null> {
    const resolved = await this.resolveActivationCode(codeOrId, idToken);
    return resolved.record;
  }

  public async saveActivationCode(
    code: ActivationCodeRecord,
    idToken?: string,
    expectedUpdateTime?: string
  ): Promise<{ ok: boolean; cloudSynced: boolean; conflict?: boolean; error?: string }> {
    this.codesCache.set(code.id, code);
    this.persistLocalState('activation_codes');

    const isMaster =
      code.id === 'code_master_sbaa0000' ||
      normalizeActivationCode(code.code).isMasterAdmin;
    if (isMaster) {
      return { ok: true, cloudSynced: false };
    }

    if (!idToken) {
      return { ok: true, cloudSynced: false };
    }

    const docKey = normalizeActivationCode(code.code).firestoreDocId;
    const writeRes = await firestoreRest.setDocument(
      'activation_codes',
      docKey,
      toCleanActivationCode(code),
      idToken,
      expectedUpdateTime
    );

    if (writeRes.status === 'OK') {
      return { ok: true, cloudSynced: true };
    }
    if (writeRes.status === 'CONFLICT') {
      return { ok: false, cloudSynced: false, conflict: true, error: writeRes.error };
    }
    console.warn('[DatabaseService] Firestore saveActivationCode warning:', writeRes.error);
    return { ok: true, cloudSynced: false, error: writeRes.error };
  }

  public async deleteActivationCode(codeId: string, idToken?: string): Promise<boolean> {
    const existing = await this.getActivationCode(codeId, idToken);
    if (!existing) return false;
    this.codesCache.delete(existing.id);
    this.persistLocalState('activation_codes');

    if (idToken && existing.id !== 'code_master_sbaa0000') {
      const docKey = normalizeActivationCode(existing.code).firestoreDocId;
      await firestoreRest.deleteDocument('activation_codes', docKey, idToken);
    }
    return true;
  }

  public async getAllActivationCodes(idToken?: string): Promise<ActivationCodeRecord[]> {
    if (idToken) {
      const cloudRes = await firestoreRest.listCollection<ActivationCodeRecord>(
        'activation_codes',
        idToken
      );
      if (cloudRes.ok) {
        for (const item of cloudRes.items) {
          if (!item || item.id === 'code_master_sbaa0000') continue;
          const prev = this.codesCache.get(item.id);
          if (
            !prev ||
            new Date(item.updatedAt || 0).getTime() >= new Date(prev.updatedAt || 0).getTime()
          ) {
            this.codesCache.set(item.id, item);
          }
        }
        this.persistLocalState('activation_codes');
      }
    }

    const devices = Array.from(this.devicesCache.values());
    return Array.from(this.codesCache.values())
      .map((code) => ({
        ...code,
        activeDevicesCount: devices.filter((d) => d.codeId === code.id && d.status === 'ACTIVE').length,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Bidirectional sync between local container store and shared Firestore when authenticated admin connects
   */
  public async syncCloudStateForAdmin(adminIdToken: string): Promise<CloudSyncSummary> {
    if (!adminIdToken) {
      return {
        success: false,
        pushedCodes: 0,
        pulledCodes: 0,
        pulledUsers: 0,
        pulledDevices: 0,
        error: 'Firebase Google ID token required for cloud sync.',
      };
    }

    const cloudCodesRes = await firestoreRest.listCollection<ActivationCodeRecord>(
      'activation_codes',
      adminIdToken
    );
    if (!cloudCodesRes.ok) {
      return {
        success: false,
        pushedCodes: 0,
        pulledCodes: 0,
        pulledUsers: 0,
        pulledDevices: 0,
        error: cloudCodesRes.error || 'Firestore admin list denied. Sign in with owner Google account.',
      };
    }

    const cloudMap = new Map<string, ActivationCodeRecord>();
    for (const item of cloudCodesRes.items) {
      if (item?.id) cloudMap.set(item.id, item);
    }

    let pushedCodes = 0;
    let pulledCodes = 0;

    // 1. Push any local non-master codes that do not yet exist in Firestore (or are newer locally)
    for (const localCode of this.codesCache.values()) {
      if (localCode.id === 'code_master_sbaa0000' || localCode.code === 'SBAA0000') continue;
      const cloudMatch = cloudMap.get(localCode.id);
      const localTime = new Date(localCode.updatedAt || 0).getTime();
      const cloudTime = cloudMatch ? new Date(cloudMatch.updatedAt || 0).getTime() : -1;

      if (!cloudMatch || localTime > cloudTime) {
        const docKey = normalizeActivationCode(localCode.code).firestoreDocId;
        const wr = await firestoreRest.setDocument(
          'activation_codes',
          docKey,
          toCleanActivationCode(localCode),
          adminIdToken
        );
        if (wr.status === 'OK') pushedCodes++;
      }
    }

    // 2. Pull any cloud codes missing or newer locally
    for (const cloudCode of cloudMap.values()) {
      if (cloudCode.id === 'code_master_sbaa0000' || cloudCode.code === 'SBAA0000') continue;
      const localMatch = this.codesCache.get(cloudCode.id);
      const localTime = localMatch ? new Date(localMatch.updatedAt || 0).getTime() : -1;
      const cloudTime = new Date(cloudCode.updatedAt || 0).getTime();
      if (!localMatch || cloudTime >= localTime) {
        this.codesCache.set(cloudCode.id, cloudCode);
        pulledCodes++;
      }
    }
    this.persistLocalState('activation_codes');

    // 3. Pull users & devices from Firestore as well
    let pulledUsers = 0;
    const cloudUsersRes = await firestoreRest.listCollection<UserRecord>('users', adminIdToken);
    if (cloudUsersRes.ok) {
      for (const u of cloudUsersRes.items) {
        if (!u?.uid) continue;
        const prev = this.usersCache.get(u.uid);
        if (!prev || new Date(u.updatedAt || 0).getTime() >= new Date(prev.updatedAt || 0).getTime()) {
          this.usersCache.set(u.uid, u);
          pulledUsers++;
        }
      }
      this.persistLocalState('users');
    }

    let pulledDevices = 0;
    const cloudDevicesRes = await firestoreRest.listCollection<DeviceRecord>('devices', adminIdToken);
    if (cloudDevicesRes.ok) {
      for (const d of cloudDevicesRes.items) {
        if (!d?.id) continue;
        const prev = this.devicesCache.get(d.id);
        if (!prev || new Date(d.lastActiveAt || 0).getTime() >= new Date(prev.lastActiveAt || 0).getTime()) {
          this.devicesCache.set(d.id, d);
          pulledDevices++;
        }
      }
      this.persistLocalState('devices');
    }

    return {
      success: true,
      pushedCodes,
      pulledCodes,
      pulledUsers,
      pulledDevices,
    };
  }

  // ================= USERS =================
  public async getUser(uid: string, idToken?: string): Promise<UserRecord | null> {
    const cached = this.usersCache.get(uid) || null;
    if (idToken && uid) {
      const cloudRes = await firestoreRest.getDocument<UserRecord>('users', uid, idToken);
      if (cloudRes.status === 'OK') {
        const cloudUser = cloudRes.data;
        const localTime = cached ? new Date(cached.updatedAt || 0).getTime() : -1;
        const cloudTime = new Date(cloudUser.updatedAt || 0).getTime();
        if (!cached || cloudTime >= localTime) {
          this.usersCache.set(cloudUser.uid, cloudUser);
          this.persistLocalState('users');
          return cloudUser;
        }
      }
    }
    return cached;
  }

  public async saveUser(user: UserRecord, idToken?: string): Promise<void> {
    this.usersCache.set(user.uid, user);
    this.persistLocalState('users');

    if (idToken) {
      const res = await firestoreRest.setDocument(
        'users',
        user.uid,
        toCleanUserProfile(user),
        idToken
      );
      if (res.status !== 'OK') {
        console.warn('[DatabaseService] Firestore saveUser warning:', res.error);
      }
    }
  }

  public async getAllUsers(idToken?: string): Promise<UserRecord[]> {
    if (idToken) {
      const cloudRes = await firestoreRest.listCollection<UserRecord>('users', idToken);
      if (cloudRes.ok) {
        for (const u of cloudRes.items) {
          if (!u?.uid) continue;
          const prev = this.usersCache.get(u.uid);
          if (!prev || new Date(u.updatedAt || 0).getTime() >= new Date(prev.updatedAt || 0).getTime()) {
            this.usersCache.set(u.uid, u);
          }
        }
        this.persistLocalState('users');
      }
    }
    return Array.from(this.usersCache.values());
  }

  // ================= DEVICES =================
  public async getDevice(deviceIdOrToken: string, idToken?: string): Promise<DeviceRecord | null> {
    const cached =
      this.devicesCache.get(deviceIdOrToken) ||
      Array.from(this.devicesCache.values()).find(
        (d) => d.deviceToken === deviceIdOrToken || d.deviceId === deviceIdOrToken
      ) ||
      null;

    if (idToken && deviceIdOrToken && !deviceIdOrToken.startsWith('dev_')) {
      const cloudRes = await firestoreRest.getDocument<DeviceRecord>('devices', deviceIdOrToken, idToken);
      if (cloudRes.status === 'OK') {
        this.devicesCache.set(cloudRes.data.id, cloudRes.data);
        this.persistLocalState('devices');
        return cloudRes.data;
      }
    }
    return cached;
  }

  public async getDevicesByUserAndCode(
    userId: string,
    codeId: string,
    idToken?: string
  ): Promise<DeviceRecord[]> {
    if (idToken) {
      const cloudRes = await firestoreRest.queryByField<DeviceRecord>(
        'devices',
        'userId',
        userId,
        idToken
      );
      if (cloudRes.ok) {
        for (const d of cloudRes.items) {
          if (!d?.id) continue;
          const prev = this.devicesCache.get(d.id);
          if (!prev || new Date(d.lastActiveAt || 0).getTime() >= new Date(prev.lastActiveAt || 0).getTime()) {
            this.devicesCache.set(d.id, d);
          }
        }
        this.persistLocalState('devices');
      }
    }
    return Array.from(this.devicesCache.values()).filter(
      (d) => d.userId === userId && d.codeId === codeId && d.status === 'ACTIVE'
    );
  }

  public async getDevicesByCode(codeId: string, idToken?: string): Promise<DeviceRecord[]> {
    if (idToken) {
      const cloudRes = await firestoreRest.queryByField<DeviceRecord>(
        'devices',
        'codeId',
        codeId,
        idToken
      );
      if (cloudRes.ok) {
        for (const d of cloudRes.items) {
          if (!d?.id) continue;
          this.devicesCache.set(d.id, d);
        }
        this.persistLocalState('devices');
      }
    }
    return Array.from(this.devicesCache.values()).filter((d) => d.codeId === codeId);
  }

  public async getAllDevices(idToken?: string): Promise<DeviceRecord[]> {
    if (idToken) {
      const cloudRes = await firestoreRest.listCollection<DeviceRecord>('devices', idToken);
      if (cloudRes.ok) {
        for (const d of cloudRes.items) {
          if (!d?.id) continue;
          const prev = this.devicesCache.get(d.id);
          if (!prev || new Date(d.lastActiveAt || 0).getTime() >= new Date(prev.lastActiveAt || 0).getTime()) {
            this.devicesCache.set(d.id, d);
          }
        }
        this.persistLocalState('devices');
      }
    }
    return Array.from(this.devicesCache.values());
  }

  public async saveDevice(device: DeviceRecord, idToken?: string): Promise<void> {
    this.devicesCache.set(device.id, device);
    this.persistLocalState('devices');

    if (idToken) {
      const res = await firestoreRest.setDocument(
        'devices',
        device.id,
        toCleanDeviceRecord(device),
        idToken
      );
      if (res.status !== 'OK') {
        console.warn('[DatabaseService] Firestore saveDevice warning:', res.error);
      }
    }
  }

  // ================= SESSIONS =================
  public async getSession(sessionToken: string, idToken?: string): Promise<UserSessionRecord | null> {
    const cached = this.sessionsCache.get(sessionToken) || null;
    if (idToken && sessionToken) {
      const cloudRes = await firestoreRest.getDocument<UserSessionRecord>(
        'sessions',
        sessionToken,
        idToken
      );
      if (cloudRes.status === 'OK') {
        const cloudSess = cloudRes.data;
        const localTime = cached ? new Date(cached.lastSeenAt || 0).getTime() : -1;
        const cloudTime = new Date(cloudSess.lastSeenAt || 0).getTime();
        if (!cached || cloudTime >= localTime || cloudSess.status !== cached.status) {
          this.sessionsCache.set(cloudSess.sessionToken, cloudSess);
          this.persistLocalState('sessions');
          return cloudSess;
        }
      }
    }
    return cached;
  }

  public async saveSession(session: UserSessionRecord, idToken?: string): Promise<void> {
    this.sessionsCache.set(session.sessionToken, session);
    this.persistLocalState('sessions');

    if (idToken) {
      const res = await firestoreRest.setDocument(
        'sessions',
        session.sessionToken,
        toCleanSessionRecord(session),
        idToken
      );
      if (res.status !== 'OK') {
        console.warn('[DatabaseService] Firestore saveSession warning:', res.error);
      }
    }
  }

  public async invalidateUserSessions(userId: string, idToken?: string): Promise<void> {
    if (idToken) {
      const cloudRes = await firestoreRest.queryByField<UserSessionRecord>(
        'sessions',
        'userId',
        userId,
        idToken
      );
      if (cloudRes.ok) {
        for (const s of cloudRes.items) {
          if (s?.sessionToken && !this.sessionsCache.has(s.sessionToken)) {
            this.sessionsCache.set(s.sessionToken, s);
          }
        }
      }
    }

    for (const [key, session] of this.sessionsCache.entries()) {
      if (session.userId === userId) {
        session.status = 'REVOKED';
        this.sessionsCache.set(key, session);
        if (idToken) {
          await firestoreRest.setDocument(
            'sessions',
            session.sessionToken,
            toCleanSessionRecord(session),
            idToken
          );
        }
      }
    }
    this.persistLocalState('sessions');
  }

  public async invalidateCodeSessions(codeId: string, idToken?: string): Promise<void> {
    if (idToken) {
      const cloudRes = await firestoreRest.queryByField<UserSessionRecord>(
        'sessions',
        'codeId',
        codeId,
        idToken
      );
      if (cloudRes.ok) {
        for (const s of cloudRes.items) {
          if (s?.sessionToken && !this.sessionsCache.has(s.sessionToken)) {
            this.sessionsCache.set(s.sessionToken, s);
          }
        }
      }
    }

    for (const [key, session] of this.sessionsCache.entries()) {
      if (session.codeId === codeId && session.status === 'ACTIVE') {
        session.status = 'REVOKED';
        this.sessionsCache.set(key, session);
        if (idToken) {
          await firestoreRest.setDocument(
            'sessions',
            session.sessionToken,
            toCleanSessionRecord(session),
            idToken
          );
        }
      }
    }
    this.persistLocalState('sessions');
  }

  public async expireCodeSessions(codeId: string, idToken?: string): Promise<void> {
    let changed = false;
    for (const [key, session] of this.sessionsCache.entries()) {
      if (session.codeId === codeId && session.status === 'ACTIVE') {
        session.status = 'EXPIRED';
        this.sessionsCache.set(key, session);
        changed = true;
        if (idToken) {
          await firestoreRest.setDocument(
            'sessions',
            session.sessionToken,
            toCleanSessionRecord(session),
            idToken
          );
        }
      }
    }
    if (changed) {
      this.persistLocalState('sessions');
    }
  }

  public async getSessionsByUser(userId: string, idToken?: string): Promise<UserSessionRecord[]> {
    if (idToken) {
      const cloudRes = await firestoreRest.queryByField<UserSessionRecord>(
        'sessions',
        'userId',
        userId,
        idToken
      );
      if (cloudRes.ok) {
        for (const s of cloudRes.items) {
          if (s?.sessionToken) this.sessionsCache.set(s.sessionToken, s);
        }
        this.persistLocalState('sessions');
      }
    }
    return Array.from(this.sessionsCache.values()).filter((s) => s.userId === userId);
  }

  public async getAllSessions(): Promise<UserSessionRecord[]> {
    return Array.from(this.sessionsCache.values());
  }

  public async getActiveSessionsCount(): Promise<number> {
    const now = Date.now();
    return Array.from(this.sessionsCache.values()).filter(
      (s) => s.status === 'ACTIVE' && (!s.expiresAt || new Date(s.expiresAt).getTime() > now)
    ).length;
  }

  // ================= API CREDENTIALS =================
  public toPublicCredentialRecord(cred: UserApiCredentialRecord | null): Omit<UserApiCredentialRecord, 'sessionTokenEncrypted'> | null {
    if (!cred) return null;
    const { sessionTokenEncrypted, ...rest } = cred;
    return {
      ...rest,
      hasToken: Boolean(sessionTokenEncrypted || (cred.sessionTokenMasked && cred.sessionTokenMasked !== '****')),
    };
  }

  public async getCredentials(userId: string): Promise<UserApiCredentialRecord | null> {
    return this.credentialsCache.get(userId) || null;
  }

  public async getPublicCredentials(userId: string): Promise<Omit<UserApiCredentialRecord, 'sessionTokenEncrypted'> | null> {
    const rec = await this.getCredentials(userId);
    return this.toPublicCredentialRecord(rec);
  }

  public async saveCredentials(cred: UserApiCredentialRecord): Promise<void> {
    this.credentialsCache.set(cred.userId, cred);
    this.persistLocalState('api_credentials');
  }

  public async deleteCredentials(userId: string): Promise<void> {
    this.credentialsCache.delete(userId);
    this.persistLocalState('api_credentials');
  }

  // ================= AUDIT LOGS =================
  public async addAuditLog(
    log: Omit<AuditLogRecord, 'id' | 'timestamp'>,
    idToken?: string
  ): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...log,
    };
    this.auditLogsCache.unshift(record);
    if (this.auditLogsCache.length > 500) {
      this.auditLogsCache = this.auditLogsCache.slice(0, 500);
    }
    this.persistLocalState('audit_logs');

    if (idToken) {
      await firestoreRest.setDocument(
        'audit_logs',
        record.id,
        {
          id: record.id,
          action: String(record.action).slice(0, 128),
          actor: String(record.actor).slice(0, 256),
          details: record.details || {},
          ipAddress: record.ipAddress ? String(record.ipAddress).slice(0, 64) : null,
          timestamp: record.timestamp,
        },
        idToken
      );
    }
    return record;
  }

  public async getAuditLogs(limitCount = 100, idToken?: string): Promise<AuditLogRecord[]> {
    if (idToken) {
      const cloudRes = await firestoreRest.listCollection<AuditLogRecord>('audit_logs', idToken, limitCount);
      if (cloudRes.ok && cloudRes.items.length > 0) {
        const merged = new Map<string, AuditLogRecord>();
        for (const item of this.auditLogsCache) merged.set(item.id, item);
        for (const item of cloudRes.items) {
          if (item?.id) merged.set(item.id, item);
        }
        this.auditLogsCache = Array.from(merged.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 500);
        this.persistLocalState('audit_logs');
      }
    }
    return this.auditLogsCache.slice(0, limitCount);
  }
}

export const dbService = DatabaseService.getInstance();
