// Deliberately loose — RFC 5322 in full is not worth reproducing here; this
// exists to catch obvious typos/garbage before an OTP send is attempted,
// not to be a complete validator. Matches the client's
// app/domain/email.ts.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

// Case- and whitespace-insensitive identity — "Foo@Bar.com" and
// " foo@bar.com " must resolve to the same account, since email addresses
// are case-insensitive in the mailbox-domain portion in practice, and this
// app has no need to distinguish them.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
