export interface NormalizedCodeResult {
  raw: string;
  cleaned: string;
  alphanumeric: string;
  formatted: string;
  firestoreDocId: string;
  isMasterAdmin: boolean;
}

const INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g;
const UNICODE_DASHES_REGEX = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

export function normalizeDigitsToAscii(input: string): string {
  return input
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9');
}

/**
 * Extracts and normalizes a license key even if pasted from Telegram deep links,
 * formatted HTML snippets, WhatsApp messages with RTL marks, or smart dashes.
 */
export function normalizeActivationCode(rawInput: string): NormalizedCodeResult {
  const raw = typeof rawInput === 'string' ? rawInput : '';
  const step1 = normalizeDigitsToAscii(raw)
    .replace(INVISIBLE_CHARS_REGEX, '')
    .replace(UNICODE_DASHES_REGEX, '-')
    .trim();

  // Check URL/deep-link query parameter (?start=SABAA-...)
  let candidate = step1;
  try {
    const startMatch = step1.match(/[?&]start=([^&\s]+)/i);
    if (startMatch && startMatch[1]) {
      candidate = decodeURIComponent(startMatch[1]).trim();
    }
  } catch {
    // fallback to original candidate
  }

  // Extract explicit SABAA token if user pasted an entire Telegram share message
  const sabaaMatch = candidate
    .toUpperCase()
    .match(/SABAA[\s-]*([A-Z0-9]{4})[\s-]*([A-Z0-9]{4})[\s-]*([A-Z0-9]{4})/);
  if (sabaaMatch) {
    const formatted = `SABAA-${sabaaMatch[1]}-${sabaaMatch[2]}-${sabaaMatch[3]}`;
    const alphanumeric = `SABAA${sabaaMatch[1]}${sabaaMatch[2]}${sabaaMatch[3]}`;
    return {
      raw,
      cleaned: formatted,
      alphanumeric,
      formatted,
      firestoreDocId: alphanumeric,
      isMasterAdmin: false,
    };
  }

  // Extract master code pattern if embedded cleanly (alone or with whitespace/dashes)
  const upper = candidate.toUpperCase();
  const compactAlphaNum = upper.replace(/[^A-Z0-9]/g, '');
  if (compactAlphaNum === 'SBAA0000') {
    return {
      raw,
      cleaned: 'SBAA0000',
      alphanumeric: 'SBAA0000',
      formatted: 'SBAA0000',
      firestoreDocId: 'SBAA0000',
      isMasterAdmin: true,
    };
  }

  // Reformat compact 17-char SABAAXXXXXXXXXXXX -> SABAA-XXXX-XXXX-XXXX
  if (/^SABAA[A-Z0-9]{12}$/.test(compactAlphaNum)) {
    const c1 = compactAlphaNum.slice(5, 9);
    const c2 = compactAlphaNum.slice(9, 13);
    const c3 = compactAlphaNum.slice(13, 17);
    return {
      raw,
      cleaned: `SABAA-${c1}-${c2}-${c3}`,
      alphanumeric: compactAlphaNum,
      formatted: `SABAA-${c1}-${c2}-${c3}`,
      firestoreDocId: compactAlphaNum,
      isMasterAdmin: false,
    };
  }

  const cleaned = upper.replace(/\s+/g, '');
  const firestoreDocId = compactAlphaNum || cleaned.replace(/[^A-Z0-9_-]/g, '');

  return {
    raw,
    cleaned,
    alphanumeric: compactAlphaNum,
    formatted: cleaned,
    firestoreDocId,
    isMasterAdmin: false,
  };
}
