// CONTRACT (implemented by build agent): Settings.
// - Switch: "Stay in Give a Ride mode" -> store.saveSettings({stayInGiveMode})
//   AND if turned on, useMode().setMode('give') immediately.
// - Server URL field (store.saveSettings({serverUrl}) + api.setBaseUrl).
// - Signed in as: name / phone / role. Sign out button -> useSession().signOut().
// - Small privacy blurb: what is (and is not) stored. Link to PRIVACY.md ideas.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShieldCheck } from 'lucide-react-native';
import type { RootStackParamList } from '../../App';
import { useMode, useSession } from '../../App';
import * as api from '../api';
import { loadSettings, saveSettings } from '../store';
import { Badge, Banner, Button } from '../components/ui';
import { colors, fonts, spacing, styles } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen(_props: Props) {
  const { session, signOut } = useSession();
  const { setMode } = useMode();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stayInGiveMode, setStayInGiveMode] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [savedServerUrl, setSavedServerUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlJustSaved, setUrlJustSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await loadSettings();
        setStayInGiveMode(s.stayInGiveMode);
        setServerUrl(s.serverUrl);
        setSavedServerUrl(s.serverUrl);
      } catch {
        setError('Could not load your settings. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onToggleStayInGiveMode = async (value: boolean) => {
    setStayInGiveMode(value);
    try {
      await saveSettings({ stayInGiveMode: value });
      if (value) setMode('give');
    } catch {
      setStayInGiveMode(!value);
      setError('Could not save that setting. Please try again.');
    }
  };

  const onSaveServerUrl = async () => {
    const trimmed = serverUrl.trim();
    if (!trimmed) {
      setError('Server address cannot be empty.');
      return;
    }
    setError(null);
    setSavingUrl(true);
    setUrlJustSaved(false);
    try {
      await saveSettings({ serverUrl: trimmed });
      api.setBaseUrl(trimmed);
      setServerUrl(trimmed);
      setSavedServerUrl(trimmed);
      setUrlJustSaved(true);
    } catch {
      setError('Could not save the server address. Please try again.');
    } finally {
      setSavingUrl(false);
    }
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const urlChanged = serverUrl.trim() !== savedServerUrl;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.l }}>
      {error && (
        <Banner kind="error" style={{ marginBottom: spacing.m }}>
          {error}
        </Banner>
      )}

      {session && (
        <View style={[styles.card, { marginBottom: spacing.m }]}>
          <Text style={[styles.mutedText, { marginBottom: spacing.xs }]}>Signed in as</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.h2, { flex: 1 }]}>{session.user.name}</Text>
            {session.user.isDeacon && <Badge label="DEACON" />}
          </View>
          <Text style={[styles.body, { color: colors.muted, marginTop: 2 }]}>{session.user.phone}</Text>
          <Button
            label="Sign out"
            onPress={onSignOut}
            loading={signingOut}
            disabled={signingOut}
            variant="secondary"
            style={{ marginTop: spacing.m }}
          />
        </View>
      )}

      <View style={[styles.card, { marginBottom: spacing.m }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: spacing.m }}>
            <Text style={styles.body}>Stay in "Give a Ride" mode</Text>
            <Text style={[styles.mutedText, { marginTop: 2 }]}>
              Reopen the app ready to drive, instead of ready to ride.
            </Text>
          </View>
          <Switch
            value={stayInGiveMode}
            onValueChange={onToggleStayInGiveMode}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.card, { marginBottom: spacing.m }]}>
        <Text style={[styles.body, { marginBottom: spacing.xs }]}>Server address</Text>
        <Text style={[styles.mutedText, { marginBottom: spacing.s }]}>
          Only change this if your church leader gave you a different address.
        </Text>
        <TextInput
          style={[styles.input, { fontFamily: fonts.mono, fontSize: 14 }]}
          value={serverUrl}
          onChangeText={(t) => {
            setServerUrl(t);
            setUrlJustSaved(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://..."
          placeholderTextColor={colors.muted}
        />
        <Button
          label={savingUrl ? 'Saving…' : 'Save server address'}
          onPress={onSaveServerUrl}
          disabled={savingUrl || !urlChanged}
          loading={savingUrl}
          style={{ marginTop: spacing.m }}
        />
        {urlJustSaved && (
          <Text style={[styles.mutedText, { color: colors.success, marginTop: spacing.s }]}>Saved.</Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s }}>
          <ShieldCheck size={20} color={colors.heading} style={{ marginRight: spacing.xs }} />
          <Text style={styles.h2}>Your privacy</Text>
        </View>
        <Text style={[styles.body, { marginBottom: spacing.s }]}>
          We store your name, phone number, invite and approval records, and any safety
          reports filed about a ride.
        </Text>
        <Text style={styles.body}>
          We never store your rides, locations, or ride history — that information is only
          used while a ride is active and is not kept afterward.
        </Text>
      </View>
    </ScrollView>
  );
}
