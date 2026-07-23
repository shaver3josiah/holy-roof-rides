// OpenStreetMap map component — MapLibre-backed.
// Replaced react-native-maps: on Android that library is the Google Maps SDK
// underneath and hard-crashes the app without a Google API key — the opposite
// of this project's open-source-maps foundation. MapLibre renders OSM raster
// tiles natively with no API key and no Google dependency.
// - MUST render "© OpenStreetMap contributors" attribution (required by the
//   OSM tile usage policy) — our overlay below.
// - Keep the props interface EXACTLY as below — RiderScreen and DriverScreen
//   both consume it.
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as LibreMap,
  Marker,
  UserLocation,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { CarFront, Church } from 'lucide-react-native';
import type { LatLng } from '../types';
import { colors, fonts } from '../theme';

// OpenStreetMap's standard raster tile server. Its usage policy
// (https://operations.osmfoundation.org/policies/tiles/) requires visible
// attribution (below) and limits this to light, non-bulk traffic — fine for
// one congregation's app. A high-traffic deployment should switch to a paid
// tile provider or self-hosted tiles instead.
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const DEFAULT_ZOOM = 14;
const FIT_PADDING = { top: 60, bottom: 60, left: 60, right: 60 };

export interface OsmMapProps {
  /** Recenter the map when this changes. */
  center?: LatLng;
  markers?: Array<{
    id: string;
    coord: LatLng;
    label?: string;
    color?: string;
    /** Marker rendering: default pin, a car (driver), or the church. */
    kind?: 'pin' | 'car' | 'church';
  }>;
  /** Route line to draw on the map (e.g. from geo.getRoute). */
  polyline?: LatLng[];
  /** When set, fit the camera to contain all these points (overrides center). */
  fitTo?: LatLng[];
  /** Long-press to drop a pin (used for choosing a destination). */
  onLongPress?: (coord: LatLng) => void;
  /** Show the user's own location dot. */
  followsUser?: boolean;
  style?: ViewStyle;
}

/** [west, south, east, north] for a set of points; null when degenerate. */
function boundsFor(points: LatLng[]): [number, number, number, number] | null {
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  if (east - west < 1e-6 && north - south < 1e-6) return null; // single point
  return [west, south, east, north];
}

export default function OsmMap({
  center,
  markers,
  polyline,
  fitTo,
  onLongPress,
  followsUser,
  style,
}: OsmMapProps) {
  const bounds = fitTo && fitTo.length > 0 ? boundsFor(fitTo) : null;
  const fallbackCenter = bounds === null && fitTo && fitTo.length > 0 ? fitTo[0] : center;

  return (
    <View style={[{ flex: 1, overflow: 'hidden' }, style]}>
      <LibreMap
        style={StyleSheet.absoluteFillObject}
        mapStyle={OSM_STYLE}
        attribution={false}
        logo={false}
        onLongPress={(e) => {
          const [lng, lat] = e.nativeEvent.lngLat;
          onLongPress?.({ lat, lng });
        }}
      >
        {bounds ? (
          <Camera
            bounds={bounds}
            padding={FIT_PADDING}
            duration={300}
            initialViewState={{ bounds, padding: FIT_PADDING }}
          />
        ) : fallbackCenter ? (
          <Camera
            center={[fallbackCenter.lng, fallbackCenter.lat]}
            zoom={DEFAULT_ZOOM}
            duration={300}
            initialViewState={{ center: [fallbackCenter.lng, fallbackCenter.lat], zoom: DEFAULT_ZOOM }}
          />
        ) : null}

        {/* Screens only set followsUser after the expo-location permission
            grant, which MapLibre's LocationManager inherits app-wide — keep
            that ordering or this can throw on Android. */}
        {followsUser && <UserLocation />}

        {polyline && polyline.length > 1 && (
          <GeoJSONSource
            id="route"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: polyline.map((c) => [c.lng, c.lat]) },
            }}
          >
            <Layer
              id="route-line"
              type="line"
              style={{ lineColor: colors.primary, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
            />
          </GeoJSONSource>
        )}

        {markers?.map((m) => (
          <Marker
            key={m.id}
            id={m.id}
            lngLat={[m.coord.lng, m.coord.lat]}
            // Chips sit centered on the point; teardrop pins point at it with
            // their tail, so they anchor at the bottom tip.
            anchor={m.kind === 'car' || m.kind === 'church' ? 'center' : 'bottom'}
            accessibilityLabel={m.label}
          >
            {m.kind === 'car' || m.kind === 'church' ? (
              <View style={chipStyles.chip}>
                {m.kind === 'car' ? (
                  <CarFront size={18} color={colors.accent} />
                ) : (
                  <Church size={18} color={colors.primary} />
                )}
              </View>
            ) : (
              <View style={chipStyles.pin}>
                <View style={[chipStyles.pinHead, m.color ? { backgroundColor: m.color } : null]} />
                <View style={chipStyles.pinTail} />
              </View>
            )}
          </Marker>
        ))}
      </LibreMap>
      <View style={attributionStyles.box} pointerEvents="none">
        <Text style={attributionStyles.text}>© OpenStreetMap contributors</Text>
      </View>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Simple teardrop pin (MapLibre has no built-in pin marker like Google's).
  pin: { alignItems: 'center' },
  pinHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.card,
  },
  pinTail: {
    width: 0,
    height: 0,
    marginTop: -3,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.danger,
  },
});

const attributionStyles = StyleSheet.create({
  box: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.text,
  },
});
