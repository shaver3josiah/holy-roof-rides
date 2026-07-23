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
import { CarFront, HandHeart, ShieldCheck } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import { saveAuth } from '../store';
import { Banner, Button } from '../components/ui';
import LogoCoin from '../components/LogoCoin';
import { colors, fonts, spacing, styles, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

const PIN_RE = /^\d{4,8}$/;

const BENEFITS: Array<{ Icon: typeof HandHeart; text: string }> = [
  { Icon: HandHeart, text: 'Ask for a ride' },
  { Icon: CarFront, text: 'Give a ride' },
  { Icon: ShieldCheck, text: 'Approved by your deacons' },
];

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
  secureTextEntry?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'words' | 'characters';
  placeholder?: string;
  helper?: string;
  tracked?: boolean;
  last?: boolean;
}) {
  return (
    <View style={{ marginBottom: props.last ? 0 : spacing.m }}>
      <Text style={fieldLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.tracked && trackedInput]}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? 'default'}
        secureTextEntry={props.secureTextEntry}
        maxLength={props.maxLength}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
      />
      {props.helper && <Text style={[styles.helperText, { marginTop: spacing.xs }]}>{props.helper}</Text>}
    </View>
  );
}

function SectionCard(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.l }}>
      <Text style={[styles.h2, { marginBottom: spacing.s }]}>{props.title}</Text>
      <View style={styles.card}>{props.children}</View>
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
        contentContainerStyle={{ padding: spacing.l, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: spacing.l }}>
          <LogoCoin size={96} />
          <Text style={[styles.h1, { marginTop: spacing.s, textAlign: 'center' }]}>Welcome 👋</Text>
          <Text style={[styles.body, { color: colors.muted, textAlign: 'center', marginTop: spacing.xs }]}>
            Rides to church, from people you already trust.
          </Text>
        </View>

        <View style={[styles.card, { marginBottom: spacing.l }]}>
          {BENEFITS.map((b, i) => (
            <View
              key={b.text}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: i === BENEFITS.length - 1 ? 0 : spacing.s,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: colors.noticeSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: spacing.s,
                }}
              >
                <b.Icon size={19} color={colors.accentPressed} />
              </View>
              <Text style={styles.body}>{b.text}</Text>
            </View>
          ))}
        </View>

        <SectionCard title="Your invite">
          <Field
            label="Invite code"
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="ABC123"
            autoCapitalize="characters"
            helper="Ask a deacon for this if you don't have one yet."
            tracked
            last
          />
        </SectionCard>

        <SectionCard title="About you">
          <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Jane Smith" />
          <Field
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="(555) 555-0100"
            helper="We'll only use this to text you about rides."
          />
          <Field
            label="Choose a PIN (4-8 digits)"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, ''))}
            keyboardType="numeric"
            secureTextEntry
            maxLength={8}
            placeholder="••••"
            helper="You'll use this to sign in — like a debit card PIN."
            tracked
          />
          <Field
            label="Confirm PIN"
            value={confirmPin}
            onChangeText={(t) => setConfirmPin(t.replace(/\D/g, ''))}
            keyboardType="numeric"
            secureTextEntry
            maxLength={8}
            placeholder="••••"
            tracked
            last
          />
        </SectionCard>

        {error && (
          <Banner kind="error" style={{ marginBottom: spacing.m }}>
            {error}
          </Banner>
        )}

        <Button label="Join" onPress={submit} loading={loading} disabled={loading} />

        <Pressable
          style={({ pressed }) => [
            { marginTop: spacing.l, alignItems: 'center', paddingVertical: spacing.s },
            { opacity: pressed ? 0.6 : 1, transform: [{ translateY: pressed ? 1 : 0 }] },
          ]}
          onPress={() => navigation.navigate('PinLogin')}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.base, color: colors.primary }}>
            Already a member? Log in
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

const trackedInput = {
  fontFamily: fonts.mono,
  letterSpacing: 3,
} as const;
