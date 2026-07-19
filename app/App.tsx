import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as api from './src/api';
import { clearAuth, loadAuth, loadSettings } from './src/store';
import { colors, spacing, styles } from './src/theme';
import type { Mode, User } from './src/types';
import JoinScreen from './src/screens/JoinScreen';
import PinLoginScreen from './src/screens/PinLoginScreen';
import RiderScreen from './src/screens/RiderScreen';
import DriverScreen from './src/screens/DriverScreen';
import AdminScreen from './src/screens/AdminScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// --- Session context ---
export interface Session {
  token: string;
  user: User;
}

interface SessionCtx {
  session: Session | null;
  setSession: (s: Session | null) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside provider');
  return ctx;
}

// --- Mode context ("Receiving Rides" vs "Give a Ride") ---
interface ModeCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeContext = createContext<ModeCtx | null>(null);

export function useMode(): ModeCtx {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode outside provider');
  return ctx;
}

// --- Navigation ---
export type RootStackParamList = {
  Join: undefined;
  PinLogin: { phone?: string } | undefined;
  Home: undefined;
  Admin: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.border,
        borderRadius: 999,
        padding: 3,
        marginHorizontal: spacing.m,
        marginBottom: spacing.s,
      }}
    >
      {(
        [
          { key: 'receive', label: 'Receiving Rides' },
          { key: 'give', label: 'Give a Ride' },
        ] as const
      ).map((opt) => (
        <Pressable
          key={opt.key}
          onPress={() => setMode(opt.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === opt.key }}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: 'center',
            backgroundColor: mode === opt.key ? colors.primary : 'transparent',
          }}
        >
          <Text
            style={{
              fontWeight: '600',
              color: mode === opt.key ? '#fff' : colors.muted,
            }}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const { session } = useSession();
  const { mode } = useMode();
  if (!session) return null;

  if (session.user.status !== 'approved') {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: 'center', padding: spacing.l }]}>
        <Text style={[styles.h1, { textAlign: 'center' }]}>Almost there</Text>
        <Text style={[styles.body, { textAlign: 'center', marginTop: spacing.m }]}>
          Your membership is waiting for a deacon's approval. Check back soon.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.m,
          paddingVertical: spacing.s,
        }}
      >
        <Text style={[styles.h2, { flex: 1 }]}>Holy Roof Rides</Text>
        {session.user.isDeacon && (
          <Pressable onPress={() => navigation.navigate('Admin')} style={{ padding: spacing.s }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Admin</Text>
          </Pressable>
        )}
        <Pressable onPress={() => navigation.navigate('Settings')} style={{ padding: spacing.s }}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </Pressable>
      </View>
      <ModeToggle />
      {mode === 'give' ? <DriverScreen /> : <RiderScreen />}
    </SafeAreaView>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>('receive');
  const [savedPhone, setSavedPhone] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      api.setBaseUrl(settings.serverUrl);
      if (settings.stayInGiveMode) setMode('give');
      const auth = await loadAuth();
      setSavedPhone(auth.phone);
      if (auth.token) {
        try {
          const { user } = await api.me(auth.token);
          setSession({ token: auth.token, user });
        } catch {
          await clearAuth();
        }
      }
      setReady(true);
    })();
  }, []);

  const signOut = useCallback(async () => {
    if (session) {
      try {
        await api.logout(session.token);
      } catch {
        // best effort — clear locally regardless
      }
    }
    await clearAuth();
    setSession(null);
  }, [session]);

  const sessionValue = useMemo(() => ({ session, setSession, signOut }), [session, signOut]);
  const modeValue = useMemo(() => ({ mode, setMode }), [mode]);

  if (!ready) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SessionContext.Provider value={sessionValue}>
        <ModeContext.Provider value={modeValue}>
          <NavigationContainer>
            <StatusBar style="dark" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              {session ? (
                <>
                  <Stack.Screen name="Home" component={HomeScreen} />
                  <Stack.Screen
                    name="Admin"
                    component={AdminScreen}
                    options={{ headerShown: true, headerTitle: 'Deacon Admin' }}
                  />
                  <Stack.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{ headerShown: true, headerTitle: 'Settings' }}
                  />
                </>
              ) : (
                <>
                  {savedPhone ? (
                    <Stack.Screen
                      name="PinLogin"
                      component={PinLoginScreen}
                      initialParams={{ phone: savedPhone }}
                    />
                  ) : null}
                  <Stack.Screen name="Join" component={JoinScreen} />
                  {!savedPhone ? <Stack.Screen name="PinLogin" component={PinLoginScreen} /> : null}
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </ModeContext.Provider>
      </SessionContext.Provider>
    </SafeAreaProvider>
  );
}
