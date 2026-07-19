// Auth primitives — all stdlib (node:crypto). PINs are scrypt-hashed;
// session tokens are random and stored hashed.
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

export function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(String(pin), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function newToken() {
  return randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time string comparison (hashes both sides to fixed length first). */
export function constantTimeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** Look up the user for a bearer token (or ?token= for WebSockets). */
export function userForToken(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.phone, u.is_deacon, u.status
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
    )
    .get(hashToken(token));
  return row ?? null;
}

// Bearer header ONLY — the ?token= query form is reserved for the /live
// WebSocket (which authenticates itself in live.js). Keeping tokens out of
// URLs keeps them out of proxies, browser history, and access logs.
function tokenFromRequest(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** Fastify preHandler: require an approved, logged-in member. Sets req.user. */
export function requireUser(db) {
  return async (req, reply) => {
    const user = userForToken(db, tokenFromRequest(req));
    if (!user) return reply.code(401).send({ error: 'Not logged in' });
    if (user.status !== 'approved') return reply.code(403).send({ error: 'Membership not yet approved' });
    req.user = user;
  };
}

/** Fastify preHandler: require a deacon. Sets req.user. */
export function requireDeacon(db) {
  const base = requireUser(db);
  return async (req, reply) => {
    await base(req, reply);
    if (reply.sent) return;
    if (!req.user.is_deacon) return reply.code(403).send({ error: 'Deacons only' });
  };
}

/** Tiny fixed-window rate limiter keyed by (bucket, key). ponytail: in-memory,
 * resets on restart; move to sliding window if abuse ever shows up. */
const buckets = new Map();
export function rateLimit(bucket, key, max, windowMs) {
  const now = Date.now();
  const id = `${bucket}:${key}`;
  const entry = buckets.get(id);
  if (!entry || now - entry.start > windowMs) {
    buckets.set(id, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

/** Test helper: buckets are module-global, so tests must reset them. */
export function _clearRateLimits() {
  buckets.clear();
}
