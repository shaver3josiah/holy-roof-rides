// CONTRACT (implemented by build agent — keep these exact routes/shapes):
//
// POST /join   {inviteCode, name, phone, pin}
//   - pin must be 4-8 digits; phone non-empty (store digits only); name non-empty.
//   - If users table is empty AND inviteCode === app.bootstrapCode:
//       create user with is_deacon=1, status='approved'.
//   - Else inviteCode must exist in invite_codes, not revoked, not expired
//     (expires_at null or > now), uses < max_uses; increment uses.
//   - 409 if phone already registered.
//   - Rate limit by ip: 10 / hour (util.rateLimit).
//   -> 200 {userId, status}
//
// POST /login  {phone, pin}
//   - Rate limit by phone: 5 / 15 min -> 429.
//   - verifyPin against users.pin_hash -> 401 on mismatch (same error whether
//     phone exists or not — don't leak membership).
//   - Creates session (30-day expiry, store hashToken(token)).
//   -> 200 {token, user: {id, name, phone, isDeacon, status}}
//   (Pending members CAN log in — they see a "waiting for approval" screen.)
//
// POST /logout (Bearer token) — delete the session row. -> {ok: true}
//
// GET /me (Bearer token) — any valid session, INCLUDING pending members.
//   -> {user: {id, name, phone, isDeacon, status}}  | 401
//
// Use: hashPin, verifyPin, newToken, hashToken, userForToken, rateLimit from util.js.

import { hashPin, verifyPin, newToken, hashToken, userForToken, rateLimit, constantTimeEqual } from './util.js';

// Same-cost scrypt compare on login misses so unregistered phones don't
// answer measurably faster than registered ones.
const DUMMY_PIN_HASH = hashPin('00000000');

function tokenFromReq(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function toUserView(row) {
  return { id: row.id, name: row.name, phone: row.phone, isDeacon: !!row.is_deacon, status: row.status };
}

export default async function authRoutes(app) {
  app.post('/join', async (req, reply) => {
    if (!rateLimit('join', req.ip, 10, 60 * 60 * 1000)) {
      return reply.code(429).send({ error: 'Too many join attempts, try again later' });
    }

    const { inviteCode, name, phone, pin } = req.body ?? {};
    const cleanName = String(name ?? '').trim();
    const cleanPhone = String(phone ?? '').replace(/\D/g, '');
    const cleanCode = String(inviteCode ?? '').trim();

    if (!cleanName) return reply.code(400).send({ error: 'Name is required' });
    if (!cleanPhone) return reply.code(400).send({ error: 'Phone is required' });
    if (!/^\d{4,8}$/.test(String(pin ?? ''))) {
      return reply.code(400).send({ error: 'PIN must be 4-8 digits' });
    }

    const userCount = app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const isBootstrap = userCount === 0 && constantTimeEqual(cleanCode, app.bootstrapCode);

    if (!isBootstrap) {
      const invite = app.db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(cleanCode);
      if (!invite || invite.revoked) {
        return reply.code(400).send({ error: 'Invalid invite code' });
      }
      const now = app.db.prepare("SELECT datetime('now') AS now").get().now;
      if (invite.expires_at && invite.expires_at <= now) {
        return reply.code(400).send({ error: 'Invite code expired' });
      }
      if (invite.uses >= invite.max_uses) {
        return reply.code(400).send({ error: 'Invite code already used up' });
      }
    }

    // ponytail: this 409 lets an invite-code holder confirm a phone is
    // registered. Accepted tradeoff — invite codes already gate to the
    // congregation, joins are rate limited, and re-registration attempts
    // need a clear error far more than we need enumeration resistance here.
    const existing = app.db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
    if (existing) return reply.code(409).send({ error: 'Phone already registered' });

    const pinHash = hashPin(pin);
    const status = isBootstrap ? 'approved' : 'pending';
    const isDeacon = isBootstrap ? 1 : 0;

    const result = app.db
      .prepare(
        `INSERT INTO users (name, phone, pin_hash, is_deacon, status, invite_code)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(cleanName, cleanPhone, pinHash, isDeacon, status, cleanCode);

    if (!isBootstrap) {
      app.db.prepare('UPDATE invite_codes SET uses = uses + 1 WHERE code = ?').run(cleanCode);
    }

    return { userId: Number(result.lastInsertRowid), status };
  });

  app.post('/login', async (req, reply) => {
    const { phone, pin } = req.body ?? {};
    const cleanPhone = String(phone ?? '').replace(/\D/g, '');

    if (!rateLimit('login', cleanPhone, 5, 15 * 60 * 1000)) {
      return reply.code(429).send({ error: 'Too many login attempts, try again later' });
    }

    const user = app.db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
    const pinOk = verifyPin(pin, user?.pin_hash ?? DUMMY_PIN_HASH);
    if (!user || !pinOk) {
      return reply.code(401).send({ error: 'Invalid phone or PIN' });
    }

    const token = newToken();
    app.db
      .prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES (?, ?, datetime('now', '+30 days'))`
      )
      .run(hashToken(token), user.id);

    return { token, user: toUserView(user) };
  });

  app.post('/logout', async (req) => {
    const token = tokenFromReq(req);
    if (token) {
      app.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    }
    return { ok: true };
  });

  app.get('/me', async (req, reply) => {
    const user = userForToken(app.db, tokenFromReq(req));
    if (!user) return reply.code(401).send({ error: 'Not logged in' });
    return { user: toUserView(user) };
  });
}
