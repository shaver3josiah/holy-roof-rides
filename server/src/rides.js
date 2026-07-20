// CONTRACT (implemented by build agent — keep these exact routes/shapes):
// All routes preHandler: requireUser(app.db). Rides live ONLY in state.js maps.
//
// GET /rides
//   -> {open: Ride[], mine: Ride|null}
//   open = all status 'open' rides (for drivers to browse).
//   mine = the caller's active ride (as rider or driver), else null.
//
// POST /rides {pickup:{lat,lng}, destination:{lat,lng,label?}, note?}
//   - Validate lat/lng are finite numbers.
//   - 409 if caller already has an active ride (as rider).
//   - Create ride via newRideId(), status 'open', riderName from req.user.
//   - broadcast({type:'rides_changed'}).
//   -> 200 {ride}
//
// POST /rides/:id/accept
//   - 404 unknown ride; 409 if not 'open' or caller is the rider.
//   - Sets status 'accepted', driverId/driverName.
//   - publish to rider {type:'ride_accepted', ride}; broadcast rides_changed.
//   -> {ride}
//
// POST /rides/:id/pickup
//   - 404 unknown ride; 403 if caller is neither rider nor driver;
//     409 if status !== 'accepted'.
//   - Sets status 'picked_up'.
//   - publish {type:'ride_picked_up', ride} to BOTH rider and driver.
//   -> {ride}
//
// POST /rides/:id/complete
//   - Only the ride's rider or driver. Works from 'accepted' or 'picked_up'.
//     Deletes the ride from memory entirely.
//   - publish {type:'ride_ended', rideId, reason:'completed'} to both parties;
//     broadcast rides_changed.
//   -> {ok:true}
//
// POST /rides/:id/cancel
//   - Rider cancels: delete ride (notify driver if any), any status.
//   - Driver cancels: only when status === 'accepted' — ride returns to 'open'
//     (driver fields cleared), notify rider. If status === 'picked_up', 409
//     {error:'Ride is in progress — complete it instead'} (ride is untouched).
//   - publish {type:'ride_ended'|'ride_reopened', ...}; broadcast rides_changed.
//   -> {ok:true}
//
// Ride lifecycle: open -> accepted -> picked_up -> gone (completed/cancelled).
// Use rides, newRideId, publish, broadcast from state.js; requireUser from util.js.

import { rides, newRideId, publish, broadcast } from './state.js';
import { requireUser } from './util.js';

function isFiniteNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isValidPoint(p) {
  return !!p && isFiniteNum(p.lat) && isFiniteNum(p.lng);
}

function activeRideFor(userId) {
  for (const ride of rides.values()) {
    if (ride.riderId === userId || ride.driverId === userId) return ride;
  }
  return null;
}

export default async function rideRoutes(app) {
  app.addHook('preHandler', requireUser(app.db));

  app.get('/rides', async (req) => {
    const open = [...rides.values()].filter((r) => r.status === 'open');
    return { open, mine: activeRideFor(req.user.id) };
  });

  app.post('/rides', async (req, reply) => {
    const { pickup, destination, note } = req.body ?? {};
    if (!isValidPoint(pickup)) return reply.code(400).send({ error: 'Invalid pickup' });
    if (!isValidPoint(destination)) return reply.code(400).send({ error: 'Invalid destination' });

    if (activeRideFor(req.user.id)) {
      return reply.code(409).send({ error: 'You already have an active ride' });
    }

    const id = newRideId();
    const ride = {
      id,
      riderId: req.user.id,
      riderName: req.user.name,
      pickup: { lat: pickup.lat, lng: pickup.lng },
      destination: { lat: destination.lat, lng: destination.lng, label: destination.label ?? null },
      note: note ?? null,
      status: 'open',
      driverId: null,
      driverName: null,
      createdAt: new Date().toISOString(),
    };
    rides.set(id, ride);
    broadcast({ type: 'rides_changed' });
    return { ride };
  });

  app.post('/rides/:id/accept', async (req, reply) => {
    const ride = rides.get(Number(req.params.id));
    if (!ride) return reply.code(404).send({ error: 'Ride not found' });
    if (ride.status !== 'open' || ride.riderId === req.user.id) {
      return reply.code(409).send({ error: 'Ride not available' });
    }
    // One active ride at a time applies to drivers too — otherwise one
    // driver's location would fan out to several riders (see live.js).
    if (activeRideFor(req.user.id)) {
      return reply.code(409).send({ error: 'You already have an active ride' });
    }

    ride.status = 'accepted';
    ride.driverId = req.user.id;
    ride.driverName = req.user.name;
    publish(ride.riderId, { type: 'ride_accepted', ride });
    broadcast({ type: 'rides_changed' });
    return { ride };
  });

  app.post('/rides/:id/pickup', async (req, reply) => {
    const ride = rides.get(Number(req.params.id));
    if (!ride) return reply.code(404).send({ error: 'Ride not found' });
    if (ride.riderId !== req.user.id && ride.driverId !== req.user.id) {
      return reply.code(403).send({ error: 'Not your ride' });
    }
    if (ride.status !== 'accepted') return reply.code(409).send({ error: 'Ride is not ready for pickup' });

    ride.status = 'picked_up';
    publish(ride.riderId, { type: 'ride_picked_up', ride });
    publish(ride.driverId, { type: 'ride_picked_up', ride });
    return { ride };
  });

  app.post('/rides/:id/complete', async (req, reply) => {
    const id = Number(req.params.id);
    const ride = rides.get(id);
    if (!ride) return reply.code(404).send({ error: 'Ride not found' });
    if (ride.riderId !== req.user.id && ride.driverId !== req.user.id) {
      return reply.code(403).send({ error: 'Not your ride' });
    }

    rides.delete(id);
    publish(ride.riderId, { type: 'ride_ended', rideId: id, reason: 'completed' });
    if (ride.driverId) publish(ride.driverId, { type: 'ride_ended', rideId: id, reason: 'completed' });
    broadcast({ type: 'rides_changed' });
    return { ok: true };
  });

  app.post('/rides/:id/cancel', async (req, reply) => {
    const id = Number(req.params.id);
    const ride = rides.get(id);
    if (!ride) return reply.code(404).send({ error: 'Ride not found' });
    if (ride.riderId !== req.user.id && ride.driverId !== req.user.id) {
      return reply.code(403).send({ error: 'Not your ride' });
    }

    if (ride.riderId === req.user.id) {
      rides.delete(id);
      if (ride.driverId) publish(ride.driverId, { type: 'ride_ended', rideId: id, reason: 'cancelled' });
      broadcast({ type: 'rides_changed' });
      return { ok: true };
    }

    // Driver cancels: only while still 'accepted' — once picked up, the rider
    // is in the vehicle and reopening/dropping the ride isn't safe.
    if (ride.status === 'picked_up') {
      return reply.code(409).send({ error: 'Ride is in progress — complete it instead' });
    }

    // Reopen the ride for another driver instead of losing it.
    ride.status = 'open';
    ride.driverId = null;
    ride.driverName = null;
    publish(ride.riderId, { type: 'ride_reopened', ride });
    broadcast({ type: 'rides_changed' });
    return { ok: true };
  });
}
