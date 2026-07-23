// Idempotently seeds demo accounts + an invite code so a human can practice
// the rider flow (paired with `npm run demo:driver`) without going through
// /join by hand. Safe to run repeatedly — existing phones are never touched.
//
// Usage: node scripts/seed-demo.js   (set HRR_DB_PATH to pick the db file)

import { openDb } from '../src/db.js';
import { hashPin } from '../src/util.js';

const ACCOUNTS = [
  { name: 'Deacon Dana', phone: '5550001111', pin: '1234', isDeacon: 1 },
  { name: 'Gabriel Stone', phone: '5550002222', pin: '2222', isDeacon: 0 },
  { name: 'Josiah (Test Rider)', phone: '5550003333', pin: '3333', isDeacon: 0 },
];

const db = openDb();
const rows = [];

function upsertUser({ name, phone, pin, isDeacon }) {
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) {
    rows.push({ name, phone, status: 'already present' });
    return existing.id;
  }
  const info = db
    .prepare(`INSERT INTO users (name, phone, pin_hash, is_deacon, status) VALUES (?, ?, ?, ?, 'approved')`)
    .run(name, phone, hashPin(pin), isDeacon);
  rows.push({ name, phone, status: 'created' });
  return Number(info.lastInsertRowid);
}

const ids = {};
for (const account of ACCOUNTS) ids[account.phone] = upsertUser(account);
const deaconId = ids['5550001111'];

const inviteExisting = db.prepare('SELECT code FROM invite_codes WHERE code = ?').get('WELCOME1');
if (inviteExisting) {
  rows.push({ name: 'Invite code WELCOME1', phone: '-', status: 'already present' });
} else {
  db.prepare(`INSERT INTO invite_codes (code, created_by, max_uses) VALUES (?, ?, ?)`).run('WELCOME1', deaconId, 25);
  rows.push({ name: 'Invite code WELCOME1', phone: '-', status: 'created' });
}

db.close();

// --- friendly summary table -------------------------------------------
const nameW = Math.max(...rows.map((r) => r.name.length), 'Name'.length);
const phoneW = Math.max(...rows.map((r) => r.phone.length), 'Phone'.length);
console.log('\nDemo seed summary:\n');
console.log(`${'Name'.padEnd(nameW)}  ${'Phone'.padEnd(phoneW)}  Status`);
console.log('-'.repeat(nameW + phoneW + 12));
for (const r of rows) {
  console.log(`${r.name.padEnd(nameW)}  ${r.phone.padEnd(phoneW)}  ${r.status}`);
}
console.log('');
