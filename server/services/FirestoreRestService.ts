import fs from 'fs';
import path from 'path';

export interface FirebaseProjectConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

export type FirestoreGetResult<T> =
  | { status: 'OK'; data: T; updateTime?: string }
  | { status: 'NOT_FOUND' }
  | { status: 'PERMISSION_DENIED'; error?: string }
  | { status: 'ERROR'; error: string };

export type FirestoreWriteResult =
  | { status: 'OK'; updateTime?: string }
  | { status: 'CONFLICT'; error: string }
  | { status: 'PERMISSION_DENIED'; error: string }
  | { status: 'ERROR'; error: string };

let cachedConfig: FirebaseProjectConfig | null = null;

export function getFirebaseProjectConfig(): FirebaseProjectConfig | null {
  if (cachedConfig) return cachedConfig;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (raw?.projectId) {
      cachedConfig = {
        projectId: String(raw.projectId),
        apiKey: String(raw.apiKey || ''),
        firestoreDatabaseId: String(raw.firestoreDatabaseId || '(default)'),
      };
      return cachedConfig;
    }
  } catch (err) {
    console.warn('[FirestoreRestService] Could not read firebase-applet-config.json:', err);
  }
  return null;
}

function getDocumentsBaseUrl(): string | null {
  const cfg = getFirebaseProjectConfig();
  if (!cfg) return null;
  const dbId = encodeURIComponent(cfg.firestoreDatabaseId || '(default)');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/${dbId}/documents`;
}

function toFirestoreValue(val: any): Record<string, any> {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val) && Math.abs(val) <= Number.MAX_SAFE_INTEGER) {
      return { integerValue: String(val) };
    }
    return { doubleValue: Number.isFinite(val) ? val : 0 };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values;
    return Array.isArray(arr) ? arr.map((item: any) => fromFirestoreValue(item)) : [];
  }
  if ('mapValue' in val) {
    return fromFirestoreFields(val.mapValue?.fields || {});
  }
  return null;
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function fromFirestoreFields<T = Record<string, any>>(fields: Record<string, any> | undefined): T {
  const out: Record<string, any> = {};
  if (!fields) return out as T;
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out as T;
}

export class FirestoreRestService {
  private static instance: FirestoreRestService;

  public static getInstance(): FirestoreRestService {
    if (!FirestoreRestService.instance) {
      FirestoreRestService.instance = new FirestoreRestService();
    }
    return FirestoreRestService.instance;
  }

  public async getDocument<T>(
    collectionName: string,
    docId: string,
    idToken?: string
  ): Promise<FirestoreGetResult<T>> {
    const baseUrl = getDocumentsBaseUrl();
    if (!baseUrl || !idToken || !docId) {
      return { status: 'ERROR', error: 'Missing Firestore config, docId, or idToken' };
    }

    const url = `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (res.status === 404) {
        return { status: 'NOT_FOUND' };
      }
      if (res.status === 403 || res.status === 401) {
        const text = await res.text().catch(() => '');
        return { status: 'PERMISSION_DENIED', error: text || `HTTP ${res.status}` };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { status: 'ERROR', error: text || `HTTP ${res.status}` };
      }

      const json = await res.json();
      const data = fromFirestoreFields<T>(json.fields);
      return { status: 'OK', data, updateTime: json.updateTime };
    } catch (err: any) {
      return { status: 'ERROR', error: err?.message || 'Firestore GET network error' };
    }
  }

  public async setDocument(
    collectionName: string,
    docId: string,
    data: Record<string, any>,
    idToken?: string,
    expectedUpdateTime?: string
  ): Promise<FirestoreWriteResult> {
    const baseUrl = getDocumentsBaseUrl();
    if (!baseUrl || !idToken || !docId) {
      return { status: 'ERROR', error: 'Missing Firestore config, docId, or idToken' };
    }

    let url = `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
    if (expectedUpdateTime) {
      url += `?currentDocument.updateTime=${encodeURIComponent(expectedUpdateTime)}`;
    }

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: toFirestoreFields(data),
        }),
      });

      if (res.status === 409 || res.status === 412) {
        const text = await res.text().catch(() => '');
        return { status: 'CONFLICT', error: text || `HTTP ${res.status}` };
      }
      if (res.status === 403 || res.status === 401) {
        const text = await res.text().catch(() => '');
        return { status: 'PERMISSION_DENIED', error: text || `HTTP ${res.status}` };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { status: 'ERROR', error: text || `HTTP ${res.status}` };
      }

      const json = await res.json().catch(() => ({}));
      return { status: 'OK', updateTime: json.updateTime };
    } catch (err: any) {
      return { status: 'ERROR', error: err?.message || 'Firestore PATCH network error' };
    }
  }

  public async deleteDocument(
    collectionName: string,
    docId: string,
    idToken?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const baseUrl = getDocumentsBaseUrl();
    if (!baseUrl || !idToken || !docId) {
      return { ok: false, error: 'Missing Firestore config, docId, or idToken' };
    }

    const url = `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok || res.status === 404) {
        return { ok: true };
      }
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Firestore DELETE network error' };
    }
  }

  public async listCollection<T>(
    collectionName: string,
    idToken?: string,
    pageSize = 300
  ): Promise<{ ok: boolean; items: T[]; error?: string }> {
    const baseUrl = getDocumentsBaseUrl();
    if (!baseUrl || !idToken) {
      return { ok: false, items: [], error: 'Missing Firestore config or idToken' };
    }

    const items: T[] = [];
    let pageToken: string | undefined;

    try {
      for (let page = 0; page < 5; page++) {
        let url = `${baseUrl}/${encodeURIComponent(collectionName)}?pageSize=${pageSize}`;
        if (pageToken) {
          url += `&pageToken=${encodeURIComponent(pageToken)}`;
        }
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { ok: false, items: [], error: text || `HTTP ${res.status}` };
        }
        const json = await res.json();
        const docs = Array.isArray(json.documents) ? json.documents : [];
        for (const doc of docs) {
          if (doc?.fields) {
            items.push(fromFirestoreFields<T>(doc.fields));
          }
        }
        if (!json.nextPageToken) break;
        pageToken = json.nextPageToken;
      }
      return { ok: true, items };
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message || 'Firestore list network error' };
    }
  }

  public async queryByField<T>(
    collectionName: string,
    fieldPath: string,
    value: string,
    idToken?: string
  ): Promise<{ ok: boolean; items: T[]; error?: string }> {
    const baseUrl = getDocumentsBaseUrl();
    if (!baseUrl || !idToken) {
      return { ok: false, items: [], error: 'Missing Firestore config or idToken' };
    }

    const url = `${baseUrl}:runQuery`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collectionName }],
            where: {
              fieldFilter: {
                field: { fieldPath },
                op: 'EQUAL',
                value: { stringValue: value },
              },
            },
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, items: [], error: text || `HTTP ${res.status}` };
      }
      const rows = await res.json();
      const items: T[] = [];
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row?.document?.fields) {
            items.push(fromFirestoreFields<T>(row.document.fields));
          }
        }
      }
      return { ok: true, items };
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message || 'Firestore query network error' };
    }
  }
}

export const firestoreRest = FirestoreRestService.getInstance();
