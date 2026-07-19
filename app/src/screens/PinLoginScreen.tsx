// CONTRACT (implemented by build agent): PIN login.
// - Prefill phone from route.params?.phone (editable).
// - Big friendly PIN pad or secure TextInput (numeric, 4-8 digits).
// - Submit -> api.login({phone, pin}) -> store.saveAuth -> setSession.
// - 429 -> "Too many tries, wait a bit." Link to Join ("Have an invite code?").
import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { styles } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PinLogin'>;

export default function PinLoginScreen(_props: Props) {
  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={styles.body}>TODO: PIN login</Text>
    </View>
  );
}
