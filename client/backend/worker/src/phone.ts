// Egypt-only for Stage 1 — the app is EGP-only already, so a fixed +20
// country code covers it without a full phone-number library. Matches the
// client's app/domain/phone.ts local-format regex (01[0125]xxxxxxxx)
// converted to E.164 (+20, leading 0 dropped).
const EGYPT_MOBILE_E164_PATTERN = /^\+201[0125]\d{8}$/;

export function isValidEgyptianPhoneE164(value: string): boolean {
  return EGYPT_MOBILE_E164_PATTERN.test(value);
}
