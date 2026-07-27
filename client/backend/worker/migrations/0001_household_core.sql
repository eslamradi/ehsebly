-- Migration number: 0001 	 2026-07-27T12:26:46.921Z

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per OTP send attempt. code_hash is sha256(code) — the plaintext
-- code is never persisted, only ever held in memory long enough to send it.
CREATE TABLE otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_e164 TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_otp_codes_phone_created ON otp_codes (phone_e164, created_at);

-- token_hash is sha256(bearer token) for the same reason code_hash is
-- hashed above — a leaked DB row shouldn't hand out a usable credential.
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The extensibility-critical table: a row exists per (household, phone) even
-- before that phone has an account (status='pending', user_id NULL). Every
-- expense/settlement below references household_members.id, NEVER users.id
-- directly, so a pending member can already hold a real balance.
CREATE TABLE household_members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT REFERENCES users(id),
  phone_e164 TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','removed')) DEFAULT 'pending',
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (household_id, phone_e164)
);
CREATE INDEX idx_household_members_household_id ON household_members (household_id);
CREATE INDEX idx_household_members_phone ON household_members (phone_e164);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  paid_by_member_id TEXT NOT NULL REFERENCES household_members(id),
  description TEXT NOT NULL,
  subtotal_piastres INTEGER NOT NULL,
  tax_piastres INTEGER NOT NULL DEFAULT 0,
  service_piastres INTEGER NOT NULL DEFAULT 0,
  other_service_piastres INTEGER NOT NULL DEFAULT 0,
  total_piastres INTEGER NOT NULL,
  printed_total_piastres INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expenses_household_id ON expenses (household_id);

CREATE TABLE expense_items (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  name TEXT NOT NULL,
  price_piastres INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_shared INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_expense_items_expense_id ON expense_items (expense_id);

-- Mirrors the client's assignment.ts itemIndex -> personIndex -> weight
-- shape, keyed by household_member_id instead of an array index.
CREATE TABLE expense_item_assignments (
  id TEXT PRIMARY KEY,
  expense_item_id TEXT NOT NULL REFERENCES expense_items(id),
  household_member_id TEXT NOT NULL REFERENCES household_members(id),
  weight INTEGER NOT NULL,
  UNIQUE (expense_item_id, household_member_id)
);
CREATE INDEX idx_expense_item_assignments_item_id ON expense_item_assignments (expense_item_id);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  from_member_id TEXT NOT NULL REFERENCES household_members(id),
  to_member_id TEXT NOT NULL REFERENCES household_members(id),
  amount_piastres INTEGER NOT NULL,
  note TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_settlements_household_id ON settlements (household_id);
