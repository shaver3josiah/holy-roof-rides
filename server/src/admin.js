// CONTRACT (implemented by build agent — keep these exact routes/shapes):
//
// Deacon-only (preHandler requireDeacon(app.db)):
//   GET  /admin/pending             -> {users: [{id,name,phone,createdAt}]}
//   POST /admin/users/:id/approve   -> {ok} (status -> 'approved')
//   POST /admin/users/:id/reject    -> {ok} (status -> 'rejected')
//   POST /admin/users/:id/make-deacon -> {ok} (is_deacon -> 1)
//   GET  /admin/members             -> {users: [{id,name,phone,isDeacon,status,createdAt}]}
//   POST /admin/invites {maxUses?, expiresAt?} -> {code}   (8-char A-Z0-9, no 0/O/1/I)
//   GET  /admin/invites             -> {invites: [{code,maxUses,uses,revoked,expiresAt,createdAt,createdByName}]}
//   POST /admin/invites/:code/revoke -> {ok}
//   GET  /admin/reports             -> {reports: [{id,description,status,createdAt,
//                                       reporterName, subjectName|null}]}
//   POST /admin/reports/:id/resolve -> {ok}
//
// Any approved member (preHandler requireUser(app.db)):
//   POST /reports {subjectUserId?, description} -> {ok}
//     - description required, non-empty, <= 2000 chars.
//
// Use requireUser/requireDeacon from util.js; crypto.randomBytes for codes.

import { randomBytes } from 'node:crypto';
import { requireUser, requireDeacon } from './util.js';

// No 0/O/1/I — avoids characters that are easy to mis-key or mis-read.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // length 32 = 2^5, no mod bias
const CODE_LEN = 8;

function generateInviteCode() {
  const bytes = randomBytes(CODE_LEN);
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

export default async function adminRoutes(app) {
  const db = app.db;
  const deaconOnly = { preHandler: requireDeacon(db) };
  const memberOnly = { preHandler: requireUser(db) };

  app.get('/admin/pending', deaconOnly, async () => {
    const rows = db
      .prepare(`SELECT id, name, phone, created_at FROM users WHERE status = 'pending' ORDER BY created_at ASC`)
      .all();
    return { users: rows.map((u) => ({ id: u.id, name: u.name, phone: u.phone, createdAt: u.created_at })) };
  });

  app.post('/admin/users/:id/approve', deaconOnly, async (req, reply) => {
    const id = parseId(req.params.id);
    if (id === null) return reply.code(404).send({ error: 'User not found' });
    const result = db.prepare(`UPDATE users SET status = 'approved' WHERE id = ?`).run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'User not found' });
    return { ok: true };
  });

  app.post('/admin/users/:id/reject', deaconOnly, async (req, reply) => {
    const id = parseId(req.params.id);
    if (id === null) return reply.code(404).send({ error: 'User not found' });
    const result = db.prepare(`UPDATE users SET status = 'rejected' WHERE id = ?`).run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'User not found' });
    return { ok: true };
  });

  app.post('/admin/users/:id/make-deacon', deaconOnly, async (req, reply) => {
    const id = parseId(req.params.id);
    if (id === null) return reply.code(404).send({ error: 'User not found' });
    const result = db.prepare(`UPDATE users SET is_deacon = 1 WHERE id = ?`).run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'User not found' });
    return { ok: true };
  });

  app.get('/admin/members', deaconOnly, async () => {
    const rows = db
      .prepare(`SELECT id, name, phone, is_deacon, status, created_at FROM users ORDER BY created_at ASC`)
      .all();
    return {
      users: rows.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        isDeacon: !!u.is_deacon,
        status: u.status,
        createdAt: u.created_at,
      })),
    };
  });

  app.post('/admin/invites', deaconOnly, async (req, reply) => {
    const { maxUses, expiresAt } = req.body ?? {};
    let max = 10;
    if (maxUses != null) {
      max = Number(maxUses);
      if (!Number.isInteger(max) || max < 1) return reply.code(400).send({ error: 'maxUses must be a positive integer' });
    }
    let expires = null;
    if (expiresAt != null) {
      if (typeof expiresAt !== 'string' || expiresAt.trim() === '') {
        return reply.code(400).send({ error: 'expiresAt must be a date string' });
      }
      expires = expiresAt;
    }

    let code = generateInviteCode();
    while (db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(code)) {
      code = generateInviteCode();
    }
    db.prepare(`INSERT INTO invite_codes (code, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?)`).run(
      code,
      req.user.id,
      max,
      expires
    );
    return { code };
  });

  app.get('/admin/invites', deaconOnly, async () => {
    const rows = db
      .prepare(
        `SELECT i.code, i.max_uses, i.uses, i.revoked, i.expires_at, i.created_at, u.name AS created_by_name
           FROM invite_codes i JOIN users u ON u.id = i.created_by
          ORDER BY i.created_at DESC`
      )
      .all();
    return {
      invites: rows.map((r) => ({
        code: r.code,
        maxUses: r.max_uses,
        uses: r.uses,
        revoked: !!r.revoked,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        createdByName: r.created_by_name,
      })),
    };
  });

  app.post('/admin/invites/:code/revoke', deaconOnly, async (req, reply) => {
    const result = db.prepare(`UPDATE invite_codes SET revoked = 1 WHERE code = ?`).run(req.params.code);
    if (result.changes === 0) return reply.code(404).send({ error: 'Invite code not found' });
    return { ok: true };
  });

  app.get('/admin/reports', deaconOnly, async () => {
    const rows = db
      .prepare(
        `SELECT r.id, r.description, r.status, r.created_at,
                reporter.name AS reporter_name, subject.name AS subject_name
           FROM safety_reports r
           JOIN users reporter ON reporter.id = r.reporter_id
           LEFT JOIN users subject ON subject.id = r.subject_user_id
          ORDER BY r.created_at DESC`
      )
      .all();
    return {
      reports: rows.map((r) => ({
        id: r.id,
        description: r.description,
        status: r.status,
        createdAt: r.created_at,
        reporterName: r.reporter_name,
        subjectName: r.subject_name ?? null,
      })),
    };
  });

  app.post('/admin/reports/:id/resolve', deaconOnly, async (req, reply) => {
    const id = parseId(req.params.id);
    if (id === null) return reply.code(404).send({ error: 'Report not found' });
    const result = db.prepare(`UPDATE safety_reports SET status = 'resolved' WHERE id = ?`).run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'Report not found' });
    return { ok: true };
  });

  app.post('/reports', memberOnly, async (req, reply) => {
    const { subjectUserId, description } = req.body ?? {};
    if (typeof description !== 'string' || description.trim().length === 0 || description.length > 2000) {
      return reply.code(400).send({ error: 'description is required (1-2000 chars)' });
    }
    let subjectId = null;
    if (subjectUserId != null) {
      subjectId = parseId(subjectUserId);
      if (subjectId === null) return reply.code(400).send({ error: 'invalid subjectUserId' });
      if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(subjectId)) {
        return reply.code(400).send({ error: 'subjectUserId not found' });
      }
    }
    db.prepare(`INSERT INTO safety_reports (reporter_id, subject_user_id, description) VALUES (?, ?, ?)`).run(
      req.user.id,
      subjectId,
      description.trim()
    );
    return { ok: true };
  });
}
