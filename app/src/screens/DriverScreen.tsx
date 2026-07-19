// CONTRACT (implemented by build agent): "Give a Ride" view.
// Rendered INSIDE HomeScreen (no navigation props; use useSession()).
// - List open ride requests (api.getRides().open) with distance-from-me if
//   location is available; refresh on 'rides_changed' via api.openLive.
// - Accept -> api.acceptRide. While driving: stream own location every ~5s via
//   the live socket ({type:'location', lat, lng}) using expo-location
//   watchPositionAsync (foreground only). Show rider pickup pin on OsmMap.
// - Buttons: complete, cancel (returns ride to open), "Report a concern".
// - Stop watching + close socket on unmount or ride end.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import OsmMap from '../components/OsmMap';
import { colors, spacing, styles } from '../theme';
import type { LatLng, LiveMessage, Ride } from '../types';

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Check your connection and try again.';
}

function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function destinationLabel(ride: Ride): string {
  return ride.destination.label ?? `${ride.destination.lat.toFixed(3)}, ${ride.destination.lng.toFixed(3)}`;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View
      style={{
        backgroundColor: '#FBEAE5',
        borderRadius: 12,
        padding: spacing.m,
        marginHorizontal: spacing.m,
        marginTop: spacing.s,
      }}
    >
      <Text style={{ color: colors.danger, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ padding: spacing.l, alignItems: 'center' }}>
      <Text style={[styles.mutedText, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

function RideCard({
  ride,
  distance,
  busy,
  onAccept,
}: {
  ride: Ride;
  distance: number | null;
  busy: boolean;
  onAccept: () => void;
}) {
  return (
    <View style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
      <Text style={styles.h2}>{ride.riderName}</Text>
      {distance != null && <Text style={[styles.mutedText, { marginTop: 2 }]}>{distance.toFixed(1)} mi away</Text>}
      <Text style={[styles.body, { marginTop: spacing.s }]}>To {destinationLabel(ride)}</Text>
      {ride.note ? <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>“{ride.note}”</Text> : null}
      <Pressable
        style={[styles.button, { marginTop: spacing.m, opacity: busy ? 0.6 : 1 }]}
        onPress={onAccept}
        disabled={busy}
      >
        <Text style={styles.buttonText}>{busy ? 'Accepting…' : 'Accept this ride'}</Text>
      </Pressable>
    </View>
  );
}

function ActiveRide({
  ride,
  location,
  busy,
  onComplete,
  onCancel,
  onReport,
}: {
  ride: Ride;
  location: LatLng | null;
  busy: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onReport: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <OsmMap
        style={{ flex: 1 }}
        center={location ?? ride.pickup}
        followsUser
        markers={[{ id: 'pickup', coord: ride.pickup, label: `${ride.riderName}'s pickup`, color: colors.accent }]}
      />
      <View style={[styles.card, { margin: spacing.m }]}>
        <Text style={styles.h2}>Driving {ride.riderName}</Text>
        <Text style={[styles.mutedText, { marginTop: 2 }]}>To {destinationLabel(ride)}</Text>
        {ride.note ? <Text style={[styles.body, { marginTop: spacing.s }]}>“{ride.note}”</Text> : null}
        <View style={{ flexDirection: 'row', gap: spacing.s, marginTop: spacing.m }}>
          <Pressable
            style={[styles.button, { flex: 1, opacity: busy ? 0.6 : 1 }]}
            onPress={onComplete}
            disabled={busy}
          >
            <Text style={styles.buttonText}>Complete</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonSecondary, { flex: 1, opacity: busy ? 0.6 : 1 }]}
            onPress={onCancel}
            disabled={busy}
          >
            <Text style={styles.buttonSecondaryText}>Cancel</Text>
          </Pressable>
        </View>
        <Pressable style={{ marginTop: spacing.m, alignItems: 'center' }} onPress={onReport}>
          <Text style={{ color: colors.danger, fontWeight: '600' }}>⚠️ Report a concern</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReportModal({
  visible,
  text,
  busy,
  error,
  onChangeText,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  text: string;
  busy: boolean;
  error: string | null;
  onChangeText: (t: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.l }}>
        <View style={[styles.card, { padding: spacing.l }]}>
          <Text style={styles.h2}>Report a concern</Text>
          <Text style={[styles.mutedText, { marginTop: spacing.xs, marginBottom: spacing.m }]}>
            A deacon will follow up. Only share what’s needed.
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            multiline
            value={text}
            onChangeText={onChangeText}
            placeholder="What happened?"
            placeholderTextColor={colors.muted}
          />
          {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: spacing.s, marginTop: spacing.m }}>
            <Pressable style={[styles.buttonSecondary, { flex: 1 }]} onPress={onCancel} disabled={busy}>
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { flex: 1, opacity: busy ? 0.6 : 1 }]}
              onPress={onSubmit}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send report'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DriverScreen() {
  const { session } = useSession();
  const token = session?.token ?? '';
  const myUserId = session?.user.id ?? -1;

  const [openRides, setOpenRides] = useState<Ride[]>([]);
  const [myRide, setMyRide] = useState<Ride | null>(null);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyRideId, setBusyRideId] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const watchRef = useRef<{ remove: () => void } | null>(null);
  const lastSentRef = useRef(0);

  // One-shot location fix, just for sorting/showing distance in the list.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({});
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // ponytail: distance-from-me is a nice-to-have; silently skip if it fails
      }
    })();
  }, []);

  const refreshRides = useCallback(async () => {
    if (!token) return;
    try {
      const { open, mine } = await api.getRides(token);
      setOpenRides(open.filter((r) => r.riderId !== myUserId));
      setMyRide(mine && mine.driverId === myUserId ? mine : null);
      setError(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [token, myUserId]);

  // Load rides + open the live socket for the lifetime of this screen.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    refreshRides().finally(() => {
      if (alive) setLoading(false);
    });

    const ws = api.openLive(token);
    socketRef.current = ws;
    ws.onmessage = (ev) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(ev.data)) as LiveMessage;
      } catch {
        return;
      }
      if (msg.type === 'rides_changed') {
        refreshRides();
      } else if (msg.type === 'ride_ended') {
        setMyRide((cur) => {
          if (!cur || cur.id !== msg.rideId) return cur;
          Alert.alert('Ride ended', msg.reason === 'completed' ? 'This ride was marked complete.' : 'This ride has ended.');
          return null;
        });
      }
    };
    // ponytail: no auto-reconnect on drop — pull-to-refresh covers a stale list.

    return () => {
      alive = false;
      ws.close();
      socketRef.current = null;
    };
  }, [token, refreshRides]);

  // Stream location to the rider only while an accepted ride is active.
  useEffect(() => {
    if (!myRide) {
      watchRef.current?.remove();
      watchRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setError('Location permission is needed to share your position with the rider.');
        return;
      }
      lastSentRef.current = 0;
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (pos) => {
          // ponytail: timeInterval is Android-only in expo-location; this gate
          // keeps the ~5s cadence on iOS too, where updates are distance-driven.
          const now = Date.now();
          if (now - lastSentRef.current < 4500) return;
          lastSentRef.current = now;
          const ws = socketRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'location', lat: pos.coords.latitude, lng: pos.coords.longitude }));
          }
        }
      );
      if (cancelled) {
        sub.remove();
      } else {
        watchRef.current = sub;
      }
    })();
    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [myRide?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshRides();
    setRefreshing(false);
  }, [refreshRides]);

  const accept = useCallback(
    async (ride: Ride) => {
      setBusyRideId(ride.id);
      setError(null);
      try {
        const { ride: accepted } = await api.acceptRide(token, ride.id);
        setOpenRides((list) => list.filter((r) => r.id !== ride.id));
        setMyRide(accepted);
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setBusyRideId(null);
      }
    },
    [token]
  );

  const complete = useCallback(async () => {
    if (!myRide) return;
    setActionBusy(true);
    setError(null);
    try {
      await api.completeRide(token, myRide.id);
      setMyRide(null);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setActionBusy(false);
    }
  }, [token, myRide]);

  const cancel = useCallback(() => {
    if (!myRide) return;
    Alert.alert('Cancel this ride?', 'The request will go back to the open list for another driver.', [
      { text: 'Keep driving', style: 'cancel' },
      {
        text: 'Cancel ride',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
          setError(null);
          try {
            await api.cancelRide(token, myRide.id);
            setMyRide(null);
          } catch (err) {
            setError(friendlyError(err));
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  }, [token, myRide]);

  const submitReport = useCallback(async () => {
    if (!reportText.trim()) {
      setReportError('Say a little about what happened.');
      return;
    }
    setReportBusy(true);
    setReportError(null);
    try {
      await api.fileReport(token, {
        subjectUserId: myRide?.riderId,
        description: reportText.trim(),
      });
      setReportOpen(false);
      setReportText('');
      Alert.alert('Report sent', 'A deacon will follow up.');
    } catch (err) {
      setReportError(friendlyError(err));
    } finally {
      setReportBusy(false);
    }
  }, [token, myRide, reportText]);

  const closeReport = useCallback(() => {
    setReportOpen(false);
    setReportText('');
    setReportError(null);
  }, []);

  const sortedRides = useMemo(() => {
    if (!location) return openRides;
    return [...openRides].sort((a, b) => haversineMiles(location, a.pickup) - haversineMiles(location, b.pickup));
  }, [openRides, location]);

  if (!session) return null;

  return (
    <View style={styles.screen}>
      {error && <ErrorBanner message={error} />}
      {myRide ? (
        <ActiveRide
          ride={myRide}
          location={location}
          busy={actionBusy}
          onComplete={complete}
          onCancel={cancel}
          onReport={() => setReportOpen(true)}
        />
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: spacing.l }} color={colors.primary} />
      ) : (
        <FlatList
          data={sortedRides}
          keyExtractor={(r) => String(r.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingVertical: spacing.m, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState text="No ride requests right now. Pull down to check again." />}
          renderItem={({ item }) => (
            <RideCard
              ride={item}
              distance={location ? haversineMiles(location, item.pickup) : null}
              busy={busyRideId === item.id}
              onAccept={() => accept(item)}
            />
          )}
        />
      )}
      <ReportModal
        visible={reportOpen}
        text={reportText}
        busy={reportBusy}
        error={reportError}
        onChangeText={setReportText}
        onCancel={closeReport}
        onSubmit={submitReport}
      />
    </View>
  );
}
