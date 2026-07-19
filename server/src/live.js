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

import { userForToken } from './util.js';
import { rides, addSocket, removeSocket, publish } from './state.js';

export default async function liveRoutes(app) {
  app.get('/live', { websocket: true }, (socket, req) => {
    const user = userForToken(app.db, req.query?.token ?? null);
    if (!user || user.status !== 'approved') {
      socket.close(4401);
      return;
    }
    const userId = user.id;

    addSocket(userId, socket);
    socket.send(JSON.stringify({ type: 'hello', userId }));

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // malformed JSON: ignore
      }
      if (!msg || typeof msg !== 'object') return;
      if (!Number.isFinite(msg.lat) || !Number.isFinite(msg.lng)) return;

      if (msg.type === 'location') {
        // sender is a driver on an accepted ride -> relay to that ride's rider
        for (const ride of rides.values()) {
          if (ride.status === 'accepted' && ride.driverId === userId) {
            publish(ride.riderId, { type: 'driver_location', rideId: ride.id, lat: msg.lat, lng: msg.lng });
          }
        }
      } else if (msg.type === 'rider_location') {
        // sender is the rider on an accepted ride -> relay to that ride's driver
        for (const ride of rides.values()) {
          if (ride.status === 'accepted' && ride.riderId === userId) {
            publish(ride.driverId, { type: 'rider_location', rideId: ride.id, lat: msg.lat, lng: msg.lng });
          }
        }
      }
      // anything else: dropped, never stored, never logged
    });

    socket.on('close', () => removeSocket(userId, socket));
  });
}
