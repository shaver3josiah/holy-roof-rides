// CONTRACT (implemented by build agent): OpenStreetMap map component.
// - react-native-maps MapView with provider={undefined} (native default) and a
//   UrlTile layer pointing at a configurable OSM raster tile URL.
// - MUST render "© OpenStreetMap contributors" attribution overlay (required
//   by the OSM tile usage policy).
// - Keep the props interface EXACTLY as below — RiderScreen and DriverScreen
//   both consume it.
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import type { LatLng } from '../types';

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

export default function OsmMap(_props: OsmMapProps) {
  return <View style={_props.style} />;
}
