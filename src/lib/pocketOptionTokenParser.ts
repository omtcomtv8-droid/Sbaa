export interface ParsedPocketOptionToken {
  cleanSession: string;
  detectedUid: number | null;
  detectedPlatform: number | null;
  payloadDetectedMode: 'DEMO' | 'REAL' | null;
  formatLabel: string;
  formatCode: 'COMPLETE_SOCKET_IO_FRAME' | 'JSON_PAYLOAD' | 'PHP_SERIALIZED_SSD' | 'COOKIE_HEADER_STRING' | 'RAW_SESSION_TOKEN';
  maskedSession: string;
  isValid: boolean;
  errorReason: string | null;
}

function unescapeJsonStringFragment(fragment: string): string {
  try {
    return JSON.parse(`"${fragment}"`);
  } catch {
    return fragment
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\\//g, '/');
  }
}

function sanitizeJsonControlChars(str: string): string {
  return str.replace(/[\r\n]+/g, '').trim();
}

export function parsePocketOptionTokenInput(
  rawInput: string,
  explicitUid?: string | number | null
): ParsedPocketOptionToken {
  let input = (typeof rawInput === 'string' ? rawInput : '').trim();

  // If the user pasted a JSON-stringified copy (e.g. "\"42[\\\"auth\\\",...]\"")
  if (input.startsWith('"') && input.endsWith('"') && input.length >= 2) {
    try {
      const unwrapped = JSON.parse(input);
      if (typeof unwrapped === 'string') {
        input = unwrapped.trim();
      } else {
        input = input.slice(1, -1).trim();
      }
    } catch {
      input = input.slice(1, -1).trim();
    }
  } else if (input.startsWith("'") && input.endsWith("'") && input.length >= 2) {
    input = input.slice(1, -1).trim();
  }

  // Decode URL-encoded payload if copied from cookie or query parameter
  if (input.includes('%22') || input.includes('%5B') || input.includes('%7B') || input.includes('%3A')) {
    try {
      input = decodeURIComponent(input).trim();
    } catch {
      // Keep original input if malformed percent-encoding
    }
  }

  // Handle outer-escaped DevTools copies like: 42[\"auth\",{\"session\":...}] or {\"session\":...}
  if (/^(?:42)?\[\\?"auth\\?"/.test(input) || /^\\?\{\\?"session/.test(input)) {
    try {
      const candidate = input.replace(/\\"/g, '"');
      const testJson = candidate.startsWith('42') ? candidate.slice(2) : candidate;
      JSON.parse(sanitizeJsonControlChars(testJson));
      input = candidate;
    } catch {
      // Leave input untouched if unescaping outer quotes does not produce valid JSON
    }
  }

  let detectedUid: number | null = null;
  if (explicitUid !== undefined && explicitUid !== null && String(explicitUid).trim() !== '') {
    const parsedExplicit = parseInt(String(explicitUid).trim(), 10);
    if (!isNaN(parsedExplicit) && parsedExplicit > 0) {
      detectedUid = parsedExplicit;
    }
  }

  let detectedPlatform: number | null = null;
  let payloadDetectedMode: 'DEMO' | 'REAL' | null = null;
  let formatLabel = 'FORMAT A (مفتاح مباشر Raw Session)';
  let formatCode: ParsedPocketOptionToken['formatCode'] = 'RAW_SESSION_TOKEN';
  let cleanSession = input;

  // Pre-scan UID / isDemo / platform safely
  const uidRegexMatch =
    input.match(/"?(?:uid|user_id)"?\s*[:=]\s*"?(\d+)"?/i) ||
    input.match(/(?:^|[;&,\s])(?:uid|user_id)\s*=\s*"?(\d+)"?/i);
  if (uidRegexMatch && uidRegexMatch[1] && Number(uidRegexMatch[1]) > 0 && !detectedUid) {
    detectedUid = Number(uidRegexMatch[1]);
  }

  const platformMatch = input.match(/"?platform"?\s*[:=]\s*"?(\d+)"?/i);
  if (platformMatch && platformMatch[1]) {
    const pNum = Number(platformMatch[1]);
    if (!isNaN(pNum) && pNum > 0) detectedPlatform = pNum;
  }

  if (/(?:^|[;&,\s"{])isDemo"?\s*[:=]\s*"?0"?/i.test(input) || /(?:^|[;&,\s"{])is_demo"?\s*[:=]\s*"?0"?/i.test(input)) {
    payloadDetectedMode = 'REAL';
  } else if (/(?:^|[;&,\s"{])isDemo"?\s*[:=]\s*"?1"?/i.test(input) || /(?:^|[;&,\s"{])is_demo"?\s*[:=]\s*"?1"?/i.test(input)) {
    payloadDetectedMode = 'DEMO';
  }

  // 1. Check Socket.IO frame: 42["auth",{...}] or ["auth",{...}] (also supports missing trailing ] on mobile copy)
  const isSocketIoAuthPrefix = /(?:^|[\s\S])(?:42\s*)?\[\s*"auth"\s*,\s*\{/i.test(input);

  if (isSocketIoAuthPrefix) {
    formatLabel = 'FORMAT B (حزمة DevTools 42["auth", ...] كاملة)';
    formatCode = 'COMPLETE_SOCKET_IO_FRAME';
    let parsedSuccess = false;

    const bracketMatch = input.match(/(?:42\s*)?(\[\s*"auth"\s*,\s*\{[\s\S]*\])/i);
    if (bracketMatch && bracketMatch[1]) {
      try {
        const parsed = JSON.parse(sanitizeJsonControlChars(bracketMatch[1]));
        const payload = Array.isArray(parsed) && parsed.length > 1 ? parsed[1] : parsed;
        if (payload && typeof payload === 'object') {
          if (payload.session || payload.sessionToken) {
            cleanSession = String(payload.session || payload.sessionToken).trim();
            parsedSuccess = true;
          }
          if (payload.uid !== undefined && payload.uid !== null && !detectedUid) {
            const numUid = Number(payload.uid);
            if (!isNaN(numUid) && numUid > 0) detectedUid = numUid;
          }
          if (payload.platform !== undefined) {
            const numPlatform = Number(payload.platform);
            if (!isNaN(numPlatform) && numPlatform > 0) detectedPlatform = numPlatform;
          }
          if (payload.isDemo === 0 || payload.isDemo === '0' || payload.isDemo === false) {
            payloadDetectedMode = 'REAL';
          } else if (payload.isDemo === 1 || payload.isDemo === '1' || payload.isDemo === true) {
            payloadDetectedMode = 'DEMO';
          }
        }
      } catch {
        // Fallback below preserves escaped \" inside PHP serialized session
      }
    }

    if (!parsedSuccess) {
      const escapedSessionMatch = input.match(/"session(?:Token)?"\s*:\s*"((?:[^"\\]|\\.)+)"/i);
      if (escapedSessionMatch && escapedSessionMatch[1]) {
        cleanSession = unescapeJsonStringFragment(escapedSessionMatch[1]).trim();
      }
    }
  } else if (input.startsWith('{') && (input.endsWith('}') || input.includes('"session'))) {
    // 2. JSON object payload: {"session":"...","isDemo":0,"uid":...}
    formatLabel = 'FORMAT B (JSON Payload)';
    formatCode = 'JSON_PAYLOAD';
    try {
      const obj = JSON.parse(sanitizeJsonControlChars(input));
      if (obj && typeof obj === 'object') {
        if (obj.session || obj.sessionToken) {
          cleanSession = String(obj.session || obj.sessionToken).trim();
        }
        if (obj.uid !== undefined && obj.uid !== null && !detectedUid) {
          const numUid = Number(obj.uid);
          if (!isNaN(numUid) && numUid > 0) detectedUid = numUid;
        }
        if (obj.platform !== undefined) {
          const numPlatform = Number(obj.platform);
          if (!isNaN(numPlatform) && numPlatform > 0) detectedPlatform = numPlatform;
        }
        if (obj.isDemo === 0 || obj.isDemo === '0' || obj.isDemo === false) {
          payloadDetectedMode = 'REAL';
        } else if (obj.isDemo === 1 || obj.isDemo === '1' || obj.isDemo === true) {
          payloadDetectedMode = 'DEMO';
        }
      }
    } catch {
      const escapedSessionMatch = input.match(/"session(?:Token)?"\s*:\s*"((?:[^"\\]|\\.)+)"/i);
      if (escapedSessionMatch && escapedSessionMatch[1]) {
        cleanSession = unescapeJsonStringFragment(escapedSessionMatch[1]).trim();
      }
    }
  } else if (/^a:\d+:\{[\s\S]*\}/.test(input)) {
    // 3. Raw PHP serialized SSD string (must preserve the ENTIRE a:4:{...}hash envelope!)
    formatLabel = 'FORMAT A (PHP Serialized SSD كامل)';
    formatCode = 'PHP_SERIALIZED_SSD';
    cleanSession = input.includes('\\"') ? input.replace(/\\"/g, '"') : input;
  } else {
    // 4. Cookie header string (e.g. SSID=...; session=...;)
    const ssidMatch = input.match(/(?:^|[;\s])SSID\s*=\s*([^;]+)/i);
    const sessionCookieMatch = input.match(/(?:^|[;\s])(?:po_session|session|remember_code)\s*=\s*([^;]+)/i);
    const phpCookieMatch = input.match(/(?:^|[;\s])PHPSESSID\s*=\s*([^;]+)/i);

    if (ssidMatch && ssidMatch[1]) {
      formatLabel = 'FORMAT A (Cookie SSID)';
      formatCode = 'COOKIE_HEADER_STRING';
      cleanSession = ssidMatch[1].trim();
    } else if (sessionCookieMatch && sessionCookieMatch[1]) {
      formatLabel = 'FORMAT A (Cookie Session)';
      formatCode = 'COOKIE_HEADER_STRING';
      cleanSession = sessionCookieMatch[1].trim();
    } else if (phpCookieMatch && phpCookieMatch[1]) {
      formatLabel = 'FORMAT A (PHPSESSID)';
      formatCode = 'COOKIE_HEADER_STRING';
      cleanSession = phpCookieMatch[1].trim();
    }
  }

  // Final cleanup of any wrapping quotes without harming internal PHP quotes
  cleanSession = cleanSession
    .replace(/^(?:SSID|po_session|session|auth|PHPSESSID)=/i, '')
    .trim();

  if (
    (cleanSession.startsWith('"') && cleanSession.endsWith('"')) ||
    (cleanSession.startsWith("'") && cleanSession.endsWith("'")) ||
    (cleanSession.startsWith('`') && cleanSession.endsWith('`'))
  ) {
    cleanSession = cleanSession.slice(1, -1).trim();
  }

  // If cleanSession is itself a PHP serialized string with escaped quotes, unescape safely
  if (/^a:\d+:\{[\s\S]*\}/.test(cleanSession)) {
    formatCode = formatCode === 'COMPLETE_SOCKET_IO_FRAME' || formatCode === 'JSON_PAYLOAD'
      ? formatCode
      : 'PHP_SERIALIZED_SSD';
    if (cleanSession.includes('\\"')) {
      cleanSession = cleanSession.replace(/\\"/g, '"');
    }
  }

  const maskedSession =
    cleanSession.length > 10
      ? `${cleanSession.slice(0, 6)}...${cleanSession.slice(-6)}`
      : cleanSession || '(فارغ)';

  const isTokenLongEnough = cleanSession.length >= 8;

  let errorReason: string | null = null;
  if (!cleanSession) {
    errorReason = 'مفتاح الجلسة فارغ. يرجى إدخال رمز الجلسة أو حزمة DevTools.';
  } else if (!isTokenLongEnough) {
    errorReason = 'رمز الجلسة قصير جداً (أقل من 8 أحرف).';
  }

  return {
    cleanSession,
    detectedUid,
    detectedPlatform,
    payloadDetectedMode,
    formatLabel,
    formatCode,
    maskedSession,
    isValid: isTokenLongEnough,
    errorReason,
  };
}
