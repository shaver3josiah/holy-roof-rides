// CONTRACT (implemented by build agent): open-source geocoding + routing.
//
// Uses two public OSM-ecosystem services, both endpoint-configurable so a
// church can point at self-hosted instances later:
//   - Nominatim (https://nominatim.openstreetmap.org) for place search and
//     reverse geocoding. Usage policy: max 1 request/second, and requests MUST
//     send an identifying User-Agent header ('HolyRoofRides/0.2
//     (github.com/shaver3josiah/holy-roof-rides)'). Debounce search input;
//     never fire per-keystroke.
//   - OSRM public demo (https://router.project-osrm.org) for driving routes.
//     Light per-ride use only (route preview, occasional ETA refresh).
//
// PRIVACY: these are third-party services — coordinates/queries sent to them
// are subject to their policies (documented in docs/PRIVACY.md). Nothing is
// ever sent to the church server from this module.
//
// Implement EXACTLY these exports (RiderScreen/DriverScreen/AdminScreen
// consume them):
//   searchPlaces(query, near?) — Nominatim /search (format=jsonv2, limit 6,
//     addressdetails=0, viewbox biased around `near` when provided, not
//     bounded). Returns display_name as label. [] on any error.
//   reverseGeocode(coord) — Nominatim /reverse -> short readable label
//     (road + house number + city when present, else display_name's first two
//     comma parts). null on error.
//   getRoute(from, to) — OSRM /route/v1/driving with overview=full,
//     geometries=geojson -> decoded coords + distance/duration. null on error.
//   formatDistance(meters) — '450 ft' under 0.1 mi, else '3.2 mi'.
//   formatDuration(seconds) — '4 min' / '1 hr 12 min'.
//   debounce(fn, ms) — trailing-edge debounce for search boxes.
import type { LatLng, Place } from './types';

export interface RouteInfo {
  coords: LatLng[];
  distanceMeters: number;
  durationSec: number;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OSRM_BASE = 'https://router.project-osrm.org';
const USER_AGENT = 'HolyRoofRides/0.2 (github.com/shaver3josiah/holy-roof-rides)';

// Half-width (degrees) of the search bias box drawn around `near`.
const VIEWBOX_DEGREES = 0.5;

export async function searchPlaces(_query: string, _near?: LatLng): Promise<Place[]> {
  const query = _query.trim();
  if (!query) return [];
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      limit: '6',
      addressdetails: '0',
    });
    if (_near) {
      const { lat, lng } = _near;
      // left,top,right,bottom — biases results toward `near` without
      // excluding matches outside the box (no `bounded` param).
      params.set(
        'viewbox',
        [lng - VIEWBOX_DEGREES, lat + VIEWBOX_DEGREES, lng + VIEWBOX_DEGREES, lat - VIEWBOX_DEGREES].join(',')
      );
    }
    const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    const places: Place[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const { display_name, lat, lon } = item as Record<string, unknown>;
      const latNum = Number(lat);
      const lonNum = Number(lon);
      if (typeof display_name !== 'string' || !Number.isFinite(latNum) || !Number.isFinite(lonNum)) continue;
      places.push({ label: display_name, lat: latNum, lng: lonNum });
    }
    return places;
  } catch {
    return [];
  }
}

export async function reverseGeocode(_coord: LatLng): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(_coord.lat),
      lon: String(_coord.lng),
      addressdetails: '1',
    });
    const res = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    const { display_name, address } = data as Record<string, unknown>;

    if (address && typeof address === 'object') {
      const a = address as Record<string, unknown>;
      const road = typeof a.road === 'string' ? a.road : undefined;
      const houseNumber = typeof a.house_number === 'string' ? a.house_number : undefined;
      // ponytail: Nominatim omits `city` for rural addresses; town/village
      // cover the same "which town is this" need for a spread-out congregation.
      const city =
        (typeof a.city === 'string' && a.city) ||
        (typeof a.town === 'string' && a.town) ||
        (typeof a.village === 'string' && a.village) ||
        undefined;
      if (road) {
        const streetPart = houseNumber ? `${houseNumber} ${road}` : road;
        return city ? `${streetPart}, ${city}` : streetPart;
      }
    }

    if (typeof display_name === 'string' && display_name) {
      const parts = display_name.split(',').map((p) => p.trim());
      return parts.slice(0, 2).join(', ');
    }
    return null;
  } catch {
    return null;
  }
}

export async function getRoute(_from: LatLng, _to: LatLng): Promise<RouteInfo | null> {
  try {
    const coordsPath = `${_from.lng},${_from.lat};${_to.lng},${_to.lat}`;
    const res = await fetch(
      `${OSRM_BASE}/route/v1/driving/${coordsPath}?overview=full&geometries=geojson`
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    const { routes } = data as Record<string, unknown>;
    if (!Array.isArray(routes) || routes.length === 0) return null;
    const route = routes[0] as Record<string, unknown>;

    const geometry = route.geometry as Record<string, unknown> | undefined;
    const rawCoords = geometry?.coordinates;
    if (!Array.isArray(rawCoords)) return null;
    const coords: LatLng[] = [];
    for (const pair of rawCoords) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const [lon, lat] = pair;
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      coords.push({ lat, lng: lon });
    }

    const distanceMeters = Number(route.distance);
    const durationSec = Number(route.duration);
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSec) || coords.length === 0) return null;

    return { coords, distanceMeters, durationSec };
  } catch {
    return null;
  }
}

const METERS_PER_MILE = 1609.34;
const METERS_PER_FOOT = 0.3048;

export function formatDistance(_meters: number): string {
  if (_meters < 0.1 * METERS_PER_MILE) {
    const feet = Math.round(_meters / METERS_PER_FOOT);
    return `${feet} ft`;
  }
  const miles = _meters / METERS_PER_MILE;
  return `${miles.toFixed(1)} mi`;
}

export function formatDuration(_seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(_seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
