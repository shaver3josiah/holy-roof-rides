// CONTRACT (implemented by build agent): OpenStreetMap map component.
// - react-native-maps MapView with provider={undefined} (native default) and a
//   UrlTile layer pointing at a configurable OSM raster tile URL.
// - MUST render "© OpenStreetMap contributors" attribution overlay (required
//   by the OSM tile usage policy).
// - Keep the props interface EXACTLY as below — RiderScreen and DriverScreen
//   both consume it.
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import type { LatLng } from '../types';
import { colors } from '../theme';

// OpenStreetMap's standard raster tile server. Its usage policy
// (https://operations.osmfoundation.org/policies/tiles/) requires visible
// attribution (below) and limits this to light, non-bulk traffic — fine for
// one congregation's app. A high-traffic deployment should switch to a paid
// tile provider or self-hosted tiles instead.
const OSM_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const DEFAULT_DELTA = 0.02;

export interface OsmMapProps {
  /** Recenter the map when this changes. */
  center?: LatLng;
  markers?: Array<{ id: string; coord: LatLng; label?: string; color?: string }>;
  /** Long-press to drop a pin (used for choosing a destination). */
  onLongPress?: (coord: LatLng) => void;
  /** Show the user's own location dot. */
  followsUser?: boolean;
  style?: ViewStyle;
}

export default function OsmMap({ center, markers, onLongPress, followsUser, style }: OsmMapProps) {
  const mapRef = useRef<MapView>(null);

  // Recenter on an already-mounted map when the caller hands us a new center
  // (e.g. a fresh location fix), rather than only honoring it on first mount.
  useEffect(() => {
    if (!center) return;
    mapRef.current?.animateToRegion(
      {
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      },
      300
    );
  }, [center?.lat, center?.lng]);

  const initialRegion = center
    ? {
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      }
    : undefined;

  return (
    <View style={[{ flex: 1 }, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={undefined}
        initialRegion={initialRegion}
        showsUserLocation={followsUser}
        followsUserLocation={followsUser}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onLongPress?.({ lat: latitude, lng: longitude });
        }}
      >
        <UrlTile urlTemplate={OSM_TILE_URL_TEMPLATE} maximumZ={19} />
        {markers?.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.coord.lat, longitude: m.coord.lng }}
            title={m.label}
            pinColor={m.color}
          />
        ))}
      </MapView>
      <View style={attributionStyles.box} pointerEvents="none">
        <Text style={attributionStyles.text}>© OpenStreetMap contributors</Text>
      </View>
    </View>
  );
}

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
    fontSize: 10,
    color: colors.text,
  },
});
