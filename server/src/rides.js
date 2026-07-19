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
// POST /rides/:id/complete
//   - Only the ride's rider or driver. Deletes the ride from memory entirely.
//   - publish {type:'ride_ended', rideId, reason:'completed'} to both parties;
//     broadcast rides_changed.
//   -> {ok:true}
//
// POST /rides/:id/cancel
//   - Rider cancels: delete ride (notify driver if any).
//   - Driver cancels: ride returns to 'open' (driver fields cleared), notify rider.
//   - publish {type:'ride_ended'|'ride_reopened', ...}; broadcast rides_changed.
//   -> {ok:true}
//
// Use rides, newRideId, publish, broadcast from state.js; requireUser from util.js.

export default async function rideRoutes(app) {
  throw new Error('ride routes not implemented yet');
}
