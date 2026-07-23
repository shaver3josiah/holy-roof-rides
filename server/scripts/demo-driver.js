// A bot that plays the driver so a human can practice the rider flow solo.
// Watches for open rides, accepts them, "drives" toward pickup then the
// destination while streaming location over the /live WebSocket, then
// completes the ride and goes back to watching. Reconnects on its own if
// the WS drops or the server is briefly unavailable.
//
// Env: HRR_SERVER (default http://127.0.0.1:8787),
//      HRR_DRIVER_PHONE (default 5550002222), HRR_DRIVER_PIN (default 2222).
//
// Usage: node scripts/demo-driver.js

const SERVER = process.env.HRR_SERVER ?? 'http://127.0.0.1:8787';
const PHONE = process.env.HRR_DRIVER_PHONE ?? '5550002222';
const PIN = process.env.HRR_DRIVER_PIN ?? '2222';

let token = null;
let driverFirstName = 'Driver';
let ws = null;
let busy = false; // true from "decided to accept" through ride completion/end
let activeRideId = null;
let rideEndedReason = null;

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}
function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function haversineMiles(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Starting point ~0.015deg from pickup (roughly a mile), so the drive to
// pickup is visibly "on the way" rather than instant.
function offsetPoint(p) {
  return { lat: p.lat + 0.015, lng: p.lng + 0.015 };
}

// --- HTTP -----------------------------------------------------------------

async function login() {
  const res = await fetch(`${SERVER}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, pin: PIN }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
}

async function loginWithRetry() {
  for (;;) {
    try {
      return await login();
    } catch {
      log(`Can't reach the server at ${SERVER} — retrying in 5s...`);
      await sleep(5000);
    }
  }
}

async function apiFetch(path, opts = {}) {
  const headers = { authorization: `Bearer ${token}`, ...(opts.headers ?? {}) };
  // Only set JSON content-type when there's actually a body — Fastify's
  // default parser 400s on an empty body sent with that header (accept,
  // pickup, and complete are bodyless POSTs).
  if (opts.body) headers['content-type'] = 'application/json';
  return fetch(`${SERVER}${path}`, { ...opts, headers });
}

// Re-login (blocks until the server answers) and reconnect the socket with
// the fresh token. Used for both WS 4401 closes and REST 401s.
async function reauth() {
  const data = await loginWithRetry();
  token = data.token;
  driverFirstName = data.user.name.split(' ')[0];
  if (ws) {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  }
  connect();
}

// --- WebSocket --------------------------------------------------------

function connect() {
  const socket = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/live?token=${token}`);
  ws = socket;

  socket.addEventListener('open', () => {
    log(`${driverFirstName} is online and watching for ride requests.`);
  });

  socket.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'rides_changed') {
      checkOpenRides();
    } else if (msg.type === 'ride_ended' && msg.rideId === activeRideId) {
      rideEndedReason = msg.reason ?? 'ended';
    }
  });

  socket.addEventListener('close', (ev) => {
    if (ws !== socket) return; // a newer socket already took over
    ws = null;
    if (ev.code === 4401) {
      log('Session expired — logging back in...');
      reauth();
    } else {
      log('Connection dropped — reconnecting in 3s...');
      setTimeout(connect, 3000);
    }
  });

  socket.addEventListener('error', () => {
    /* the close event that follows drives reconnect logic */
  });
}

function sendLocation(lat, lng) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'location', lat, lng }));
  }
}

// --- ride watching & driving --------------------------------------------

async function checkOpenRides() {
  if (busy) return;
  let res;
  try {
    res = await apiFetch('/rides');
  } catch {
    return; // network hiccup — next poll or rides_changed retries
  }
  if (res.status === 401) return reauth();
  if (!res.ok) return;
  const { open } = await res.json();
  if (busy || open.length === 0) return; // re-check: state may have changed while awaiting
  busy = true;
  handleRide(open[0]);
}

// Drives from `from` to `to` over `durationMs`, streaming location every 2s.
// Returns true if the ride ended underneath us (rider cancelled).
async function driveTo(from, to, durationMs, label) {
  const stepMs = 2000;
  const steps = Math.round(durationMs / stepMs);
  for (let i = 1; i <= steps; i++) {
    await sleep(stepMs);
    if (rideEndedReason) return true;
    const t = i / steps;
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    sendLocation(lat, lng);
    const milesLeft = haversineMiles({ lat, lng }, to);
    log(`${driverFirstName} is on the way to ${label} (${milesLeft.toFixed(1)} mi)`);
  }
  return false;
}

async function handleRide(ride) {
  const riderFirst = ride.riderName.split(' ')[0];
  log(`New ride request from ${riderFirst}. Waiting a moment before accepting...`);
  await sleep(4000);

  const acceptRes = await apiFetch(`/rides/${ride.id}/accept`, { method: 'POST' });
  if (acceptRes.status === 409) {
    log('That ride was already taken by another driver.');
    busy = false;
    return;
  }
  if (acceptRes.status === 401) {
    busy = false;
    return reauth();
  }
  if (!acceptRes.ok) {
    log(`Couldn't accept the ride (status ${acceptRes.status}).`);
    busy = false;
    return;
  }

  const { ride: accepted } = await acceptRes.json();
  activeRideId = accepted.id;
  rideEndedReason = null;
  log(`${driverFirstName} accepted ${riderFirst}'s ride.`);

  const cancelledEnRoute = await driveTo(offsetPoint(accepted.pickup), accepted.pickup, 24000, riderFirst);
  if (cancelledEnRoute) return endRide('cancelled');

  const pickupRes = await apiFetch(`/rides/${accepted.id}/pickup`, { method: 'POST' });
  if (pickupRes.status === 401) return endRide(null, true);
  if (!pickupRes.ok) {
    log(`Pickup call failed (status ${pickupRes.status}) — giving up on this ride.`);
    return endRide('error');
  }
  const destLabel = accepted.destination.label ?? 'the destination';
  log(`${driverFirstName} picked up ${riderFirst}. Heading to ${destLabel}.`);

  const cancelledMidRide = await driveTo(accepted.pickup, accepted.destination, 30000, destLabel);
  if (cancelledMidRide) return endRide('cancelled');

  const completeRes = await apiFetch(`/rides/${accepted.id}/complete`, { method: 'POST' });
  if (completeRes.status === 401) return endRide(null, true);
  if (completeRes.ok) log('Ride complete 🙌');
  else log(`Couldn't mark the ride complete (status ${completeRes.status}).`);
  endRide('completed');
}

function endRide(reason, needsReauth = false) {
  if (reason === 'cancelled') log('Rider cancelled the ride — back to watching for requests.');
  activeRideId = null;
  rideEndedReason = null;
  busy = false;
  if (needsReauth) return reauth();
}

// --- startup ------------------------------------------------------------

async function main() {
  log(`Starting demo driver bot (server: ${SERVER})`);
  const data = await loginWithRetry();
  token = data.token;
  driverFirstName = data.user.name.split(' ')[0];
  log(`Logged in as ${data.user.name}.`);
  connect();
  await checkOpenRides();
  setInterval(checkOpenRides, 5000);
}

process.on('SIGINT', () => {
  log('Shutting down.');
  process.exit(0);
});

main();
