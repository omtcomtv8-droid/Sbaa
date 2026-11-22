import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let ephemeralKey: Buffer | null = null;

function resolveEncryptionKey(): Buffer {
  const configured =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.ADMIN_SESSION_SECRET ||
    '';

  if (configured.trim().length > 0) {
    return crypto.createHash('sha256').update(configured.trim(), 'utf8').digest();
  }

  if (!ephemeralKey) {
    ephemeralKey = crypto.randomBytes(32);
  }
  return ephemeralKey;
}

export function encryptSecret(plaintext: string): string {
  const value = typeof plaintext === 'string' ? plaintext.trim() : '';
  if (!value) return '';

  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(cipherText: string | null | undefined): string | null {
  if (!cipherText || typeof cipherText !== 'string') return null;
  const parts = cipherText.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;

  try {
    const key = resolveEncryptionKey();
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function maskSecret(raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '****';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function maskUid(uid?: string | number | null): string | null {
  if (uid === null || uid === undefined || uid === '' || uid === 0 || uid === '0') {
    return null;
  }
  const s = String(uid).trim();
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

export interface ExtractedSsdMetadata {
  cleanSession: string;
  accountUid: string;
  detectedMode: 'DEMO' | 'REAL' | null;
}

export function extractSsdMetadata(rawInput: string, explicitUid?: string | number | null): ExtractedSsdMetadata {
  let raw = (typeof rawInput === 'string' ? rawInput : '').trim();
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    try {
      const unwrapped = JSON.parse(raw);
      raw = typeof unwrapped === 'string' ? unwrapped.trim() : raw.slice(1, -1).trim();
    } catch {
      raw = raw.slice(1, -1).trim();
    }
  } else if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    raw = raw.slice(1, -1).trim();
  }

  if (raw.includes('%22') || raw.includes('%5B') || raw.includes('%7B') || raw.includes('%3A')) {
    try {
      raw = decodeURIComponent(raw).trim();
    } catch {
      // keep raw
    }
  }

  if (/^(?:42)?\[\\?"auth\\?"/.test(raw) || /^\\?\{\\?"session/.test(raw)) {
    try {
      const candidate = raw.replace(/\\"/g, '"');
      const testJson = candidate.startsWith('42') ? candidate.slice(2) : candidate;
      JSON.parse(testJson.replace(/[\r\n]+/g, '').trim());
      raw = candidate;
    } catch {
      // keep raw
    }
  }

  let cleanSession = raw;
  let accountUid = '';
  let detectedMode: 'DEMO' | 'REAL' | null = null;

  const uidMatch =
    raw.match(/"?(?:uid|user_id)"?\s*[:=]\s*"?(\d+)"?/i) ||
    raw.match(/(?:^|[;&,\s])(?:uid|user_id)\s*=\s*"?(\d+)"?/i);
  if (uidMatch && uidMatch[1] && Number(uidMatch[1]) > 0) {
    accountUid = uidMatch[1];
  }

  if (/(?:^|[;&,\s"{])isDemo"?\s*[:=]\s*"?0"?/i.test(raw) || /(?:^|[;&,\s"{])is_demo"?\s*[:=]\s*"?0"?/i.test(raw)) {
    detectedMode = 'REAL';
  } else if (/(?:^|[;&,\s"{])isDemo"?\s*[:=]\s*"?1"?/i.test(raw) || /(?:^|[;&,\s"{])is_demo"?\s*[:=]\s*"?1"?/i.test(raw)) {
    detectedMode = 'DEMO';
  }

  const authFrameMatch = raw.match(/(?:42\s*)?\[\s*"auth"\s*,\s*(\{[\s\S]*\})\s*\]/i);
  if (authFrameMatch && authFrameMatch[1]) {
    try {
      const payload = JSON.parse(authFrameMatch[1].replace(/[\r\n]+/g, '').trim());
      if (payload && typeof payload === 'object') {
        if (payload.session || payload.sessionToken) cleanSession = String(payload.session || payload.sessionToken).trim();
        if (payload.uid && !accountUid) accountUid = String(payload.uid);
        if (payload.isDemo === 0 || payload.isDemo === '0' || payload.isDemo === false) detectedMode = 'REAL';
        if (payload.isDemo === 1 || payload.isDemo === '1' || payload.isDemo === true) detectedMode = 'DEMO';
      }
    } catch {
      const sessMatch = authFrameMatch[1].match(/"session(?:Token)?"\s*:\s*"((?:[^"\\]|\\.)+)"/i);
      if (sessMatch && sessMatch[1]) {
        try {
          cleanSession = JSON.parse(`"${sessMatch[1]}"`).trim();
        } catch {
          cleanSession = sessMatch[1].replace(/\\"/g, '"').trim();
        }
      }
    }
  } else if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const obj = JSON.parse(raw.replace(/[\r\n]+/g, '').trim());
      if (obj && typeof obj === 'object') {
        if (obj.session || obj.sessionToken) cleanSession = String(obj.session || obj.sessionToken).trim();
        if (obj.uid && !accountUid) accountUid = String(obj.uid);
        if (obj.isDemo === 0 || obj.isDemo === '0' || obj.isDemo === false) detectedMode = 'REAL';
        if (obj.isDemo === 1 || obj.isDemo === '1' || obj.isDemo === true) detectedMode = 'DEMO';
      }
    } catch {
      const sessMatch = raw.match(/"session(?:Token)?"\s*:\s*"((?:[^"\\]|\\.)+)"/i);
      if (sessMatch && sessMatch[1]) {
        try {
          cleanSession = JSON.parse(`"${sessMatch[1]}"`).trim();
        } catch {
          cleanSession = sessMatch[1].replace(/\\"/g, '"').trim();
        }
      }
    }
  } else if (/"session(?:Token)?"\s*:\s*"/i.test(raw)) {
    const sessMatch = raw.match(/"session(?:Token)?"\s*:\s*"((?:[^"\\]|\\.)+)"/i);
    if (sessMatch && sessMatch[1]) {
      try {
        cleanSession = JSON.parse(`"${sessMatch[1]}"`).trim();
      } catch {
        cleanSession = sessMatch[1].replace(/\\"/g, '"').trim();
      }
    }
  } else if (!/^a:\d+:\{[\s\S]*\}/.test(raw) && (raw.includes('SSID=') || raw.includes('session=') || raw.includes('auth=') || raw.includes('PHPSESSID='))) {
    const match = raw.match(/(?:SSID|po_session|session|auth|PHPSESSID)=([^;\s]+)/i);
    if (match && match[1]) {
      cleanSession = match[1].trim();
    }
  }

  cleanSession = cleanSession
    .replace(/^(?:SSID|po_session|session|auth|PHPSESSID)=/i, '')
    .trim();

  if (
    (cleanSession.startsWith('"') && cleanSession.endsWith('"')) ||
    (cleanSession.startsWith("'") && cleanSession.endsWith("'"))
  ) {
    cleanSession = cleanSession.slice(1, -1).trim();
  }

  if (/^a:\d+:\{[\s\S]*\}/.test(cleanSession) && cleanSession.includes('\\"')) {
    cleanSession = cleanSession.replace(/\\"/g, '"');
  }

  if (explicitUid !== undefined && explicitUid !== null && String(explicitUid).trim() !== '') {
    accountUid = String(explicitUid).trim();
  }

  return {
    cleanSession,
    accountUid,
    detectedMode,
  };
}
