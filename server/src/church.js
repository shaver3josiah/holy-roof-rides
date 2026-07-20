// CONTRACT (implemented by build agent — keep these exact routes/shapes):
//
// The church's own public meeting place — the one location the app persists,
// because it is the congregation's public address, not anyone's personal data.
// Enables the rider's one-tap "Take me to Church" button.
//
// GET /church (preHandler requireUser(app.db))
//   -> {church: {name, address, lat, lng} | null}
//   Reads settings keys: church_name, church_address, church_lat, church_lng.
//   null if not configured yet.
//
// PUT /admin/church (preHandler requireDeacon(app.db))
//   {name, address, lat, lng}
//   - name and address: non-empty trimmed strings (<= 200 chars).
//   - lat/lng: finite numbers.
//   - Upsert all four settings keys (INSERT ... ON CONFLICT(key) DO UPDATE).
//   -> {ok: true}
//
// Use requireUser/requireDeacon from util.js.

import { requireUser, requireDeacon } from './util.js';

function getSetting(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

function upsertSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export default async function churchRoutes(app) {
  const db = app.db;

  app.get('/church', { preHandler: requireUser(db) }, async () => {
    const name = getSetting(db, 'church_name');
    const address = getSetting(db, 'church_address');
    const lat = getSetting(db, 'church_lat');
    const lng = getSetting(db, 'church_lng');
    if (name == null || address == null || lat == null || lng == null) {
      return { church: null };
    }
    return { church: { name, address, lat: Number(lat), lng: Number(lng) } };
  });

  app.put('/admin/church', { preHandler: requireDeacon(db) }, async (req, reply) => {
    const { name, address, lat, lng } = req.body ?? {};
    const cleanName = String(name ?? '').trim();
    const cleanAddress = String(address ?? '').trim();
    if (!cleanName || cleanName.length > 200) {
      return reply.code(400).send({ error: 'name is required (1-200 chars)' });
    }
    if (!cleanAddress || cleanAddress.length > 200) {
      return reply.code(400).send({ error: 'address is required (1-200 chars)' });
    }
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
      return reply.code(400).send({ error: 'lat/lng must be finite numbers' });
    }

    upsertSetting(db, 'church_name', cleanName);
    upsertSetting(db, 'church_address', cleanAddress);
    upsertSetting(db, 'church_lat', String(numLat));
    upsertSetting(db, 'church_lng', String(numLng));

    return { ok: true };
  });
}
