/**
 * TOTP (Time-based One-Time Password) — RFC 6238
 * Zero-dependency implementation using Node.js crypto.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a buffer to a Base32 string (RFC 4648)
 */
export function base32Encode(buffer: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return result;
}

/**
 * Decode a Base32 string to a buffer
 */
export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate a random TOTP secret (base32 encoded, 32 bytes = 160 bits)
 */
export function generateSecret(): string {
  const bytes = randomBytes(20);
  return base32Encode(bytes);
}

/**
 * Generate backup codes (8 codes, alphanumeric)
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const bytes = randomBytes(5);
    const code = Array.from(bytes)
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 10)
      .toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Generate a TOTP code for a given secret and timestamp
 */
export function generateTOTP(secret: string, timestamp: number = Date.now(), period: number = 30, digits: number = 6): string {
  const timeCounter = Math.floor(timestamp / 1000 / period);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(timeCounter));

  const key = base32Decode(secret);
  const hmac = createHmac('sha1', key).update(buffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    Math.pow(10, digits);

  return code.toString().padStart(digits, '0');
}

/**
 * Verify a TOTP code against a secret.
 * Allows ±1 time step window to account for clock drift.
 */
export function verifyTOTP(
  token: string,
  secret: string,
  timestamp: number = Date.now(),
  window: number = 1
): boolean {
  // Ensure token is exactly the expected length
  if (!/^\d{6}$/.test(token)) return false;

  const currentStep = Math.floor(timestamp / 1000 / 30);

  for (let i = -window; i <= window; i++) {
    const testTime = (currentStep + i) * 30 * 1000;
    const expectedToken = generateTOTP(secret, testTime);
    if (timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
      return true;
    }
  }

  return false;
}

/**
 * Generate an otpauth:// URI for QR code provisioning.
 * Format: otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER
 */
export function generateOTPAuthURL(
  accountName: string,
  secret: string,
  issuer: string = 'Hadona Workspace'
): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}