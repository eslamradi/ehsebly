export interface Env {
  ANTHROPIC_API_KEY: string;
  // Optional — absent until the user creates a real Twilio (or equivalent)
  // account. sms.ts falls back to console-logging the OTP when these are
  // unset, so the whole auth flow is buildable/testable before that account
  // exists.
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  DB: D1Database;
}
