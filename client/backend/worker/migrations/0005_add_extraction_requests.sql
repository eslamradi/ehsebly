-- Migration number: 0005 	 2026-08-03T00:00:00.000Z

-- One row per extraction request, recording what extractReceipt's Gemini
-- accept/reject gate decided AND the real token usage/cost from whichever
-- provider(s) were actually called — the only way to measure the real
-- accept rate and real spend over time, since Cloudflare's live tail logs
-- (wrangler tail) are ephemeral and show nothing once the connection
-- closes. `outcome` is a short label: 'accepted', 'gemini_call_failed', or
-- 'rejected: <reason>' (the reason strings already produced by extract.ts's
-- evaluateGeminiResult / GateDecision — kept as free text rather than an
-- enum column so a new rejection reason never needs a migration to add).
-- Cost columns are nullable because a request only calls Sonnet when
-- Gemini's result wasn't accepted (sonnet_used=0 means the *_sonnet_*
-- columns are legitimately empty, not missing data).
CREATE TABLE extraction_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome TEXT NOT NULL,
  gemini_input_tokens INTEGER,
  gemini_output_tokens INTEGER,
  gemini_cost_usd REAL,
  sonnet_used INTEGER NOT NULL DEFAULT 0,
  sonnet_input_tokens INTEGER,
  sonnet_output_tokens INTEGER,
  sonnet_cost_usd REAL,
  total_cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_extraction_requests_created_at ON extraction_requests (created_at);
