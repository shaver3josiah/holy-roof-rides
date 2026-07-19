// ALL live ride and location state lives here, in process memory only.
// Nothing in this module is ever written to disk or logged. When a ride
// completes (or the server restarts) it is simply gone. That is the privacy
// model — do not "improve" this by persisting it.

/** rideId -> {
 *   id, riderId, riderName,
 *   pickup: {lat, lng}, destination: {lat, lng, label},
 *   note, status: 'open'|'accepted',
 *   driverId, driverName, createdAt
 * } */
export const rides = new Map();

/** userId -> Set<WebSocket> (a member may have several live connections) */
export const sockets = new Map();

let nextId = 1;
export function newRideId() {
  return nextId++;
}

/** Send a JSON message to every socket a user has open. */
export function publish(userId, msg) {
  const set = sockets.get(userId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(data);
  }
}

/** Send a JSON message to every connected member. */
export function broadcast(msg) {
  for (const userId of sockets.keys()) publish(userId, msg);
}

export function addSocket(userId, ws) {
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId).add(ws);
}

export function removeSocket(userId, ws) {
  const set = sockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) sockets.delete(userId);
}
