import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/index.js';
import { _clearRateLimits, hashPin, newToken, hashToken } from '../src/util.js';
import { rides } from '../src/state.js';

const app = buildApp({ dbPath: ':memory:', bootstrapCode: 'TESTCODE' });
await app.ready();

/** Insert an approved (or given-status) user directly, bypassing /join. */
function makeUser({ name, phone, pin = '1234', isDeacon = 0, status = 'approved' }) {
  const info = app.db
    .prepare(`INSERT INTO users (name, phone, pin_hash, is_deacon, status) VALUES (?, ?, ?, ?, ?)`)
    .run(name, phone, hashPin(pin), isDeacon, status);
  return Number(info.lastInsertRowid);
}

/** Insert a session directly, bypassing /login. Returns the bearer token. */
function makeSession(userId) {
  const token = newToken();
  const { expiresAt } = app.db.prepare(`SELECT datetime('now', '+30 days') AS expiresAt`).get();
  app.db
    .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`)
    .run(hashToken(token), userId, expiresAt);
  return token;
}

function makeMember(opts) {
  const id = makeUser(opts);
  const token = makeSession(id);
  return { id, token };
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

let rider, driver, otherDriver;

beforeEach(() => {
  _clearRateLimits();
  rides.clear();
  rider = makeMember({ name: 'Rider', phone: `+1000${Math.random()}` });
  driver = makeMember({ name: 'Driver', phone: `+1001${Math.random()}` });
  otherDriver = makeMember({ name: 'Other Driver', phone: `+1002${Math.random()}` });
});

after(async () => {
  await app.close();
});

function createRide(token, overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/rides',
    headers: authHeaders(token),
    payload: {
      pickup: { lat: 40.1, lng: -75.1 },
      destination: { lat: 40.2, lng: -75.2, label: 'Church' },
      ...overrides,
    },
  });
}

// --- create validation & 409 on second active ride --------------------

test('POST /rides rejects a non-finite pickup', async () => {
  const res = await createRide(rider.token, { pickup: { lat: 'nope', lng: -75.1 } });
  assert.equal(res.statusCode, 400);
});

test('POST /rides rejects a missing destination', async () => {
  const res = await createRide(rider.token, { destination: undefined });
  assert.equal(res.statusCode, 400);
});

test('POST /rides creates an open ride owned by the caller', async () => {
  const res = await createRide(rider.token);
  assert.equal(res.statusCode, 200);
  const { ride } = res.json();
  assert.equal(ride.status, 'open');
  assert.equal(ride.riderId, rider.id);
  assert.equal(ride.riderName, 'Rider');
  assert.equal(rides.size, 1);
});

test('POST /rides 409s if the caller already has an active ride', async () => {
  const first = await createRide(rider.token);
  assert.equal(first.statusCode, 200);

  const second = await createRide(rider.token);
  assert.equal(second.statusCode, 409);
  assert.equal(rides.size, 1);
});

// --- accept flow --------------------------------------------------------

test('POST /rides/:id/accept 404s for an unknown ride', async () => {
  const res = await app.inject({ method: 'POST', url: '/rides/999/accept', headers: authHeaders(driver.token) });
  assert.equal(res.statusCode, 404);
});

test('POST /rides/:id/accept 409s if the ride is not open', async () => {
  const created = await createRide(rider.token);
  const id = created.json().ride.id;

  const first = await app.inject({ method: 'POST', url: `/rides/${id}/accept`, headers: authHeaders(driver.token) });
  assert.equal(first.statusCode, 200);

  const second = await app.inject({
    method: 'POST',
    url: `/rides/${id}/accept`,
    headers: authHeaders(otherDriver.token),
  });
  assert.equal(second.statusCode, 409);
});

test('POST /rides/:id/accept 409s if the rider tries to accept their own ride', async () => {
  const created = await createRide(rider.token);
  const id = created.json().ride.id;

  const res = await app.inject({ method: 'POST', url: `/rides/${id}/accept`, headers: authHeaders(rider.token) });
  assert.equal(res.statusCode, 409);
});

test('POST /rides/:id/accept sets driver fields and status', async () => {
  const created = await createRide(rider.token);
  const id = created.json().ride.id;

  const res = await app.inject({ method: 'POST', url: `/rides/${id}/accept`, headers: authHeaders(driver.token) });
  assert.equal(res.statusCode, 200);
  const { ride } = res.json();
  assert.equal(ride.status, 'accepted');
  assert.equal(ride.driverId, driver.id);
  assert.equal(ride.driverName, 'Driver');
});

// --- complete -------------------------------------------------------------

test('POST /rides/:id/complete deletes the ride from state', async () => {
  const created = await createRide(rider.token);
  const id = created.json().ride.id;
  await app.inject({ method: 'POST', url: `/rides/${id}/accept`, headers: authHeaders(driver.token) });

  const res = await app.inject({ method: 'POST', url: `/rides/${id}/complete`, headers: authHeaders(driver.token) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(rides.has(id), false);
});

test('POST /rides/:id/complete rejects a caller who is neither rider nor driver', async () => {
  const created = await createRide(rider.token);
  const id = created.json().ride.id;

  const res = await app.inject({
    method: 'POST',
    url: `/rides/${id}/complete`,
    headers: authHeaders(otherDriver.token),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(rides.has(id), true);
});

// --- cancel -----------------------------------------------------------

test('rider cancel deletes the ride', async () => {
  const created = await createRide(rider.token);
  const id = created.json().ride.id;
  await app.inject({ method: 'POST', url: `/rides/${id}/accept`, headers: authHeaders(driver.token) });

  const res = await app.inject({ method: 'POST', url: `/rides/${id}/cancel`, headers: authHeaders(rider.token) });
  assert.equal(res.statusCode, 200);
  assert.equal(rides.has(id), false);
});

test('driver cancel reopens the ride with driver fields cleared', async () => {
  const created = await createRide(rider.token);
  const id = created.json().ride.id;
  await app.inject({ method: 'POST', url: `/rides/${id}/accept`, headers: authHeaders(driver.token) });

  const res = await app.inject({ method: 'POST', url: `/rides/${id}/cancel`, headers: authHeaders(driver.token) });
  assert.equal(res.statusCode, 200);

  const ride = rides.get(id);
  assert.ok(ride, 'ride should still exist, reopened');
  assert.equal(ride.status, 'open');
  assert.equal(ride.driverId, null);
  assert.equal(ride.driverName, null);
});

test('POST /rides/:id/cancel 404s for an unknown ride', async () => {
  const res = await app.inject({ method: 'POST', url: '/rides/999/cancel', headers: authHeaders(rider.token) });
  assert.equal(res.statusCode, 404);
});
