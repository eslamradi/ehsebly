-- Migration number: 0002 	 2026-07-27T12:52:11.580Z

-- Renames the Stage-1 "household" entity to a generic "group" — household
-- splitting and group-trip splitting need identical mechanics (a member
-- roster, a payer per expense, weighted item assignments, settlements, net
-- balances). `kind` distinguishes them for UI copy only; nothing else in
-- this schema is household- or trip-specific. No real user data exists yet
-- (development/testing only), so tables are dropped and recreated rather
-- than altered in place.

DROP TABLE IF EXISTS expense_item_assignments;
DROP TABLE IF EXISTS expense_items;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS household_members;
DROP TABLE IF EXISTS households;

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'household' CHECK (kind IN ('household', 'trip', 'other')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The extensibility-critical table: a row exists per (group, phone) even
-- before that phone has an account (status='pending', user_id NULL). Every
-- expense/settlement below references group_members.id, NEVER users.id
-- directly, so a pending member can already hold a real balance.
CREATE TABLE group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT REFERENCES users(id),
  phone_e164 TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','removed')) DEFAULT 'pending',
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, phone_e164)
);
CREATE INDEX idx_group_members_group_id ON group_members (group_id);
CREATE INDEX idx_group_members_phone ON group_members (phone_e164);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  paid_by_member_id TEXT NOT NULL REFERENCES group_members(id),
  description TEXT NOT NULL,
  subtotal_piastres INTEGER NOT NULL,
  tax_piastres INTEGER NOT NULL DEFAULT 0,
  service_piastres INTEGER NOT NULL DEFAULT 0,
  other_service_piastres INTEGER NOT NULL DEFAULT 0,
  total_piastres INTEGER NOT NULL,
  printed_total_piastres INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expenses_group_id ON expenses (group_id);

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
-- shape, keyed by group_member_id instead of an array index.
CREATE TABLE expense_item_assignments (
  id TEXT PRIMARY KEY,
  expense_item_id TEXT NOT NULL REFERENCES expense_items(id),
  group_member_id TEXT NOT NULL REFERENCES group_members(id),
  weight INTEGER NOT NULL,
  UNIQUE (expense_item_id, group_member_id)
);
CREATE INDEX idx_expense_item_assignments_item_id ON expense_item_assignments (expense_item_id);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  from_member_id TEXT NOT NULL REFERENCES group_members(id),
  to_member_id TEXT NOT NULL REFERENCES group_members(id),
  amount_piastres INTEGER NOT NULL,
  note TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_settlements_group_id ON settlements (group_id);
