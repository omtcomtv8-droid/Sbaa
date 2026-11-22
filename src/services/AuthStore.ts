import {
  auth,
  signInWithGoogle as fbSignInWithGoogle,
  logOut as fbLogOut,
  getCurrentIdToken,
  syncUserProfileToFirestore,
} from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { safeStorage } from '../lib/safeStorage';
import { safeFetchJson } from '../lib/safeFetchJson';
import { sanitizeActivationCodeInput } from '../utils/codeNormalizer';
import { pocketOptionSessionStore } from './PocketOptionSessionStore';
import { accountStore } from './AccountStore';
import { authHeadersStore } from '../utils/safeFetch';
import { tradeHistoryStorage } from './TradeHistoryStorage';

export type AuthState =
  | 'ACTIVE'
  | 'UNAUTHENTICATED'
  | 'NEEDS_ACTIVATION'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DEVICE_LIMIT_REACHED';

export interface UserInfo {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role?: string;
}

export interface ActivationInfo {
  id?: string;
  code: string;
  status: string;
  durationHours: number;
  durationLabel?: string;
  expiresAt: string | null;
  exactExpiration?: string | null;
  maxDevices?: number;
  activeDevicesCount?: number;
}

export interface AuthStoreState {
  authState: AuthState;
  user: UserInfo | null;
  firebaseUser: FirebaseUser | null;
  activation: ActivationInfo | null;
  sessionToken: string | null;
  deviceToken: string | null;
  isInitializingAuth: boolean;
  isAuthenticatingGoogle: boolean;
  isActivating: boolean;
  errorMessage: string | null;
}

type Listener = (state: AuthStoreState) => void;

function getOrCreateDeviceFingerprint(): string {
  const existing = safeStorage.getLocalItem('sabaa_device_fp');
  if (existing) return existing;
  const generated = `fp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  safeStorage.setLocalItem('sabaa_device_fp', generated);
  return generated;
}

const MAX_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours (safe for 32-bit setTimeout with 30d/365d durations)

class AuthStore {
  private static instance: AuthStore;
  private listeners = new Set<Listener>();
  private syncInFlight: Promise<void> | null = null;
  private verifyInFlight: Promise<boolean> | null = null;
  private lastVerifyCompletedAt = 0;
  private kickOutInFlight: Promise<void> | null = null;
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAuthNotice: string | null = null;

  private state: AuthStoreState = {
    authState: 'UNAUTHENTICATED',
    user: null,
    firebaseUser: null,
    activation: null,
    sessionToken: null,
    deviceToken: null,
    isInitializingAuth: true,
    isAuthenticatingGoogle: false,
    isActivating: false,
    errorMessage: null,
  };

  private constructor() {
    this.restoreFromStorage();
    this.initFirebaseListener();
  }

  public static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  private restoreFromStorage() {
    try {
      const savedSession = safeStorage.getLocalItem('sabaa_session_token');
      const savedDevice = safeStorage.getLocalItem('sabaa_device_token');
      if (savedSession || savedDevice) {
        authHeadersStore.setAuthTokens({
          sessionToken: savedSession || null,
          deviceToken: savedDevice || null,
        });
      }
      this.state = {
        ...this.state,
        sessionToken: savedSession || null,
        deviceToken: savedDevice || null,
      };
    } catch (e) {
      console.warn('[AuthStore] Restore error:', e);
    }
  }

  private clearExpirationTimer() {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  private async clearBrokerSession(explicitSessionToken?: string | null, explicitDeviceToken?: string | null): Promise<void> {
    try {
      pocketOptionSessionStore.disconnect();
      accountStore.resetConnection('DISCONNECTED');
      const tokenToUse = explicitSessionToken ?? this.state.sessionToken;
      const devTokenToUse = explicitDeviceToken ?? this.state.deviceToken;
      if (tokenToUse) {
        const headers: Record<string, string> = {
          'x-session-token': tokenToUse,
        };
        if (devTokenToUse) headers['x-device-token'] = devTokenToUse;
        await fetch('/api/account/disconnect', { method: 'POST', headers });
      }
    } catch {
      // ignore network failure during session teardown
    }
  }

  private scheduleExpirationTimer(expiresAt: string | null | undefined, serverTimeIso?: string) {
    this.clearExpirationTimer();
    if (!expiresAt || this.state.authState !== 'ACTIVE') return;

    const expMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expMs)) return;

    const nowMs = serverTimeIso ? new Date(serverTimeIso).getTime() : Date.now();
    const remainingMs = expMs - (Number.isFinite(nowMs) ? nowMs : Date.now());

    if (remainingMs <= 0) {
      void this.handleExpiredKickOut();
      return;
    }

    const delayMs = Math.min(remainingMs + 150, MAX_TIMEOUT_MS);
    this.expirationTimer = setTimeout(() => {
      this.expirationTimer = null;
      if (this.state.authState !== 'ACTIVE') return;
      const currentRemaining = expMs - Date.now();
      if (currentRemaining <= 0) {
        void this.handleExpiredKickOut();
      } else {
        this.scheduleExpirationTimer(expiresAt);
      }
    }, delayMs);
  }

  public async handleExpiredKickOut(reasonMessage?: string, skipServerCheck = false): Promise<void> {
    if (this.kickOutInFlight) {
      await this.kickOutInFlight;
      return;
    }

    const run = async () => {
      if (!skipServerCheck && this.state.sessionToken && auth.currentUser) {
        try {
          const idToken = await getCurrentIdToken(false);
          const { ok, data } = await safeFetchJson<any>('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken: this.state.sessionToken,
              deviceToken: this.state.deviceToken,
              userId: auth.currentUser.uid,
              ...(idToken ? { idToken } : {}),
            }),
            retryOnRateLimit: true,
            maxRetries: 2,
          });
          if (ok && data?.valid) {
            const nextExp = data.expiresAt ?? data.activation?.expiresAt ?? null;
            if (this.state.activation && nextExp !== this.state.activation.expiresAt) {
              this.setState({
                activation: {
                  ...this.state.activation,
                  expiresAt: nextExp,
                },
              });
            }
            if (nextExp) {
              this.scheduleExpirationTimer(nextExp, data.serverTime);
            }
            return;
          }
          if (data?.error && !reasonMessage) {
            reasonMessage = data.error;
          }
        } catch {
          // Network unreachable past local expiry -> proceed with kick-out
        }
      }

      const notice =
        reasonMessage ||
        'انتهت صلاحية كود التفعيل الخاص بك، تم تسجيل خروجك تلقائياً. يرجى تسجيل الدخول مرة أخرى وإدخال كود جديد.';

      this.clearExpirationTimer();
      this.pendingAuthNotice = notice;

      safeStorage.removeSessionItem('sabaa_admin_token');
      safeStorage.removeSessionItem('sabaa_keyroom_unlocked');
      void this.clearBrokerSession();

      try {
        await fbLogOut();
      } catch (err) {
        console.warn('[AuthStore] Firebase logout on expiration notice:', err);
      }

      this.pendingAuthNotice = null;
      this.setState({
        authState: 'UNAUTHENTICATED',
        user: null,
        firebaseUser: null,
        activation: null,
        sessionToken: null,
        deviceToken: null,
        isInitializingAuth: false,
        errorMessage: notice,
      });
    };

    this.kickOutInFlight = run().finally(() => {
      this.kickOutInFlight = null;
    });
    await this.kickOutInFlight;
  }

  private initFirebaseListener() {
    try {
      onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          void this.syncWithBackendForGoogleUser(fbUser);
        } else {
          this.clearExpirationTimer();
          const notice = this.pendingAuthNotice;
          this.setState({
            firebaseUser: null,
            user: null,
            activation: null,
            sessionToken: null,
            deviceToken: null,
            authState: 'UNAUTHENTICATED',
            isInitializingAuth: false,
            ...(notice ? { errorMessage: notice } : {}),
          });
        }
      });
    } catch (e) {
      console.warn('[AuthStore] Firebase listener init:', e);
      this.setState({ isInitializingAuth: false });
    }
  }

  private async syncWithBackendForGoogleUser(fbUser: FirebaseUser): Promise<void> {
    if (this.syncInFlight) {
      await this.syncInFlight;
      return;
    }

    const run = async () => {
      const fallbackUser: UserInfo = {
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Trader',
        photoURL: fbUser.photoURL || undefined,
      };

      const tryPreserveStoredActiveSession = (reasonText: string | null): boolean => {
        try {
          const savedToken = this.state.sessionToken || safeStorage.getLocalItem('sabaa_session_token');
          const savedUserRaw = safeStorage.getLocalItem('sabaa_user');
          const savedActRaw = safeStorage.getLocalItem('sabaa_activation');
          if (!savedToken || !savedUserRaw || !savedActRaw) return false;
          const savedUser = JSON.parse(savedUserRaw) as UserInfo;
          const savedAct = JSON.parse(savedActRaw) as ActivationInfo;
          if (!savedUser?.uid || savedUser.uid !== fbUser.uid) return false;
          if (savedAct.expiresAt && Date.now() >= new Date(savedAct.expiresAt).getTime()) {
            return false;
          }
          this.setState({
            firebaseUser: fbUser,
            user: { ...fallbackUser, ...savedUser },
            activation: savedAct,
            sessionToken: savedToken,
            deviceToken: this.state.deviceToken || safeStorage.getLocalItem('sabaa_device_token') || null,
            authState: 'ACTIVE',
            isInitializingAuth: false,
            errorMessage: null,
          });
          setTimeout(() => {
            void this.checkActivationStatus(true);
          }, 4000);
          return true;
        } catch {
          return false;
        }
      };

      try {
        const idToken = await fbUser.getIdToken();
        const result = await safeFetchJson<any>('/api/auth/google-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            deviceFingerprint: getOrCreateDeviceFingerprint(),
            sessionToken: this.state.sessionToken,
            deviceToken: this.state.deviceToken,
          }),
          retryOnRateLimit: true,
          maxRetries: 3,
          baseDelayMs: 700,
        });

        const data = result.data;
        const isTransientFailure = result.rateLimited || result.isNetworkError || result.status >= 500;

        if (!result.ok || !data?.success) {
          if (isTransientFailure && tryPreserveStoredActiveSession(result.errorMessage || null)) {
            return;
          }
          this.setState({
            firebaseUser: fbUser,
            user: fallbackUser,
            activation: null,
            sessionToken: null,
            authState: 'NEEDS_ACTIVATION',
            isInitializingAuth: false,
            errorMessage: data?.error || result.errorMessage || null,
          });
          return;
        }

        const serverUser: UserInfo = data.user
          ? {
              uid: data.user.uid || fbUser.uid,
              email: data.user.email || fallbackUser.email,
              displayName: data.user.displayName || fallbackUser.displayName,
              photoURL: data.user.photoURL || fallbackUser.photoURL,
              role: data.user.role,
            }
          : fallbackUser;

        if (data.hasActiveLicense && data.activation && data.sessionToken) {
          const activationInfo: ActivationInfo = {
            id: data.activation.id,
            code: data.activation.code,
            status: data.activation.status,
            durationHours: data.activation.durationHours,
            durationLabel: data.activation.durationLabel,
            expiresAt: data.activation.expiresAt || null,
            exactExpiration: data.activation.exactExpiration || null,
            maxDevices: data.activation.maxDevices,
            activeDevicesCount: data.activation.activeDevicesCount,
          };

          this.setState({
            firebaseUser: fbUser,
            user: serverUser,
            activation: activationInfo,
            sessionToken: data.sessionToken,
            deviceToken: data.deviceToken || this.state.deviceToken,
            authState: 'ACTIVE',
            isInitializingAuth: false,
            errorMessage: null,
          });

          void syncUserProfileToFirestore(fbUser.uid, {
            email: serverUser.email,
            displayName: serverUser.displayName,
            role: (serverUser.role as 'trader' | 'admin' | 'guest') || 'trader',
            status: 'ACTIVE',
            activeActivationId: activationInfo.id,
            activeCode: activationInfo.code?.toUpperCase() === 'SBAA0000' ? '••••••••' : activationInfo.code,
            activeExpiresAt: activationInfo.expiresAt,
          }).catch((err) => console.warn('[AuthStore] Firestore sync warning:', err));
        } else {
          const nextState: AuthState =
            data.state === 'EXPIRED' || data.state === 'REVOKED' || data.state === 'DEVICE_LIMIT_REACHED'
              ? data.state
              : 'NEEDS_ACTIVATION';

          this.setState({
            firebaseUser: fbUser,
            user: serverUser,
            activation: data.activation
              ? {
                  id: data.activation.id,
                  code: data.activation.code,
                  status: data.activation.status,
                  durationHours: data.activation.durationHours,
                  durationLabel: data.activation.durationLabel,
                  expiresAt: data.activation.expiresAt || null,
                  maxDevices: data.activation.maxDevices,
                  activeDevicesCount: data.activation.activeDevicesCount,
                }
              : null,
            sessionToken: null,
            authState: nextState,
            isInitializingAuth: false,
            errorMessage: data.error || null,
          });

          void syncUserProfileToFirestore(fbUser.uid, {
            email: serverUser.email,
            displayName: serverUser.displayName,
            role: (serverUser.role as 'trader' | 'admin' | 'guest') || 'trader',
            status: 'ACTIVE',
          }).catch((err) => console.warn('[AuthStore] Firestore sync warning:', err));
        }
      } catch (err: any) {
        console.warn('[AuthStore] Google session backend sync error:', err);
        this.setState({
          firebaseUser: fbUser,
          user: fallbackUser,
          activation: null,
          sessionToken: null,
          authState: 'NEEDS_ACTIVATION',
          isInitializingAuth: false,
        });
      }
    };

    this.syncInFlight = run().finally(() => {
      this.syncInFlight = null;
    });
    await this.syncInFlight;
  }

  public getState(): AuthStoreState {
    return { ...this.state };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(partial: Partial<AuthStoreState>) {
    this.state = { ...this.state, ...partial };
    try {
      if (this.state.sessionToken) safeStorage.setLocalItem('sabaa_session_token', this.state.sessionToken);
      else safeStorage.removeLocalItem('sabaa_session_token');

      safeStorage.setLocalItem('sabaa_auth_state', this.state.authState);

      if (this.state.user) safeStorage.setLocalItem('sabaa_user', JSON.stringify(this.state.user));
      else safeStorage.removeLocalItem('sabaa_user');

      if (this.state.activation) safeStorage.setLocalItem('sabaa_activation', JSON.stringify(this.state.activation));
      else safeStorage.removeLocalItem('sabaa_activation');

      if (this.state.deviceToken) safeStorage.setLocalItem('sabaa_device_token', this.state.deviceToken);
      else safeStorage.removeLocalItem('sabaa_device_token');

      if (this.state.sessionToken || this.state.deviceToken) {
        authHeadersStore.setAuthTokens({
          sessionToken: this.state.sessionToken,
          deviceToken: this.state.deviceToken,
        });
      } else {
        authHeadersStore.clear();
      }

      if (this.state.authState === 'ACTIVE' && this.state.user?.uid) {
        tradeHistoryStorage.setActiveUser(this.state.user.uid);
      } else {
        tradeHistoryStorage.setActiveUser(null);
      }
    } catch {}

    if (this.state.authState === 'ACTIVE' && this.state.activation?.expiresAt) {
      this.scheduleExpirationTimer(this.state.activation.expiresAt);
    } else if (this.state.authState !== 'ACTIVE' || !this.state.activation?.expiresAt) {
      this.clearExpirationTimer();
    }

    this.listeners.forEach((l) => {
      try {
        l(this.getState());
      } catch (err) {
        console.error('[AuthStore] Listener error:', err);
      }
    });
  }

  public async signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
    this.setState({ isAuthenticatingGoogle: true, errorMessage: null });
    try {
      const res = await fbSignInWithGoogle();
      if (res.error) {
        this.setState({ isAuthenticatingGoogle: false, errorMessage: res.error });
        return { success: false, error: res.error };
      }
      if (res.user) {
        await this.syncWithBackendForGoogleUser(res.user);
        this.setState({ isAuthenticatingGoogle: false });
        return { success: true };
      }
      this.setState({ isAuthenticatingGoogle: false });
      return { success: false, error: 'Sign in failed' };
    } catch (err: any) {
      this.setState({ isAuthenticatingGoogle: false, errorMessage: err.message });
      return { success: false, error: err.message };
    }
  }

  public async activateCode(rawCode: string): Promise<{ success: boolean; error?: string }> {
    this.setState({ isActivating: true, errorMessage: null });
    const trimmedCode = sanitizeActivationCodeInput(rawCode);
    if (!trimmedCode) {
      const error = 'يرجى إدخال رمز التفعيل.';
      this.setState({ isActivating: false, errorMessage: error });
      return { success: false, error };
    }

    if (this.syncInFlight) {
      try {
        await this.syncInFlight;
      } catch {}
    }

    let idToken = await getCurrentIdToken(false);
    if (!idToken && auth.currentUser) {
      idToken = await getCurrentIdToken(true);
    }
    if (!idToken || !auth.currentUser) {
      const error = 'يرجى تسجيل الدخول بحساب Google أولاً قبل إدخال كود التفعيل.';
      this.setState({ isActivating: false, authState: 'UNAUTHENTICATED', errorMessage: error });
      return { success: false, error };
    }

    try {
      const sendActivateRequest = async (tokenToUse: string) => {
        return await safeFetchJson<any>('/api/auth/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: trimmedCode,
            idToken: tokenToUse,
            deviceFingerprint: getOrCreateDeviceFingerprint(),
          }),
          retryOnRateLimit: true,
          maxRetries: 3,
          baseDelayMs: 750,
        });
      };

      let result = await sendActivateRequest(idToken);
      if (result.status === 401 && result.data?.errorCode === 'GOOGLE_AUTH_REQUIRED') {
        const refreshed = await getCurrentIdToken(true);
        if (refreshed) {
          result = await sendActivateRequest(refreshed);
        }
      }

      const data = result.data;
      if (!result.ok || !data?.success || !data?.sessionToken) {
        const error =
          data?.error ||
          result.errorMessage ||
          'رمز التفعيل غير صالح أو منتهي الصلاحية.';
        const nextState: AuthState =
          data?.errorCode === 'CODE_ALREADY_USED'
            ? (this.state.authState === 'UNAUTHENTICATED' ? 'NEEDS_ACTIVATION' : this.state.authState)
            : data?.errorCode === 'CODE_EXPIRED'
            ? 'EXPIRED'
            : data?.errorCode === 'DEVICE_LIMIT_REACHED'
            ? 'DEVICE_LIMIT_REACHED'
            : data?.errorCode === 'CODE_REVOKED' || data?.errorCode === 'CODE_DISABLED' || data?.errorCode === 'USER_DISABLED'
            ? 'REVOKED'
            : this.state.authState === 'UNAUTHENTICATED'
            ? 'NEEDS_ACTIVATION'
            : this.state.authState;

        this.setState({ isActivating: false, authState: nextState, errorMessage: error });
        return { success: false, error };
      }

      const fbUser = auth.currentUser;
      const user: UserInfo = {
        uid: data.user?.uid || fbUser.uid,
        email: data.user?.email || fbUser.email || '',
        displayName: data.user?.displayName || fbUser.displayName || fbUser.email?.split('@')[0] || 'Trader',
        photoURL: data.user?.photoURL || fbUser.photoURL || undefined,
        role: data.role || data.user?.role || 'trader',
      };

      const activationInfo: ActivationInfo = {
        id: data.codeId,
        code: data.code || trimmedCode.toUpperCase(),
        status: 'ACTIVE',
        durationHours: data.durationHours ?? 0,
        durationLabel: data.durationLabel || 'License Active',
        expiresAt: data.expiresAt || null,
        maxDevices: data.maxDevices ?? 1,
        activeDevicesCount: data.activeDevicesCount ?? 1,
      };

      // Ensure newly activated user starts with an empty SSD/UID box and no inherited server broker session
      await this.clearBrokerSession(data.sessionToken, data.deviceToken || this.state.deviceToken);

      this.setState({
        isActivating: false,
        authState: 'ACTIVE',
        sessionToken: data.sessionToken,
        deviceToken: data.deviceToken || this.state.deviceToken,
        firebaseUser: fbUser,
        user,
        activation: activationInfo,
        errorMessage: null,
      });

      void syncUserProfileToFirestore(fbUser.uid, {
        email: user.email,
        displayName: user.displayName,
        role: (user.role as 'trader' | 'admin' | 'guest') || 'trader',
        status: 'ACTIVE',
        activeActivationId: activationInfo.id,
        activeCode: activationInfo.code?.toUpperCase() === 'SBAA0000' ? '••••••••' : activationInfo.code,
        activeExpiresAt: activationInfo.expiresAt,
      }).catch((err) => console.warn('[AuthStore] Firestore sync warning:', err));

      return { success: true };
    } catch (err: any) {
      const error = err?.message || 'تعذر التحقق من رمز التفعيل عبر الخادم.';
      this.setState({ isActivating: false, errorMessage: error });
      return { success: false, error };
    }
  }

  public async logOut(): Promise<void> {
    this.clearExpirationTimer();
    this.pendingAuthNotice = null;
    const token = this.state.sessionToken;
    const devToken = this.state.deviceToken;
    await this.clearBrokerSession(token, devToken);
    if (token) {
      try {
        const idToken = await getCurrentIdToken(false);
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': token,
            ...(devToken ? { 'x-device-token': devToken } : {}),
          },
          body: JSON.stringify({ sessionToken: token, ...(idToken ? { idToken } : {}) }),
        });
      } catch {}
    }
    await fbLogOut();
    safeStorage.removeSessionItem('sabaa_admin_token');
    safeStorage.removeSessionItem('sabaa_keyroom_unlocked');
    this.setState({
      authState: 'UNAUTHENTICATED',
      user: null,
      firebaseUser: null,
      activation: null,
      sessionToken: null,
      deviceToken: null,
      isInitializingAuth: false,
      errorMessage: null,
    });
  }

  public async checkActivationStatus(force = false): Promise<boolean> {
    if (!auth.currentUser) {
      if (this.state.authState !== 'UNAUTHENTICATED') {
        this.setState({
          authState: 'UNAUTHENTICATED',
          sessionToken: null,
          activation: null,
          user: null,
          firebaseUser: null,
        });
      }
      return false;
    }

    if (!this.state.sessionToken || this.state.isActivating) {
      return this.state.authState === 'ACTIVE';
    }

    if (this.verifyInFlight) {
      return await this.verifyInFlight;
    }

    if (!force && Date.now() - this.lastVerifyCompletedAt < 5000) {
      return this.state.authState === 'ACTIVE';
    }

    const run = async (): Promise<boolean> => {
      try {
        const idToken = await getCurrentIdToken(false);
        const result = await safeFetchJson<any>('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionToken: this.state.sessionToken,
            deviceToken: this.state.deviceToken,
            userId: auth.currentUser?.uid,
            ...(idToken ? { idToken } : {}),
          }),
          retryOnRateLimit: true,
          maxRetries: 2,
          baseDelayMs: 800,
        });

        this.lastVerifyCompletedAt = Date.now();
        const data = result.data;

        if (result.ok && data?.valid) {
          const serverExp = data.expiresAt ?? data.activation?.expiresAt ?? null;
          if (this.state.activation && serverExp !== this.state.activation.expiresAt) {
            this.setState({
              activation: {
                ...this.state.activation,
                expiresAt: serverExp,
              },
            });
          } else if (serverExp) {
            this.scheduleExpirationTimer(serverExp, data.serverTime);
          }
          return true;
        }

        if (data?.state === 'EXPIRED' || data?.state === 'REVOKED') {
          await this.handleExpiredKickOut(data.error, true);
          return false;
        }

        // Preserve active session on transient 429 Rate exceeded / 5xx / network errors
        if (result.rateLimited || result.isNetworkError || result.status >= 500 || !data) {
          const localExp = this.state.activation?.expiresAt;
          if (localExp && Date.now() >= new Date(localExp).getTime()) {
            await this.handleExpiredKickOut(undefined, true);
            return false;
          }
          return this.state.authState === 'ACTIVE';
        }

        this.setState({
          authState: 'NEEDS_ACTIVATION',
          sessionToken: null,
          errorMessage: data.error || null,
        });
        return false;
      } catch {
        const localExp = this.state.activation?.expiresAt;
        if (localExp && Date.now() >= new Date(localExp).getTime()) {
          await this.handleExpiredKickOut(undefined, true);
          return false;
        }
        return this.state.authState === 'ACTIVE';
      }
    };

    this.verifyInFlight = run().finally(() => {
      this.verifyInFlight = null;
    });
    return await this.verifyInFlight;
  }
}

export const authStore = AuthStore.getInstance();
