// SQLite via Node's built-in driver (Node >= 22.5). Zero native deps.
// ponytail: no rides/locations tables on purpose — live ride + location data is
// in-memory only (see rides.js / live.js). Privacy by architecture.
import { DatabaseSync } from 'node:sqlite';

export const DB_PATH = process.env.HRR_DB_PATH ?? 'holy-roof-rides.db';

export function openDb(path = DB_PATH) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL UNIQUE,
      pin_hash    TEXT NOT NULL,
      is_deacon   INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      invite_code TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code       TEXT PRIMARY KEY,
      created_by INTEGER NOT NULL REFERENCES users(id),
      max_uses   INTEGER NOT NULL DEFAULT 10,
      uses       INTEGER NOT NULL DEFAULT 0,
      revoked    INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS safety_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id     INTEGER NOT NULL REFERENCES users(id),
      subject_user_id INTEGER REFERENCES users(id),
      description     TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}
