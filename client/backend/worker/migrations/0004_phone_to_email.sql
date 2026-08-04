-- Migration number: 0004 	 2026-08-01T00:00:00.000Z

-- Groups switches from phone/SMS-OTP auth to email/email-OTP auth. This is
-- a private test build (per Terms) with only test data — explicit decision
-- to wipe rather than migrate phone numbers into an email column, since a
-- phone number isn't a valid email address to carry forward.
DELETE FROM settlements;
DELETE FROM expense_item_assignments;
DELETE FROM expense_items;
DELETE FROM expenses;
DELETE FROM group_members;
DELETE FROM otp_codes;
DELETE FROM auth_sessions;
DELETE FROM groups;
DELETE FROM users;

DROP INDEX IF EXISTS idx_otp_codes_phone_created;
DROP INDEX IF EXISTS idx_group_members_phone;

ALTER TABLE users RENAME COLUMN phone_e164 TO email;
ALTER TABLE otp_codes RENAME COLUMN phone_e164 TO email;
ALTER TABLE group_members RENAME COLUMN phone_e164 TO email;

CREATE INDEX idx_otp_codes_email_created ON otp_codes (email, created_at);
CREATE INDEX idx_group_members_email ON group_members (email);
