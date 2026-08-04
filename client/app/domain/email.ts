// Deliberately loose — this exists to catch obvious typos before a submit,
// not to be a complete RFC 5322 validator. Matches the Worker's own
// backend/worker/src/email.ts.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Case- and whitespace-insensitive identity, matching the Worker's normalization. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
