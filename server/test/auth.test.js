import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/index.js';
import { hashPin, hashToken, _clearRateLimits } from '../src/util.js';

let app;
let deaconId;
const DEACON_PHONE = '15550000001';
const DEACON_PIN = '1234';

before(async () => {
  app = buildApp({ dbPath: ':memory:', bootstrapCode: 'TESTCODE' });
  await app.ready();

  // Seed a deacon directly (not via /join) so invite_codes.created_by has a
  // valid FK target and login/me tests have a known approved account.
  const info = app.db
    .prepare(
      `INSERT INTO users (name, phone, pin_hash, is_deacon, status) VALUES (?, ?, ?, 1, 'approved')`
    )
    .run('Seed Deacon', DEACON_PHONE, hashPin(DEACON_PIN));
  deaconId = Number(info.lastInsertRowid);
});

beforeEach(() => {
  _clearRateLimits();
});

after(async () => {
  await app.close();
});

function makeInvite(code, overrides = {}) {
  const row = {
    max_uses: 5,
    uses: 0,
    revoked: 0,
    expires_at: null,
    ...overrides,
  };
  app.db
    .prepare(
      `INSERT INTO invite_codes (code, created_by, max_uses, uses, revoked, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(code, deaconId, row.max_uses, row.uses, row.revoked, row.expires_at);
}

function seedSession(userId, token) {
  app.db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now','+30 days'))`
    )
    .run(hashToken(token), userId);
}

test('POST /join - bootstrap: first user with matching bootstrap code becomes founding deacon', async () => {
  const bootApp = buildApp({ dbPath: ':memory:', bootstrapCode: 'FOUND1' });
  await bootApp.ready();
  try {
    const res = await bootApp.inject({
      method: 'POST',
      url: '/join',
      payload: { inviteCode: 'FOUND1', name: 'Founder', phone: '15559990000', pin: '1234' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'approved');
    assert.equal(typeof body.userId, 'number');

    const row = bootApp.db.prepare('SELECT is_deacon, status FROM users WHERE id = ?').get(body.userId);
    assert.equal(row.is_deacon, 1);
    assert.equal(row.status, 'approved');
  } finally {
    await bootApp.close();
  }
});

test('POST /join - normal invite code creates a pending, non-deacon member', async () => {
  makeInvite('NORMAL1');

  const res = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'NORMAL1', name: 'Alice', phone: '(555) 111-2222', pin: '4242' },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'pending');
  assert.equal(typeof body.userId, 'number');

  const row = app.db.prepare('SELECT phone, is_deacon, status FROM users WHERE id = ?').get(body.userId);
  assert.equal(row.phone, '5551112222'); // stored digits-only
  assert.equal(row.is_deacon, 0);

  const invite = app.db.prepare('SELECT uses FROM invite_codes WHERE code = ?').get('NORMAL1');
  assert.equal(invite.uses, 1);
});

test('POST /join - unknown invite code returns 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'NOPE999', name: 'Bob', phone: '15552223333', pin: '1111' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST /join - expired invite code returns 400', async () => {
  makeInvite('EXPIRED1', { expires_at: '2000-01-01 00:00:00' });
  const res = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'EXPIRED1', name: 'Carl', phone: '15552224444', pin: '1111' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST /join - maxed-out invite code returns 400', async () => {
  makeInvite('MAXED1', { max_uses: 1, uses: 1 });
  const res = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'MAXED1', name: 'Dana', phone: '15552225555', pin: '1111' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST /join - revoked invite code returns 400', async () => {
  makeInvite('REVOKED1', { revoked: 1 });
  const res = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'REVOKED1', name: 'Eve', phone: '15552226666', pin: '1111' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST /join - duplicate phone returns 409', async () => {
  makeInvite('DUPE1', { max_uses: 5 });

  const first = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'DUPE1', name: 'Frank', phone: '555-222-7777', pin: '1111' },
  });
  assert.equal(first.statusCode, 200);

  // Same phone, different formatting — must normalize before comparing.
  const second = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'DUPE1', name: 'Frank2', phone: '5552227777', pin: '2222' },
  });
  assert.equal(second.statusCode, 409);
});

test('POST /join - pin must be 4-8 digits', async () => {
  makeInvite('PINCHK1');
  const res = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'PINCHK1', name: 'Gina', phone: '15552228888', pin: '12' },
  });
  assert.equal(res.statusCode, 400);

  const res2 = await app.inject({
    method: 'POST',
    url: '/join',
    payload: { inviteCode: 'PINCHK1', name: 'Gina', phone: '15552228888', pin: 'abcd' },
  });
  assert.equal(res2.statusCode, 400);
});

test('POST /login - success returns token and user', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { phone: DEACON_PHONE, pin: DEACON_PIN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(typeof body.token, 'string');
  assert.equal(body.user.phone, DEACON_PHONE);
  assert.equal(body.user.isDeacon, true);
  assert.equal(body.user.status, 'approved');
});

test('POST /login - wrong pin returns 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { phone: DEACON_PHONE, pin: '9999' },
  });
  assert.equal(res.statusCode, 401);
});

test('POST /login - rate limited after 5 attempts', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { phone: DEACON_PHONE, pin: 'wrong' },
    });
    assert.equal(res.statusCode, 401);
  }
  const sixth = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { phone: DEACON_PHONE, pin: 'wrong' },
  });
  assert.equal(sixth.statusCode, 429);
});

test('GET /me - pending member sees their pending status', async () => {
  const info = app.db
    .prepare(`INSERT INTO users (name, phone, pin_hash, is_deacon, status) VALUES (?, ?, ?, 0, 'pending')`)
    .run('Pending Pete', '15553330001', hashPin('5555'));
  const userId = Number(info.lastInsertRowid);
  const token = 'raw-token-pending';
  seedSession(userId, token);

  const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.user.status, 'pending');
  assert.equal(body.user.isDeacon, false);
});

test('GET /me - approved member sees approved status', async () => {
  const token = 'raw-token-deacon';
  seedSession(deaconId, token);

  const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.user.status, 'approved');
  assert.equal(body.user.isDeacon, true);
});

test('GET /me - no/invalid token returns 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/me' });
  assert.equal(res.statusCode, 401);
});

test('POST /logout - kills the session', async () => {
  const info = app.db
    .prepare(`INSERT INTO users (name, phone, pin_hash, is_deacon, status) VALUES (?, ?, ?, 0, 'approved')`)
    .run('Logout Lucy', '15553330002', hashPin('6666'));
  const userId = Number(info.lastInsertRowid);
  const token = 'raw-token-logout';
  seedSession(userId, token);

  const before = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal(before.statusCode, 200);

  const out = await app.inject({ method: 'POST', url: '/logout', headers: { authorization: `Bearer ${token}` } });
  assert.equal(out.statusCode, 200);
  assert.deepEqual(out.json(), { ok: true });

  const afterLogout = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal(afterLogout.statusCode, 401);
});
