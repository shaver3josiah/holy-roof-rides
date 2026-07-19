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

export default async function adminRoutes(app) {
  throw new Error('admin routes not implemented yet');
}
