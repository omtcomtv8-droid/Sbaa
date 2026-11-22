import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import configJson from '../../firebase-applet-config.json';
import { safeStorage } from './safeStorage';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const app = getApps().length === 0 ? initializeApp(configJson) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let firestoreDb: Firestore | null = null;
try {
  const dbId =
    configJson.firestoreDatabaseId && configJson.firestoreDatabaseId !== '(default)'
      ? configJson.firestoreDatabaseId
      : undefined;
  firestoreDb = dbId ? getFirestore(app, dbId) : getFirestore(app);
} catch (e) {
  console.warn('[Firebase] Firestore init warning:', e);
}

export const db = firestoreDb;

export async function testConnection(): Promise<void> {
  if (!firestoreDb) return;
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Firestore client is offline.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export async function signInWithGoogle(): Promise<{ user?: FirebaseUser; error?: string }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { user: result.user };
  } catch (err: any) {
    console.warn('[Firebase Auth] signInWithPopup error or popup closed:', err.message);
    return { error: err.message };
  }
}

export async function logOut(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[Firebase Auth] signOut error:', err);
  }
}

export interface UserConnectionConfig {
  session?: string;
  isDemo?: boolean;
  endpoint?: string;
  poUid?: string;
  accountUid?: string;
  status?: string;
  [key: string]: any;
}

export async function saveUserConnectionConfig(
  uid: string,
  config: UserConnectionConfig
): Promise<void> {
  if (!uid) return;
  if (auth.currentUser && auth.currentUser.uid !== uid) return;

  const sanitizedLocal: UserConnectionConfig = {
    endpoint: String(
      config.endpoint || 'wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket'
    ),
    isDemo: true,
    accountUid: String(config.accountUid || ''),
    sessionTokenMasked: config.sessionTokenMasked ? String(config.sessionTokenMasked) : undefined,
    demoBalance: typeof config.demoBalance === 'number' ? Number(config.demoBalance) : undefined,
    status: String(config.status || 'connected'),
    updatedAt: new Date().toISOString(),
  };

  safeStorage.setLocalItem(`po_config_${uid}`, JSON.stringify(sanitizedLocal));
  if (!firestoreDb || !auth.currentUser || auth.currentUser.uid !== uid) return;
  const path = `users/${uid}/connections/pocket_option`;
  try {
    const ref = doc(firestoreDb, 'users', uid, 'connections', 'pocket_option');
    const firestorePayload: Record<string, any> = {
      userId: uid,
      endpoint: sanitizedLocal.endpoint,
      isDemo: true,
      accountUid: sanitizedLocal.accountUid,
      status: sanitizedLocal.status,
      updatedAt: sanitizedLocal.updatedAt,
    };
    if (sanitizedLocal.sessionTokenMasked) {
      firestorePayload.sessionTokenMasked = sanitizedLocal.sessionTokenMasked;
    }
    if (typeof sanitizedLocal.demoBalance === 'number') {
      firestorePayload.demoBalance = sanitizedLocal.demoBalance;
    }
    await setDoc(ref, firestorePayload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getUserConnectionConfig(
  uid: string
): Promise<UserConnectionConfig | null> {
  if (!uid) return null;
  if (auth.currentUser && auth.currentUser.uid !== uid) return null;
  const local = safeStorage.getLocalItem(`po_config_${uid}`);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (parsed && typeof parsed === 'object') {
        const { session: _droppedSession, ...safeParsed } = parsed;
        return safeParsed as UserConnectionConfig;
      }
    } catch {}
  }
  if (!firestoreDb || !auth.currentUser || auth.currentUser.uid !== uid) return null;
  const path = `users/${uid}/connections/pocket_option`;
  try {
    const ref = doc(firestoreDb, 'users', uid, 'connections', 'pocket_option');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as any;
      if (data.userId && data.userId !== uid) return null;
      const { session: _droppedSession, ...safeData } = data;
      return safeData as UserConnectionConfig;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
  return null;
}

export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[Firebase Auth] getIdToken warning:', err);
    return null;
  }
}

export interface FirestoreUserProfileInput {
  email?: string;
  displayName?: string;
  role?: 'trader' | 'admin' | 'guest';
  status?: 'ACTIVE' | 'DISABLED';
  activeActivationId?: string | null;
  activeExpiresAt?: string | null;
  activeCode?: string | null;
  lastLoginAt?: string;
}

export async function syncUserProfileToFirestore(
  uid: string,
  profile: FirestoreUserProfileInput
): Promise<void> {
  if (!uid || !firestoreDb || !auth.currentUser || auth.currentUser.uid !== uid) return;
  const path = `users/${uid}`;
  const ref = doc(firestoreDb, 'users', uid);

  let existingCreatedAt: string | undefined;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data?.createdAt === 'string' && data.createdAt.length > 0) {
        existingCreatedAt = data.createdAt;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  const nowIso = new Date().toISOString();
  const payload: Record<string, string> = {
    uid,
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };

  if (profile.email && typeof profile.email === 'string') {
    payload.email = profile.email.slice(0, 254);
  }
  if (profile.displayName && typeof profile.displayName === 'string') {
    payload.displayName = profile.displayName.slice(0, 128);
  }
  if (profile.role === 'trader' || profile.role === 'admin' || profile.role === 'guest') {
    payload.role = profile.role;
  }
  if (profile.status === 'ACTIVE' || profile.status === 'DISABLED') {
    payload.status = profile.status;
  }
  if (profile.activeActivationId && typeof profile.activeActivationId === 'string') {
    payload.activeActivationId = profile.activeActivationId.slice(0, 128);
  }
  if (profile.activeExpiresAt && typeof profile.activeExpiresAt === 'string') {
    payload.activeExpiresAt = profile.activeExpiresAt.slice(0, 64);
  }
  if (profile.activeCode && typeof profile.activeCode === 'string') {
    payload.activeCode = profile.activeCode.slice(0, 64);
  }
  if (profile.lastLoginAt && typeof profile.lastLoginAt === 'string') {
    payload.lastLoginAt = profile.lastLoginAt.slice(0, 64);
  } else {
    payload.lastLoginAt = nowIso;
  }

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveTradeOrderToFirestore(uid: string, order: any): Promise<void> {
  if (!uid || !firestoreDb) return;
  const orderId = String(order.id || order.orderId || `order_${Date.now()}`);
  const path = `users/${uid}/orders/${orderId}`;
  try {
    const ref = doc(firestoreDb, 'users', uid, 'orders', orderId);
    const cleanPayload: Record<string, any> = {
      orderId,
      userId: uid,
      symbol: String(order.symbol || order.asset || 'EURUSD_otc'),
      direction: String(order.direction || (order.action === 'put' ? 'SELL' : 'BUY')),
      amount: Number(order.amount || 1),
      status: String(order.status || 'EXECUTED'),
      timestamp: String(order.timestamp || new Date().toISOString()),
    };
    if (order.entryPrice !== undefined) cleanPayload.entryPrice = Number(order.entryPrice);
    if (order.timeframe !== undefined) cleanPayload.timeframe = Number(order.timeframe);
    await setDoc(ref, cleanPayload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
