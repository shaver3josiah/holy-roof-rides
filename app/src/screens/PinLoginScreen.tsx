// CONTRACT (implemented by build agent): PIN login.
// - Prefill phone from route.params?.phone (editable).
// - Big friendly PIN pad or secure TextInput (numeric, 4-8 digits).
// - Submit -> api.login({phone, pin}) -> store.saveAuth -> setSession.
// - 429 -> "Too many tries, wait a bit." Link to Join ("Have an invite code?").
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import { saveAuth } from '../store';
import { Banner, Button } from '../components/ui';
import { colors, fonts, spacing, styles, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PinLogin'>;

export default function PinLoginScreen({ navigation, route }: Props) {
  const { setSession } = useSession();
  const [phone, setPhone] = useState(route.params?.phone ?? '');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!phone.trim() || !pin) {
      setError('Enter your phone number and PIN to continue.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await api.login({ phone: phone.trim(), pin });
      await saveAuth({ token, phone: phone.trim() });
      setSession({ token, user });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("You've tried a few too many times. Please wait a few minutes and try again.");
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing.l, flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.h1, { marginBottom: spacing.xs, textAlign: 'center' }]}>Welcome back 👋</Text>
        <Text style={[styles.body, { marginBottom: spacing.l, color: colors.muted, textAlign: 'center' }]}>
          Log in with your phone number and PIN.
        </Text>

        <View style={[styles.card, { marginBottom: spacing.l }]}>
          <View style={{ marginBottom: spacing.m }}>
            <Text style={fieldLabel}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
              placeholder="(555) 555-0100"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View>
            <Text style={fieldLabel}>PIN</Text>
            <TextInput
              style={[styles.input, pinInput]}
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, ''))}
              keyboardType="numeric"
              secureTextEntry
              maxLength={8}
              placeholder="••••"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        {error && (
          <Banner kind="error" style={{ marginBottom: spacing.m }}>
            {error}
          </Banner>
        )}

        <Button label="Log in" onPress={submit} loading={loading} disabled={loading} />

        <Pressable
          style={({ pressed }) => [
            { marginTop: spacing.l, alignItems: 'center', paddingVertical: spacing.s },
            { opacity: pressed ? 0.6 : 1, transform: [{ translateY: pressed ? 1 : 0 }] },
          ]}
          onPress={() => navigation.navigate('Join')}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.base, color: colors.primary }}>
            Have an invite code? Join
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fieldLabel = {
  fontFamily: fonts.sansSemiBold,
  fontSize: type.s,
  color: colors.muted,
  marginBottom: spacing.xs,
} as const;

const pinInput = {
  fontFamily: fonts.mono,
  fontSize: type.xl,
  letterSpacing: 10,
  textAlign: 'center',
  paddingVertical: 18,
} as const;
