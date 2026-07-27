// Egypt-only for Stage 1 (household splitting) — ehsebly is already EGP-only,
// so a fixed +20 country code covers real usage without a full
// country-picker UI/library. Matches the worker's own validation
// (backend/worker/src/phone.ts).
const EGYPT_LOCAL_MOBILE_PATTERN = /^01[0125]\d{8}$/;

/** True for an 11-digit local Egyptian mobile number, e.g. "01012345678". */
export function isValidEgyptianMobile(local: string): boolean {
  return EGYPT_LOCAL_MOBILE_PATTERN.test(local);
}

/** "01012345678" -> "+201012345678" — the wire format the Worker expects. */
export function toE164(local: string): string {
  return `+20${local.slice(1)}`;
}

/** "+201012345678" -> "010 1234 5678", for display only. */
export function formatForDisplay(e164: string): string {
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}`;
}
