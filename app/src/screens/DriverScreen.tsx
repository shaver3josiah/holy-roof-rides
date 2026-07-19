// CONTRACT (implemented by build agent): "Give a Ride" view.
// Rendered INSIDE HomeScreen (no navigation props; use useSession()).
// - List open ride requests (api.getRides().open) with distance-from-me if
//   location is available; refresh on 'rides_changed' via api.openLive.
// - Accept -> api.acceptRide. While driving: stream own location every ~5s via
//   the live socket ({type:'location', lat, lng}) using expo-location
//   watchPositionAsync (foreground only). Show rider pickup pin on OsmMap.
// - Buttons: complete, cancel (returns ride to open), "Report a concern".
// - Stop watching + close socket on unmount or ride end.
import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../theme';

export default function DriverScreen() {
  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={styles.body}>TODO: Give a Ride view</Text>
    </View>
  );
}
