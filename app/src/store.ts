import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { Place } from './types';

// ponytail: default points at the Android emulator's host loopback for dev;
// real deployments set their church's server URL in Settings.
export const DEFAULT_SERVER_URL = 'http://10.0.2.2:8787';

export interface Settings {
  /** "Stay in Give a Ride mode" — app reopens in driver mode. */
  stayInGiveMode: boolean;
  serverUrl: string;
}

const SETTINGS_KEY = 'hrr_settings';
const TOKEN_KEY = 'hrr_token';
const PHONE_KEY = 'hrr_phone';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return { stayInGiveMode: false, serverUrl: DEFAULT_SERVER_URL, ...saved };
  } catch {
    return { stayInGiveMode: false, serverUrl: DEFAULT_SERVER_URL };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// Recent destinations live ONLY on this device (AsyncStorage) — the server
// never sees or stores them. Cleared by uninstalling or via Settings.
const PLACES_KEY = 'hrr_recent_places';
const MAX_RECENT_PLACES = 5;

export async function loadRecentPlaces(): Promise<Place[]> {
  try {
    const raw = await AsyncStorage.getItem(PLACES_KEY);
    return raw ? (JSON.parse(raw) as Place[]) : [];
  } catch {
    return [];
  }
}

export async function addRecentPlace(place: Place): Promise<Place[]> {
  const current = await loadRecentPlaces();
  const next = [place, ...current.filter((p) => p.label !== place.label)].slice(0, MAX_RECENT_PLACES);
  await AsyncStorage.setItem(PLACES_KEY, JSON.stringify(next));
  return next;
}

export async function clearRecentPlaces(): Promise<void> {
  await AsyncStorage.removeItem(PLACES_KEY);
}

/** Token lives in the platform keychain; phone is kept so PIN login can prefill. */
export async function saveAuth(auth: { token: string; phone: string }): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, auth.token);
  await SecureStore.setItemAsync(PHONE_KEY, auth.phone);
}

export async function loadAuth(): Promise<{ token: string | null; phone: string | null }> {
  return {
    token: await SecureStore.getItemAsync(TOKEN_KEY),
    phone: await SecureStore.getItemAsync(PHONE_KEY),
  };
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  // Keep the phone so the next PIN login is prefilled.
}
