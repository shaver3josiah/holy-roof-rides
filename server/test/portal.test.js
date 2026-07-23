import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildApp } from '../src/index.js';
import { hashPin, newToken, hashToken, _clearRateLimits } from '../src/util.js';
import { rides } from '../src/state.js';

const PORTAL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'portal', 'index.html');

let app;
let phoneSeq = 0;

function seedUser(db, { name, pin = '1234', isDeacon = false, status = 'approved' } = {}) {
  phoneSeq += 1;
  const phone = `+1555111${String(phoneSeq).padStart(4, '0')}`;
  const result = db
    .prepare(`INSERT INTO users (name, phone, pin_hash, is_deacon, status) VALUES (?, ?, ?, ?, ?)`)
    .run(name, phone, hashPin(pin), isDeacon ? 1 : 0, status);
  return Number(result.lastInsertRowid);
}

function seedSession(db, userId) {
  const token = newToken();
  db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))`).run(
    hashToken(token),
    userId
  );
  return token;
}

function authHeader(token) {
  return { authorization: `Bearer ${token}` };
}

before(async () => {
  app = buildApp({ dbPath: ':memory:', bootstrapCode: 'TESTCODE' });
  await app.ready();
});

beforeEach(() => {
  _clearRateLimits();
  rides.clear();
});

after(async () => {
  await app.close();
});

test('GET /portal', async () => {
  const res = await app.inject({ method: 'GET', url: '/portal' });
  if (existsSync(PORTAL_PATH)) {
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Holey Lift/);
  } else {
    // portal/index.html not built yet (another agent is writing it concurrently)
    assert.equal(res.statusCode, 404);
    assert.equal(typeof res.json().error, 'string');
  }
});

test('GET /admin/board requires login', async () => {
  const res = await app.inject({ method: 'GET', url: '/admin/board' });
  assert.equal(res.statusCode, 401);
});

test('GET /admin/board is deacon-only', async () => {
  const memberId = seedUser(app.db, { name: 'Regular Rita' });
  const token = seedSession(app.db, memberId);
  const res = await app.inject({ method: 'GET', url: '/admin/board', headers: authHeader(token) });
  assert.equal(res.statusCode, 403);
});

test('GET /admin/board hides coordinates from a deacon', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Dan', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);

  rides.set(1, {
    id: 1,
    riderId: 2,
    riderName: 'Ruth',
    pickup: { lat: 1, lng: 2 },
    destination: { lat: 3, lng: 4, label: 'Clinic' },
    note: null,
    status: 'open',
    driverId: null,
    driverName: null,
    createdAt: '2026-01-01T00:00:00Z',
  });

  const res = await app.inject({ method: 'GET', url: '/admin/board', headers: authHeader(deaconToken) });
  assert.equal(res.statusCode, 200);
  const ride = res.json().rides.find((r) => r.id === 1);
  assert.ok(ride);
  assert.equal(ride.riderName, 'Ruth');
  assert.equal(ride.status, 'open');
  assert.equal(ride.destinationLabel, 'Clinic');

  // Privacy contract: no coordinates or raw pickup/destination objects.
  assert.equal('pickup' in ride, false);
  assert.equal('destination' in ride, false);
  assert.equal('lat' in ride, false);
  assert.equal('lng' in ride, false);
});
