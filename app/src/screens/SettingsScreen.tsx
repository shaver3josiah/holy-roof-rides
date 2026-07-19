// CONTRACT (implemented by build agent): Settings.
// - Switch: "Stay in Give a Ride mode" -> store.saveSettings({stayInGiveMode})
//   AND if turned on, useMode().setMode('give') immediately.
// - Server URL field (store.saveSettings({serverUrl}) + api.setBaseUrl).
// - Signed in as: name / phone / role. Sign out button -> useSession().signOut().
// - Small privacy blurb: what is (and is not) stored. Link to PRIVACY.md ideas.
import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { styles } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen(_props: Props) {
  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={styles.body}>TODO: Settings</Text>
    </View>
  );
}
