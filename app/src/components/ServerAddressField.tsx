// Pre-auth server address control. Join/PinLogin mount this so a member can
// point the app at their church's server BEFORE logging in (Settings is only
// reachable after auth — without this, a fresh install on a real phone could
// never connect).
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as api from '../api';
import { loadSettings, saveSettings } from '../store';
import { colors, fonts, spacing, styles } from '../theme';

export default function ServerAddressField() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => setUrl(s.serverUrl));
  }, []);

  const save = async () => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) return;
    await saveSettings({ serverUrl: trimmed });
    api.setBaseUrl(trimmed);
    setUrl(trimmed);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 1200);
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Change church server address"
        style={{ paddingVertical: spacing.m, alignItems: 'center' }}
      >
        <Text style={styles.helperText}>
          Church server: <Text style={{ fontFamily: fonts.mono, fontSize: 12 }}>{url || 'not set'}</Text>
          {'  '}
          <Text style={{ color: colors.primary, fontFamily: fonts.sansSemiBold }}>Change</Text>
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ marginTop: spacing.m }}>
      <Text style={[styles.mutedText, { marginBottom: spacing.xs }]}>Church server address</Text>
      <TextInput
        style={[styles.input, { fontFamily: fonts.mono, fontSize: 14 }]}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://10.0.0.230:8787"
        placeholderTextColor={colors.muted}
      />
      <Pressable style={[styles.button, { marginTop: spacing.s, paddingVertical: 12 }]} onPress={save}>
        <Text style={styles.buttonText}>{saved ? 'Saved' : 'Save address'}</Text>
      </Pressable>
    </View>
  );
}
