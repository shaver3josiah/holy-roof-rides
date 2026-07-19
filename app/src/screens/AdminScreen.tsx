// CONTRACT (implemented by build agent): Deacon admin panel (tabs or sections):
// 1. Approvals: adminPending -> approve / reject buttons.
// 2. Safety reports: adminReports -> reporter, subject, description, resolve.
// 3. Members: adminMembers -> name, phone (tap to call via Linking), deacon
//    badge, make-deacon action.
// 4. Invites: adminInvites list + create (adminCreateInvite -> show code big,
//    Share button) + revoke.
// Non-deacons never reach this screen (Home hides the button), but guard
// anyway: if !session.user.isDeacon, render nothing.
import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { styles } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Admin'>;

export default function AdminScreen(_props: Props) {
  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={styles.body}>TODO: Deacon admin panel</Text>
    </View>
  );
}
