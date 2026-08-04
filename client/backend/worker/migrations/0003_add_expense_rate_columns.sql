-- Persists the tax/service rate inputs alongside the already-computed
-- piastres amounts on `expenses`. Previously these were received on submit
-- (SubmitExpenseInput, used for server-side arithmetic verification —
-- Story 2.4 code review, 2026-07-30) but discarded rather than stored,
-- since only the ledger reads the *_piastres columns. Admin expense
-- editing (2026-07-30) needs them: without the original rate/enabled
-- inputs, reconstructing them from piastres amounts alone is lossy —
-- 0 service_piastres is ambiguous between "service disabled" and "0%
-- rate, enabled" — and an edit flow must be able to show/restore exactly
-- what the fronter originally entered.
ALTER TABLE expenses ADD COLUMN tax_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN tax_rate_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN service_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN service_rate_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN other_service_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN other_service_rate_percent REAL NOT NULL DEFAULT 0;
