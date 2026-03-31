import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import type { AdminUserRecord, InviteRecord } from "./types.js";

function resolveSqlitePath(): string {
  if (existsSync("/data")) {
    return "/data/admin.db";
  }

  return resolve(process.cwd(), "data", "admin.db");
}

export const sqlitePath = resolveSqlitePath();

mkdirSync(dirname(sqlitePath), { recursive: true });

export const sqlite = new Database(sqlitePath);
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS admin_user (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    accepted_at TEXT,
    resend_message_id TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export const statements = {
  getAdminUserByUsername: sqlite.prepare<[string], AdminUserRecord>(
    "SELECT id, username, password_hash FROM admin_user WHERE username = ?"
  ),
  getFirstAdminUser: sqlite.prepare<[], AdminUserRecord>(
    "SELECT id, username, password_hash FROM admin_user ORDER BY id ASC LIMIT 1"
  ),
  insertAdminUser: sqlite.prepare<[string, string]>(
    "INSERT INTO admin_user (id, username, password_hash) VALUES (1, ?, ?)"
  ),
  updateAdminPasswordByUsername: sqlite.prepare<[string, string]>(
    "UPDATE admin_user SET password_hash = ? WHERE username = ?"
  ),
  listInviteRecords: sqlite.prepare<[], InviteRecord>(
    `SELECT id, code, email, status, created_at, expires_at, accepted_at, resend_message_id
     FROM invite_records
     ORDER BY created_at DESC`
  ),
  countInviteRecords: sqlite.prepare<[], { count: number }>(
    "SELECT COUNT(*) AS count FROM invite_records"
  ),
  countPendingInvites: sqlite.prepare<[], { count: number }>(
    "SELECT COUNT(*) AS count FROM invite_records WHERE status = 'pending'"
  ),
  insertInviteRecord: sqlite.prepare<[string, string, string | null]>(
    "INSERT INTO invite_records (code, email, status, expires_at) VALUES (?, ?, 'pending', ?)"
  ),
  getInviteRecordByCode: sqlite.prepare<[string], InviteRecord>(
    `SELECT id, code, email, status, created_at, expires_at, accepted_at, resend_message_id
     FROM invite_records
     WHERE code = ?`
  ),
  updateInviteResendMessage: sqlite.prepare<[string | null, string]>(
    "UPDATE invite_records SET resend_message_id = ? WHERE code = ?"
  ),
  markInviteRevoked: sqlite.prepare<[string]>(
    "UPDATE invite_records SET status = 'revoked' WHERE code = ?"
  ),
  selectPendingInvites: sqlite.prepare<[], InviteRecord>(
    `SELECT id, code, email, status, created_at, expires_at, accepted_at, resend_message_id
     FROM invite_records
     WHERE status = 'pending'
     ORDER BY created_at DESC`
  ),
  markInviteAccepted: sqlite.prepare<[string]>(
    "UPDATE invite_records SET status = 'accepted', accepted_at = datetime('now') WHERE code = ?"
  ),
  markInviteExpired: sqlite.prepare<[string]>(
    "UPDATE invite_records SET status = 'expired' WHERE code = ?"
  ),
  countRecentBans: sqlite.prepare<[], { count: number }>(
    "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'user_banned' AND created_at > datetime('now', '-30 days')"
  )
};
