/** Web Crypto only — no dependency, matches this Worker's existing zero-runtime-deps state. */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const OTP_DIGITS = 6;

export function randomOtpCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (array[0] % 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, '0');
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateId(): string {
  return crypto.randomUUID();
}
