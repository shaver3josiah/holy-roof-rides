// CONTRACT (implemented by build agent): "Give a Ride" view.
// Rendered INSIDE HomeScreen (no navigation props; use useSession()).
// Three states, driven by api.getRides().mine:
//  1. BROWSE (no active ride) — FlatList of open requests (api.getRides().open),
//     sorted by distance-from-me when location is available. Each card shows
//     rider name, "{x.x} mi away", destination label (ride.destination.label ??
//     geo.reverseGeocode, cached per ride id), and note. Pull-to-refresh +
//     'rides_changed' WS refresh. Empty state: "No one needs a ride right now 🙌".
//     Accept -> api.acceptRide; a 409 ("already have an active ride") is shown
//     kindly and resyncs from the server rather than leaving a stale screen.
//  2. TO PICKUP (status 'accepted') — map fitTo [me, pickup] with a route
//     polyline (geo.getRoute, refreshed at most every 30s), pickup marker + my
//     live position. Card: "Picking up {riderName}" + distance/duration.
//     Buttons: Navigate (Linking.openURL to the platform maps app, falling
//     back to an OpenStreetMap link if that rejects), big "{riderName} is in
//     the car" -> api.pickupRide, Cancel (confirms it reopens the request),
//     "⚠️ Report a concern".
//  3. ON TRIP (status 'picked_up') — route polyline me -> destination. Card:
//     "Driving {riderName} to {destination label}". Navigate now targets the
//     destination. Big "Complete ride" -> api.completeRide. No cancel (the
//     server blocks it once picked up). Report stays available.
// Own location streams to the rider every ~5s over the live socket
// ({type:'location'}) via expo-location watchPositionAsync (foreground only)
// for the whole time a ride is accepted OR picked_up. Socket + location
// watcher are torn down on unmount or when the ride ends.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { HandHeart, MapPin, Navigation, TriangleAlert } from 'lucide-react-native';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import * as geo from '../geo';
import type { RouteInfo } from '../geo';
import OsmMap, { type OsmMapProps } from '../components/OsmMap';
import { Banner, Button, EmptyState } from '../components/ui';
import { colors, fonts, spacing, styles, type } from '../theme';
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

function coordFallbackLabel(coord: LatLng): string {
  return `${coord.lat.toFixed(3)}, ${coord.lng.toFixed(3)}`;
}

/** Destination label, cached per ride id so we only reverse-geocode once per ride. */
function useDestinationLabel(ride: Ride, cache: React.MutableRefObject<Map<number, string>>): string {
  const known = ride.destination.label ?? cache.current.get(ride.id) ?? null;
  const [label, setLabel] = useState<string | null>(known);

  useEffect(() => {
    if (ride.destination.label) {
      setLabel(ride.destination.label);
      return;
    }
    const cached = cache.current.get(ride.id);
    if (cached) {
      setLabel(cached);
      return;
    }
    let cancelled = false;
    geo.reverseGeocode(ride.destination).then((resolved) => {
      if (cancelled) return;
      const text = resolved ?? coordFallbackLabel(ride.destination);
      cache.current.set(ride.id, text);
      setLabel(text);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride.id, ride.destination.label]);

  return label ?? 'Looking up destination…';
}

function RideCard({
  ride,
  distance,
  cache,
  busy,
  onAccept,
}: {
  ride: Ride;
  distance: number | null;
  cache: React.MutableRefObject<Map<number, string>>;
  busy: boolean;
  onAccept: () => void;
}) {
  const destLabel = useDestinationLabel(ride, cache);
  return (
    <View style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
      <Text style={styles.h2}>{ride.riderName}</Text>
      {distance != null && <Text style={[local.metaText, { marginTop: 2 }]}>{distance.toFixed(1)} mi away</Text>}
      <View style={local.destRow}>
        <MapPin size={15} color={colors.primary} />
        <Text style={styles.body}>To {destLabel}</Text>
      </View>
      {ride.note ? <Text style={[local.quoteText, { marginTop: spacing.xs }]}>“{ride.note}”</Text> : null}
      <Button label="Accept this ride" onPress={onAccept} loading={busy} disabled={busy} style={{ marginTop: spacing.m }} />
    </View>
  );
}

function ActiveRide({
  ride,
  location,
  route,
  cache,
  busy,
  onNavigate,
  onPrimary,
  onCancel,
  onReport,
}: {
  ride: Ride;
  location: LatLng | null;
  route: RouteInfo | null;
  cache: React.MutableRefObject<Map<number, string>>;
  busy: boolean;
  onNavigate: () => void;
  onPrimary: () => void;
  onCancel: () => void;
  onReport: () => void;
}) {
  const destLabel = useDestinationLabel(ride, cache);
  const toPickup = ride.status === 'accepted';

  const markers = useMemo<NonNullable<OsmMapProps['markers']>>(() => {
    const list: NonNullable<OsmMapProps['markers']> = [];
    list.push(
      toPickup
        ? { id: 'pickup', coord: ride.pickup, label: `${ride.riderName}'s pickup`, color: colors.accent, kind: 'pin' }
        : { id: 'dest', coord: ride.destination, label: destLabel, color: colors.primary, kind: 'pin' }
    );
    if (location) list.push({ id: 'me', coord: location, label: 'You', color: colors.primary, kind: 'car' });
    return list;
  }, [toPickup, ride.pickup, ride.destination, ride.riderName, destLabel, location]);

  const fitTo = useMemo<LatLng[]>(() => {
    const target = toPickup ? ride.pickup : ride.destination;
    return location ? [location, target] : [target];
  }, [toPickup, ride.pickup, ride.destination, location]);

  return (
    <View style={{ flex: 1 }}>
      <OsmMap style={{ flex: 1 }} fitTo={fitTo} polyline={route?.coords} markers={markers} />
      <View style={[styles.card, { margin: spacing.m }]}>
        <Text style={styles.h2}>{toPickup ? `Picking up ${ride.riderName}` : `Driving ${ride.riderName} to ${destLabel}`}</Text>
        {route ? (
          <Text style={[local.metaText, { marginTop: 2 }]}>
            {geo.formatDistance(route.distanceMeters)} · {geo.formatDuration(route.durationSec)}
          </Text>
        ) : location ? (
          <Text style={[local.metaText, { marginTop: 2 }]}>Finding the route…</Text>
        ) : null}
        {toPickup && ride.note ? <Text style={[local.quoteText, { marginTop: spacing.s }]}>“{ride.note}”</Text> : null}

        <Button
          label="Navigate"
          icon={Navigation}
          variant="secondary"
          onPress={onNavigate}
          style={{ marginTop: spacing.m }}
        />

        <Button
          label={toPickup ? `${ride.riderName} is in the car` : 'Complete ride'}
          onPress={onPrimary}
          loading={busy}
          disabled={busy}
          style={{ marginTop: spacing.s }}
        />

        {toPickup && (
          <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} style={{ marginTop: spacing.m }} />
        )}

        <Pressable
          style={({ pressed }) => [local.reportRow, pressed && local.reportPressed]}
          onPress={onReport}
        >
          <TriangleAlert size={18} color={colors.danger} />
          <Text style={local.reportText}>Report a concern</Text>
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
      <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.l }}>
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
          {error && (
            <Banner kind="error" style={{ marginTop: spacing.s }}>
              {error}
            </Banner>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.s, marginTop: spacing.m }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
            <Button label="Send report" onPress={onSubmit} loading={busy} disabled={busy} style={{ flex: 1 }} />
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
  const [route, setRoute] = useState<RouteInfo | null>(null);
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
  const destCacheRef = useRef<Map<number, string>>(new Map());
  const routeTargetRef = useRef<'pickup' | 'destination' | null>(null);
  const lastRouteAtRef = useRef(0);

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
      } else if (msg.type === 'ride_picked_up') {
        // Recovery path: if our pickup POST response was lost mid-drive, the
        // server's WS echo still moves the UI forward.
        setMyRide((cur) => (cur && cur.id === msg.ride.id ? msg.ride : cur));
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

  // Stream location to the rider (and keep our own map fresh) while a ride is
  // accepted OR picked up.
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
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(next);
          // ponytail: timeInterval is Android-only in expo-location; this gate
          // keeps the ~5s send cadence on iOS too, where updates are distance-driven.
          const now = Date.now();
          if (now - lastSentRef.current < 4500) return;
          lastSentRef.current = now;
          const ws = socketRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'location', lat: next.lat, lng: next.lng }));
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

  // Route to whichever point matters right now (pickup, then destination once
  // picked up), refreshed at most every 30s — or immediately when the target
  // switches from pickup to destination.
  useEffect(() => {
    if (!myRide || !location) {
      setRoute(null);
      routeTargetRef.current = null;
      return;
    }
    const targetKey = myRide.status === 'picked_up' ? 'destination' : 'pickup';
    const target = targetKey === 'destination' ? myRide.destination : myRide.pickup;
    const targetChanged = routeTargetRef.current !== targetKey;
    if (!targetChanged && Date.now() - lastRouteAtRef.current < 30000) return;
    routeTargetRef.current = targetKey;
    lastRouteAtRef.current = Date.now();
    let cancelled = false;
    geo.getRoute(location, target).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [myRide?.id, myRide?.status, myRide?.pickup, myRide?.destination, location]);

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
        if (err instanceof ApiError && err.status === 409) {
          // Our list was stale (already have a ride, or someone beat us to it) — resync.
          refreshRides();
        }
      } finally {
        setBusyRideId(null);
      }
    },
    [token, refreshRides]
  );

  const pickup = useCallback(async () => {
    if (!myRide) return;
    setActionBusy(true);
    setError(null);
    try {
      const { ride: updated } = await api.pickupRide(token, myRide.id);
      setMyRide(updated);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setActionBusy(false);
    }
  }, [token, myRide]);

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

  const navigate = useCallback(async () => {
    if (!myRide) return;
    const target = myRide.status === 'picked_up' ? myRide.destination : myRide.pickup;
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${target.lat},${target.lng}`,
      android: `google.navigation:q=${target.lat},${target.lng}`,
      default: `geo:${target.lat},${target.lng}`,
    });
    try {
      await Linking.openURL(url);
    } catch {
      try {
        await Linking.openURL(`https://www.openstreetmap.org/?mlat=${target.lat}&mlon=${target.lng}`);
      } catch {
        Alert.alert('Could not open maps', "We couldn't find a maps app to open directions.");
      }
    }
  }, [myRide]);

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
      {error && (
        <Banner kind="error" style={{ marginHorizontal: spacing.m, marginTop: spacing.s }}>
          {error}
        </Banner>
      )}
      {myRide ? (
        <ActiveRide
          ride={myRide}
          location={location}
          route={route}
          cache={destCacheRef}
          busy={actionBusy}
          onNavigate={navigate}
          onPrimary={myRide.status === 'accepted' ? pickup : complete}
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
          ListEmptyComponent={
            <EmptyState icon={HandHeart} title="No one needs a ride right now 🙌" body="Pull down to check again." />
          }
          renderItem={({ item }) => (
            <RideCard
              ride={item}
              distance={location ? haversineMiles(location, item.pickup) : null}
              cache={destCacheRef}
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

const local = StyleSheet.create({
  metaText: {
    fontFamily: fonts.sansMedium,
    fontSize: type.sm,
    color: colors.muted,
  },
  quoteText: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    color: colors.muted,
    fontStyle: 'italic',
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.s,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.s,
    paddingVertical: spacing.s,
    minHeight: 44,
  },
  reportPressed: {
    opacity: 0.6,
    transform: [{ translateY: 1 }],
  },
  reportText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: type.sm,
    color: colors.danger,
  },
});
