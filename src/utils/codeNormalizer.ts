const INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g;
const UNICODE_DASHES_REGEX = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

export function sanitizeActivationCodeInput(input: string): string {
  if (!input) return '';
  const ascii = input
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
    .replace(INVISIBLE_CHARS_REGEX, '')
    .replace(UNICODE_DASHES_REGEX, '-')
    .trim();

  // Extract from Telegram deep link if pasted
  const startMatch = ascii.match(/[?&]start=([^&\s]+)/i);
  let target = ascii;
  if (startMatch && startMatch[1]) {
    try {
      target = decodeURIComponent(startMatch[1]).trim();
    } catch {
      target = startMatch[1].trim();
    }
  }

  const sabaaMatch = target
    .toUpperCase()
    .match(/SABAA[\s-]*([A-Z0-9]{4})[\s-]*([A-Z0-9]{4})[\s-]*([A-Z0-9]{4})/);
  if (sabaaMatch) {
    return `SABAA-${sabaaMatch[1]}-${sabaaMatch[2]}-${sabaaMatch[3]}`;
  }

  return target.toUpperCase();
}
