// CONTRACT (implemented by build agent): membership onboarding.
// - Fields: invite code, full name, phone, PIN (4-8 digits) + confirm PIN.
// - Submit -> api.join(...). On success: api.login(...) immediately, then
//   store.saveAuth({token, phone}), then useSession().setSession(...).
//   (Pending members land on the "waiting for approval" view in Home.)
// - Link to PinLogin ("Already a member? Log in").
// - Friendly errors from ApiError.message. Use theme styles.
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
import { colors, spacing, styles } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

const PIN_RE = /^\d{4,8}$/;

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
  secureTextEntry?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'words';
  placeholder?: string;
}) {
  return (
    <View style={{ marginBottom: spacing.m }}>
      <Text style={[styles.mutedText, { marginBottom: spacing.xs }]}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? 'default'}
        secureTextEntry={props.secureTextEntry}
        maxLength={props.maxLength}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

export default function JoinScreen({ navigation }: Props) {
  const { setSession } = useSession();
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!inviteCode.trim() || !name.trim() || !phone.trim()) {
      setError('Please fill in every field.');
      return;
    }
    if (!PIN_RE.test(pin)) {
      setError('PIN must be 4 to 8 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.join({ inviteCode: inviteCode.trim(), name: name.trim(), phone: phone.trim(), pin });
      const { token, user } = await api.login({ phone: phone.trim(), pin });
      await saveAuth({ token, phone: phone.trim() });
      setSession({ token, user });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
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
        <Text style={[styles.h1, { marginBottom: spacing.xs }]}>Welcome!</Text>
        <Text style={[styles.body, { marginBottom: spacing.l, color: colors.muted }]}>
          Enter your invite code from a deacon to join Holy Roof Rides.
        </Text>

        <Field label="Invite code" value={inviteCode} onChangeText={setInviteCode} placeholder="ABC123" />
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Jane Smith" />
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="(555) 555-0100"
        />
        <Field
          label="Choose a PIN (4-8 digits)"
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, ''))}
          keyboardType="numeric"
          secureTextEntry
          maxLength={8}
          placeholder="••••"
        />
        <Field
          label="Confirm PIN"
          value={confirmPin}
          onChangeText={(t) => setConfirmPin(t.replace(/\D/g, ''))}
          keyboardType="numeric"
          secureTextEntry
          maxLength={8}
          placeholder="••••"
        />

        {error && (
          <Text style={[styles.body, { color: colors.danger, marginBottom: spacing.m }]}>{error}</Text>
        )}

        <Pressable style={styles.button} onPress={submit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Joining…' : 'Join'}</Text>
        </Pressable>

        <Pressable
          style={{ marginTop: spacing.l, alignItems: 'center' }}
          onPress={() => navigation.navigate('PinLogin')}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Already a member? Log in</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
