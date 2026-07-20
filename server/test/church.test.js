import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/index.js';
import { hashPin, newToken, hashToken, _clearRateLimits } from '../src/util.js';

let app;
let phoneSeq = 0;

function seedUser(db, { name, pin = '1234', isDeacon = false, status = 'approved' } = {}) {
  phoneSeq += 1;
  const phone = `+1555000${String(phoneSeq).padStart(4, '0')}`;
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
});

after(async () => {
  await app.close();
});

test('GET /church returns null when unset', async () => {
  const memberId = seedUser(app.db, { name: 'Member Meg' });
  const token = seedSession(app.db, memberId);

  const res = await app.inject({ method: 'GET', url: '/church', headers: authHeader(token) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { church: null });
});

test('deacon PUT then GET round-trips the church location', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Dave', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);

  const putRes = await app.inject({
    method: 'PUT',
    url: '/admin/church',
    headers: authHeader(deaconToken),
    payload: { name: 'Holy Roof Chapel', address: '123 Main St', lat: 35.1, lng: -80.2 },
  });
  assert.equal(putRes.statusCode, 200);
  assert.deepEqual(putRes.json(), { ok: true });

  const memberId = seedUser(app.db, { name: 'Member Mia' });
  const memberToken = seedSession(app.db, memberId);
  const getRes = await app.inject({ method: 'GET', url: '/church', headers: authHeader(memberToken) });
  assert.equal(getRes.statusCode, 200);
  assert.deepEqual(getRes.json(), {
    church: { name: 'Holy Roof Chapel', address: '123 Main St', lat: 35.1, lng: -80.2 },
  });
});

test('PUT /admin/church rejects empty name', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Empty', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);

  const res = await app.inject({
    method: 'PUT',
    url: '/admin/church',
    headers: authHeader(deaconToken),
    payload: { name: '   ', address: '123 Main St', lat: 1, lng: 1 },
  });
  assert.equal(res.statusCode, 400);
});

test('PUT /admin/church rejects a non-finite lat', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Bad Lat', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);

  const res = await app.inject({
    method: 'PUT',
    url: '/admin/church',
    headers: authHeader(deaconToken),
    payload: { name: 'Chapel', address: '123 Main St', lat: 'not-a-number', lng: 1 },
  });
  assert.equal(res.statusCode, 400);
});

test('non-deacon PUT /admin/church returns 403', async () => {
  const memberId = seedUser(app.db, { name: 'Member Nora' });
  const memberToken = seedSession(app.db, memberId);

  const res = await app.inject({
    method: 'PUT',
    url: '/admin/church',
    headers: authHeader(memberToken),
    payload: { name: 'Chapel', address: '123 Main St', lat: 1, lng: 1 },
  });
  assert.equal(res.statusCode, 403);
});

test('pending member GET /church returns 403', async () => {
  const pendingId = seedUser(app.db, { name: 'Pending Paul', status: 'pending' });
  const token = seedSession(app.db, pendingId);

  const res = await app.inject({ method: 'GET', url: '/church', headers: authHeader(token) });
  assert.equal(res.statusCode, 403);
});

test('second PUT overwrites the first (upsert)', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Overwrite', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);

  const first = await app.inject({
    method: 'PUT',
    url: '/admin/church',
    headers: authHeader(deaconToken),
    payload: { name: 'Old Chapel', address: '1 Old Rd', lat: 1, lng: 2 },
  });
  assert.equal(first.statusCode, 200);

  const second = await app.inject({
    method: 'PUT',
    url: '/admin/church',
    headers: authHeader(deaconToken),
    payload: { name: 'New Chapel', address: '2 New Rd', lat: 3, lng: 4 },
  });
  assert.equal(second.statusCode, 200);

  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM settings').get().n, 4);

  const memberId = seedUser(app.db, { name: 'Member Overwrite Check' });
  const memberToken = seedSession(app.db, memberId);
  const getRes = await app.inject({ method: 'GET', url: '/church', headers: authHeader(memberToken) });
  assert.deepEqual(getRes.json(), {
    church: { name: 'New Chapel', address: '2 New Rd', lat: 3, lng: 4 },
  });
});
