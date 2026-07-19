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

export default async function authRoutes(app) {
  throw new Error('auth routes not implemented yet');
}
