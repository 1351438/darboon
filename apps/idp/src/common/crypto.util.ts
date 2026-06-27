import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/** SHA-256 hex digest. Used to store/compare high-entropy opaque secrets. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A URL-safe, high-entropy opaque token (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** A zero-padded numeric OTP of the given length using a CSPRNG. */
export function randomNumericCode(length: number): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}

/**
 * Constant-time comparison of two hex-encoded digests of equal length.
 * Returns false (without leaking timing) when lengths differ.
 */
export function safeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
