// CONTRACT (implemented by build agent): membership onboarding.
// - Fields: invite code, full name, phone, PIN (4-8 digits) + confirm PIN.
// - Submit -> api.join(...). On success: api.login(...) immediately, then
//   store.saveAuth({token, phone}), then useSession().setSession(...).
//   (Pending members land on the "waiting for approval" view in Home.)
// - Link to PinLogin ("Already a member? Log in").
// - Friendly errors from ApiError.message. Use theme styles.
import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { styles } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

export default function JoinScreen(_props: Props) {
  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={styles.body}>TODO: Join flow</Text>
    </View>
  );
}
