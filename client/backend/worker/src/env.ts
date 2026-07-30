export interface Env {
  ANTHROPIC_API_KEY: string;
  // Optional — absent until the user creates a real Twilio (or equivalent)
  // account. sms.ts falls back to console-logging the OTP when these are
  // unset, so the whole auth flow is buildable/testable before that account
  // exists. That fallback is only allowed when ENVIRONMENT isn't
  // "production" — see sms.ts.
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  // Set via wrangler.jsonc's `vars` per environment ("production" for the
  // default deploy, "staging" for the staging env). Unset locally
  // (`wrangler dev`), which is what keeps the console-log OTP fallback
  // available for local testing.
  ENVIRONMENT?: string;
  DB: D1Database;
}
