export interface Env {
  ANTHROPIC_API_KEY: string;
  // Optional — absent until the user creates a real Brevo (or equivalent)
  // account. brevo.ts falls back to console-logging the OTP when this is
  // unset, so the whole auth flow is buildable/testable before that account
  // exists. That fallback is only allowed when ENVIRONMENT isn't
  // "production" — see brevo.ts.
  BREVO_API_KEY?: string;
  // Optional — when unset, extraction always goes straight to Sonnet
  // (geminiExtract.ts's cheap-first path is skipped entirely). See
  // extract.ts's extractReceipt for the accept/reject gate.
  GEMINI_API_KEY?: string;
  // Shared secret for the cost/usage dashboard's GET /admin/stats route —
  // set via `wrangler secret put`, never in wrangler.jsonc `vars`. Optional
  // so local `wrangler dev` still runs; adminAuth.ts rejects every request
  // to that route when it's unset rather than leaving it open.
  ADMIN_DASHBOARD_TOKEN?: string;
  // Set via wrangler.jsonc's `vars` per environment ("production" for the
  // default deploy, "staging" for the staging env). Unset locally
  // (`wrangler dev`), which is what keeps the console-log OTP fallback
  // available for local testing.
  ENVIRONMENT?: string;
  DB: D1Database;
}
