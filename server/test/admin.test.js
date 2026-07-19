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

test('non-deacon gets 403 on /admin/*', async () => {
  const userId = seedUser(app.db, { name: 'Regular Rita' });
  const token = seedSession(app.db, userId);

  const res = await app.inject({ method: 'GET', url: '/admin/pending', headers: authHeader(token) });
  assert.equal(res.statusCode, 403);
});

test('approve/reject flow changes user status', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Dave', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);

  const pendingId = seedUser(app.db, { name: 'Pending Pat', status: 'pending' });
  const pendingRes = await app.inject({
    method: 'GET',
    url: '/admin/pending',
    headers: authHeader(deaconToken),
  });
  assert.equal(pendingRes.statusCode, 200);
  assert.ok(pendingRes.json().users.some((u) => u.id === pendingId));

  const approveRes = await app.inject({
    method: 'POST',
    url: `/admin/users/${pendingId}/approve`,
    headers: authHeader(deaconToken),
  });
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.json().ok, true);
  assert.equal(app.db.prepare('SELECT status FROM users WHERE id = ?').get(pendingId).status, 'approved');

  const rejectedId = seedUser(app.db, { name: 'Rejected Rae', status: 'pending' });
  const rejectRes = await app.inject({
    method: 'POST',
    url: `/admin/users/${rejectedId}/reject`,
    headers: authHeader(deaconToken),
  });
  assert.equal(rejectRes.statusCode, 200);
  assert.equal(app.db.prepare('SELECT status FROM users WHERE id = ?').get(rejectedId).status, 'rejected');
});

test('make-deacon promotes a user', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Dan', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);
  const memberId = seedUser(app.db, { name: 'Future Deacon' });

  const res = await app.inject({
    method: 'POST',
    url: `/admin/users/${memberId}/make-deacon`,
    headers: authHeader(deaconToken),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(app.db.prepare('SELECT is_deacon FROM users WHERE id = ?').get(memberId).is_deacon, 1);

  const membersRes = await app.inject({ method: 'GET', url: '/admin/members', headers: authHeader(deaconToken) });
  const listed = membersRes.json().users.find((u) => u.id === memberId);
  assert.equal(listed.isDeacon, true);
});

test('invite create, list, revoke', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Ivy', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);

  const createRes = await app.inject({
    method: 'POST',
    url: '/admin/invites',
    headers: authHeader(deaconToken),
    payload: { maxUses: 5 },
  });
  assert.equal(createRes.statusCode, 200);
  const { code } = createRes.json();
  assert.equal(code.length, 8);
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/); // no 0/O/1/I

  const listRes = await app.inject({ method: 'GET', url: '/admin/invites', headers: authHeader(deaconToken) });
  assert.equal(listRes.statusCode, 200);
  let found = listRes.json().invites.find((i) => i.code === code);
  assert.ok(found);
  assert.equal(found.maxUses, 5);
  assert.equal(found.uses, 0);
  assert.equal(found.revoked, false);
  assert.equal(found.createdByName, 'Deacon Ivy');

  const revokeRes = await app.inject({
    method: 'POST',
    url: `/admin/invites/${code}/revoke`,
    headers: authHeader(deaconToken),
  });
  assert.equal(revokeRes.statusCode, 200);

  const listRes2 = await app.inject({ method: 'GET', url: '/admin/invites', headers: authHeader(deaconToken) });
  found = listRes2.json().invites.find((i) => i.code === code);
  assert.equal(found.revoked, true);

  const revokeMissing = await app.inject({
    method: 'POST',
    url: '/admin/invites/NOTAREAL/revoke',
    headers: authHeader(deaconToken),
  });
  assert.equal(revokeMissing.statusCode, 404);
});

test('member files a report; deacon lists it with names and resolves it', async () => {
  const deaconId = seedUser(app.db, { name: 'Deacon Zoe', isDeacon: true });
  const deaconToken = seedSession(app.db, deaconId);
  const memberId = seedUser(app.db, { name: 'Reporter Rick' });
  const memberToken = seedSession(app.db, memberId);

  const fileRes = await app.inject({
    method: 'POST',
    url: '/reports',
    headers: authHeader(memberToken),
    payload: { description: 'Something felt unsafe during the ride.' },
  });
  assert.equal(fileRes.statusCode, 200);
  assert.equal(fileRes.json().ok, true);

  const emptyRes = await app.inject({
    method: 'POST',
    url: '/reports',
    headers: authHeader(memberToken),
    payload: { description: '   ' },
  });
  assert.equal(emptyRes.statusCode, 400);

  const listRes = await app.inject({ method: 'GET', url: '/admin/reports', headers: authHeader(deaconToken) });
  assert.equal(listRes.statusCode, 200);
  const report = listRes.json().reports.find((r) => r.reporterName === 'Reporter Rick');
  assert.ok(report);
  assert.equal(report.status, 'open');
  assert.equal(report.subjectName, null);
  assert.equal(report.description, 'Something felt unsafe during the ride.');

  const resolveRes = await app.inject({
    method: 'POST',
    url: `/admin/reports/${report.id}/resolve`,
    headers: authHeader(deaconToken),
  });
  assert.equal(resolveRes.statusCode, 200);

  const listRes2 = await app.inject({ method: 'GET', url: '/admin/reports', headers: authHeader(deaconToken) });
  const resolved = listRes2.json().reports.find((r) => r.id === report.id);
  assert.equal(resolved.status, 'resolved');
});

test('pending member cannot file a report', async () => {
  const pendingId = seedUser(app.db, { name: 'Pending Pete', status: 'pending' });
  const token = seedSession(app.db, pendingId);

  const res = await app.inject({
    method: 'POST',
    url: '/reports',
    headers: authHeader(token),
    payload: { description: 'This should not go through.' },
  });
  assert.equal(res.statusCode, 403);
});
