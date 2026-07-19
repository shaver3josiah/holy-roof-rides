// CONTRACT (implemented by build agent): "Receiving Rides" view (the default).
// Rendered INSIDE HomeScreen (no navigation props; use useSession()/useMode()).
// - expo-location foreground permission -> current position -> OsmMap centered
//   there, followsUser.
// - No active ride: long-press map to drop destination pin (optional label +
//   note) -> api.requestRide with pickup = current location.
// - Waiting: show "Asking the congregation..." card + cancel button.
// - Accepted: show driver name + live driver marker (api.openLive; handle
//   'driver_location', 'ride_ended', 'ride_reopened'). Buttons: complete, cancel,
//   "Report a concern" -> api.fileReport (small modal).
// - Poll/refresh rides on 'rides_changed'. Close the socket on unmount.
import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../theme';

export default function RiderScreen() {
  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={styles.body}>TODO: Receiving Rides view</Text>
    </View>
  );
}
