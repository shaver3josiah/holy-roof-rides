// CONTRACT (implemented by build agent — keep this exact behavior):
//
// GET /live?token=... — WebSocket endpoint (@fastify/websocket is registered).
//   - Authenticate via userForToken(app.db, token); close(4401) if invalid or
//     not approved.
//   - addSocket(userId, ws) on open; removeSocket on close.
//   - On connect, send {type:'hello', userId}.
//   - Incoming {type:'location', lat, lng}:
//       * Only meaningful if sender is the DRIVER of an 'accepted' ride in
//         state.rides — relay to that ride's rider as
//         {type:'driver_location', rideId, lat, lng}.
//       * NEVER stored, NEVER logged, dropped otherwise.
//   - Incoming {type:'rider_location', lat, lng}: same but rider -> driver,
//     relayed as {type:'rider_location', rideId, lat, lng}.
//   - Malformed JSON: ignore.
//
// Use state.js (rides, addSocket, removeSocket, publish) and util.userForToken.

export default async function liveRoutes(app) {
  throw new Error('live routes not implemented yet');
}
