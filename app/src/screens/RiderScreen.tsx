// CONTRACT (implemented by build agent): "Receiving Rides" flow — Uber/Lyft-
// grade rider experience in four stages, driven by ride state + local
// selection state (no navigation props; rendered inside HomeScreen via
// useSession()).
//   1. IDLE — no active/waiting ride, no destination chosen yet. Full map
//      (followsUser, centered on the location fix). Floating card: search
//      box debounced (geo.debounce, 400ms) through geo.searchPlaces (biased
//      near me), a "⛪ Take me to Church" quick button when api.getChurch
//      (token) returns one (fetched once on mount), recent-destination
//      chips from store.loadRecentPlaces(). Long-press the map drops a pin,
//      labeled via geo.reverseGeocode.
//   2. PREVIEW — a destination is chosen but not yet requested. Map fits
//      [me, destination] with a geo.getRoute polyline. Card shows the
//      destination label, "About {duration} · {distance}", an optional
//      note, and "Ask for a ride" / "Back". Requesting calls
//      api.requestRide (destination.label included) + store.addRecentPlace.
//   3. WAITING — mine.status === 'open'. Gentle pulsing "Asking the
//      congregation…" card, destination label, Cancel.
//   4. ACTIVE — mine.status is 'accepted' or 'picked_up'. Driver card
//      ("{driverName} is on the way" / "Riding with {driverName}"), a live
//      car marker from 'driver_location' messages, an ETA computed via
//      geo.getRoute(driverLoc, target) throttled to at most once per 20s
//      (keeping the last value between refreshes; haversine @25mph if the
//      route call fails). 'ride_picked_up' swaps the map to the destination
//      view (fitTo [driverLoc||pickup, destination], polyline to
//      destination, "Heading to {label}"); 'ride_reopened' drops back to
//      WAITING with a toast-like notice; 'ride_ended' clears the ride.
//      Buttons: accepted -> Cancel + "⚠️ Report a concern"; picked_up ->
//      "We've arrived" (completeRide) + report.
// Shared: expo-location foreground permission is requested exactly once,
// when this screen mounts (friendly denied state with a Settings deep
// link). The live socket opens once and closes on unmount; 'rides_changed'
// triggers a refetch.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import * as geo from '../geo';
import { addRecentPlace, loadRecentPlaces } from '../store';
import OsmMap, { type OsmMapProps } from '../components/OsmMap';
import { colors, radius, spacing, styles } from '../theme';
import type { Church, LatLng, LiveMessage, Place, Ride } from '../types';

type Stage = 'idle' | 'preview' | 'waiting' | 'active';

const FALLBACK_MPH = 25;
const FALLBACK_METERS_PER_SEC = (FALLBACK_MPH * 1609.344) / 3600;
const ETA_THROTTLE_MS = 20000;

function friendlyError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function destLabelFor(dest: Ride['destination']): string {
  return dest.label ?? `${dest.lat.toFixed(3)}, ${dest.lng.toFixed(3)}`;
}

// --- small presentational pieces ---

function LoadingCard({ text }: { text: string }) {
  return (
    <View style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.body, { marginLeft: spacing.s }]}>{text}</Text>
    </View>
  );
}

function IdleCard({
  query,
  onChangeQuery,
  searchLoading,
  searchError,
  searchResults,
  onSelectPlace,
  church,
  recentPlaces,
  error,
}: {
  query: string;
  onChangeQuery: (t: string) => void;
  searchLoading: boolean;
  searchError: string | null;
  searchResults: Place[] | null;
  onSelectPlace: (p: Place) => void;
  church: Church | null;
  recentPlaces: Place[];
  error: string | null;
}) {
  const showingSearch = query.trim().length > 0;
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Where do you need to go?</Text>
      <TextInput
        style={[styles.input, { marginTop: spacing.s }]}
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Search for a place"
        placeholderTextColor={colors.muted}
        returnKeyType="search"
      />
      {church && !showingSearch && (
        <Pressable
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: spacing.m,
            paddingVertical: 12,
            paddingHorizontal: spacing.m,
            backgroundColor: colors.bg,
            borderRadius: radius.s,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          onPress={() => onSelectPlace({ label: church.name, lat: church.lat, lng: church.lng })}
        >
          <Text style={{ fontSize: 18 }}>⛪</Text>
          <Text style={[styles.body, { marginLeft: spacing.s, fontWeight: '600' }]}>Take me to Church</Text>
        </Pressable>
      )}
      {showingSearch ? (
        <View style={{ marginTop: spacing.s }}>
          {searchLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.s }}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={[styles.mutedText, { marginLeft: spacing.s }]}>Searching…</Text>
            </View>
          ) : searchError ? (
            <Text style={{ color: colors.danger, paddingVertical: spacing.s }}>{searchError}</Text>
          ) : searchResults && searchResults.length === 0 ? (
            <Text style={[styles.mutedText, { paddingVertical: spacing.s }]}>
              No places found. Try a different search, or long-press the map.
            </Text>
          ) : (
            searchResults?.map((place, i) => (
              <Pressable
                key={`${place.label}-${i}`}
                style={{
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
                onPress={() => onSelectPlace(place)}
              >
                <Text style={styles.body}>{place.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : (
        <>
          {recentPlaces.length > 0 && (
            <View style={{ marginTop: spacing.m }}>
              <Text style={styles.mutedText}>Recent</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.xs }}>
                {recentPlaces.map((place, i) => (
                  <Pressable
                    key={`${place.label}-${i}`}
                    style={{
                      backgroundColor: colors.bg,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: spacing.m,
                      marginRight: spacing.s,
                    }}
                    onPress={() => onSelectPlace(place)}
                  >
                    <Text style={styles.body}>{place.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          <Text style={[styles.mutedText, { marginTop: spacing.m }]}>
            Or long-press anywhere on the map to drop a pin.
          </Text>
        </>
      )}
      {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
    </View>
  );
}

function PreviewCard({
  destination,
  route,
  routeLoading,
  note,
  onChangeNote,
  submitting,
  error,
  onBack,
  onSubmit,
}: {
  destination: Place;
  route: geo.RouteInfo | null;
  routeLoading: boolean;
  note: string;
  onChangeNote: (t: string) => void;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{destination.label}</Text>
      {routeLoading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
          <ActivityIndicator size="small" color={colors.muted} />
          <Text style={[styles.mutedText, { marginLeft: spacing.s }]}>Finding the best route…</Text>
        </View>
      ) : route ? (
        <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>
          About {geo.formatDuration(route.durationSec)} · {geo.formatDistance(route.distanceMeters)}
        </Text>
      ) : (
        <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>
          We couldn't preview the route, but you can still ask for a ride.
        </Text>
      )}
      <TextInput
        style={[styles.input, { marginTop: spacing.m }]}
        value={note}
        onChangeText={onChangeNote}
        placeholder="Note for your driver (optional)"
        placeholderTextColor={colors.muted}
      />
      {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
      <View style={{ flexDirection: 'row', marginTop: spacing.m, gap: spacing.s }}>
        <Pressable style={[styles.buttonSecondary, { flex: 1 }]} onPress={onBack} disabled={submitting}>
          <Text style={styles.buttonSecondaryText}>Back</Text>
        </Pressable>
        <Pressable style={[styles.button, { flex: 1 }]} onPress={onSubmit} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'Asking…' : 'Ask for a ride'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WaitingCard({
  label,
  pulseAnim,
  submitting,
  error,
  onCancel,
}: {
  label: string;
  pulseAnim: Animated.Value;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  return (
    <View style={styles.card}>
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', opacity: pulseAnim }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.h2, { marginLeft: spacing.s }]}>Asking the congregation…</Text>
      </Animated.View>
      <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>Headed to {label}.</Text>
      <Text style={[styles.mutedText, { marginTop: 2 }]}>We'll let you know as soon as someone can take you.</Text>
      {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
      <Pressable style={[styles.buttonSecondary, { marginTop: spacing.m }]} onPress={onCancel} disabled={submitting}>
        <Text style={styles.buttonSecondaryText}>{submitting ? 'Cancelling…' : 'Cancel request'}</Text>
      </Pressable>
    </View>
  );
}

function ActiveCard({
  ride,
  driverPos,
  etaRoute,
  submitting,
  error,
  onCancel,
  onComplete,
  onReport,
}: {
  ride: Ride;
  driverPos: LatLng | null;
  etaRoute: geo.RouteInfo | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onComplete: () => void;
  onReport: () => void;
}) {
  const pickedUp = ride.status === 'picked_up';
  const driverName = ride.driverName ?? 'Your driver';
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>🚗 {pickedUp ? `Riding with ${driverName}` : `${driverName} is on the way`}</Text>
      {pickedUp ? (
        <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>Heading to {destLabelFor(ride.destination)}.</Text>
      ) : !driverPos ? (
        <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>Waiting for their location…</Text>
      ) : !etaRoute ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
          <ActivityIndicator size="small" color={colors.muted} />
          <Text style={[styles.mutedText, { marginLeft: spacing.s }]}>Working out their arrival…</Text>
        </View>
      ) : (
        <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>
          About {geo.formatDuration(etaRoute.durationSec)} · {geo.formatDistance(etaRoute.distanceMeters)} until pickup
        </Text>
      )}
      {pickedUp && etaRoute && (
        <Text style={[styles.mutedText, { marginTop: 2 }]}>
          About {geo.formatDuration(etaRoute.durationSec)} · {geo.formatDistance(etaRoute.distanceMeters)} to go
        </Text>
      )}
      {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
      <View style={{ flexDirection: 'row', marginTop: spacing.m, gap: spacing.s }}>
        {pickedUp ? (
          <Pressable style={[styles.button, { flex: 1 }]} onPress={onComplete} disabled={submitting}>
            <Text style={styles.buttonText}>{submitting ? 'Please wait…' : "We've arrived"}</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.buttonSecondary, { flex: 1 }]} onPress={onCancel} disabled={submitting}>
            <Text style={styles.buttonSecondaryText}>{submitting ? 'Cancelling…' : 'Cancel'}</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        style={{ marginTop: spacing.m, alignItems: 'center', paddingVertical: spacing.xs }}
        onPress={onReport}
      >
        <Text style={{ color: colors.danger, fontWeight: '600' }}>⚠️ Report a concern</Text>
      </Pressable>
    </View>
  );
}

// --- main screen ---

export default function RiderScreen() {
  const { session } = useSession();
  if (!session) return null; // HomeScreen only mounts us once a session exists.
  const token = session.token;

  const [locStatus, setLocStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [locError, setLocError] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<LatLng | null>(null);

  const [ride, setRide] = useState<Ride | null>(null);
  const [loadingRides, setLoadingRides] = useState(true);
  const [driverPos, setDriverPos] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [destination, setDestination] = useState<Place | null>(null);
  const [destNote, setDestNote] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const [route, setRoute] = useState<geo.RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [etaRoute, setEtaRoute] = useState<geo.RouteInfo | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Place[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [church, setChurch] = useState<Church | null>(null);
  const [recentPlaces, setRecentPlaces] = useState<Place[]>([]);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const rideRef = useRef(ride);
  useEffect(() => {
    rideRef.current = ride;
  }, [ride]);

  const searchReqIdRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEtaFetchRef = useRef(0);
  const lastEtaTargetRef = useRef<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const stage: Stage =
    ride && ride.status === 'open'
      ? 'waiting'
      : ride && (ride.status === 'accepted' || ride.status === 'picked_up')
        ? 'active'
        : destination
          ? 'preview'
          : 'idle';

  // --- location permission + current fix ---
  const requestLocation = useCallback(async () => {
    setLocStatus('checking');
    setLocError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocStatus('denied');
      return;
    }
    setLocStatus('granted');
    try {
      const pos = await Location.getCurrentPositionAsync({});
      setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setLocError('Could not find your location. Please try again.');
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // --- ride state ---
  const refreshRides = useCallback(async () => {
    try {
      const { mine } = await api.getRides(token);
      setRide(mine);
      if (!mine || (mine.status !== 'accepted' && mine.status !== 'picked_up')) setDriverPos(null);
      setError(null);
    } catch (err) {
      setError(friendlyError(err, 'Could not reach the server. Pull to try again.'));
    } finally {
      setLoadingRides(false);
    }
  }, [token]);

  useEffect(() => {
    refreshRides();
  }, [refreshRides]);

  // --- church + recent destinations (fetched once) ---
  useEffect(() => {
    let cancelled = false;
    api
      .getChurch(token)
      .then(({ church: c }) => {
        if (!cancelled) setChurch(c);
      })
      .catch(() => {
        // ponytail: the quick button is a nice-to-have — just hide it on failure
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    loadRecentPlaces().then((places) => {
      if (!cancelled) setRecentPlaces(places);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- toast-like notice ---
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  // --- live socket ---
  useEffect(() => {
    const ws = api.openLive(token);
    ws.onmessage = (event) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case 'rides_changed':
          refreshRides();
          break;
        case 'ride_accepted':
        case 'ride_picked_up':
          if (rideRef.current && rideRef.current.id === msg.ride.id) {
            setRide(msg.ride);
          }
          break;
        case 'ride_reopened':
          if (rideRef.current && rideRef.current.id === msg.ride.id) {
            setRide(msg.ride);
            setDriverPos(null);
            showNotice("Your driver had to step away — we're asking the congregation again.");
          }
          break;
        case 'ride_ended':
          if (rideRef.current && rideRef.current.id === msg.rideId) {
            setRide(null);
            setDriverPos(null);
            showNotice(msg.reason === 'cancelled' ? 'Your ride was cancelled.' : 'Your ride has ended.');
          }
          break;
        case 'driver_location':
          if (rideRef.current && rideRef.current.id === msg.rideId) {
            setDriverPos({ lat: msg.lat, lng: msg.lng });
          }
          break;
        default:
          break;
      }
    };
    return () => ws.close();
  }, [token, refreshRides, showNotice]);

  // --- route preview: PREVIEW (me -> destination) and WAITING (pickup -> destination) ---
  useEffect(() => {
    if (stage !== 'preview' && stage !== 'waiting') return;
    const origin = stage === 'waiting' && ride ? ride.pickup : myPos;
    const dest = stage === 'waiting' && ride ? ride.destination : destination;
    if (!origin || !dest) return;
    let cancelled = false;
    setRouteLoading(true);
    geo.getRoute(origin, dest).then((r) => {
      if (cancelled) return;
      setRoute(r);
      setRouteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [stage, myPos, destination?.lat, destination?.lng, ride?.pickup.lat, ride?.pickup.lng, ride?.destination.lat, ride?.destination.lng]);

  // --- ETA (ACTIVE): reset when a ride starts/ends, refetch on pickup ---
  useEffect(() => {
    lastEtaFetchRef.current = 0;
    lastEtaTargetRef.current = null;
    setEtaRoute(null);
  }, [ride?.id]);

  useEffect(() => {
    if (stage !== 'active' || !ride || !driverPos) return;
    const target = ride.status === 'picked_up' ? ride.destination : ride.pickup;
    const targetKey = `${ride.status}:${target.lat},${target.lng}`;
    if (targetKey !== lastEtaTargetRef.current) {
      lastEtaTargetRef.current = targetKey;
      lastEtaFetchRef.current = 0; // sub-stage just changed — fetch right away
    }
    const now = Date.now();
    if (now - lastEtaFetchRef.current < ETA_THROTTLE_MS) return; // throttled — keep last value
    lastEtaFetchRef.current = now;
    let cancelled = false;
    (async () => {
      const r = await geo.getRoute(driverPos, target);
      if (cancelled) return;
      if (r) {
        setEtaRoute(r);
      } else {
        const meters = haversineMeters(driverPos, target);
        setEtaRoute({ coords: [driverPos, target], distanceMeters: meters, durationSec: meters / FALLBACK_METERS_PER_SEC });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, ride, driverPos]);

  // --- pulsing "waiting" animation ---
  useEffect(() => {
    if (stage !== 'waiting') return;
    pulseAnim.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulseAnim.setValue(1);
    };
  }, [stage, pulseAnim]);

  // --- search ---
  const doSearch = useCallback(
    async (query: string) => {
      const reqId = ++searchReqIdRef.current;
      setSearchLoading(true);
      setSearchError(null);
      try {
        const results = await geo.searchPlaces(query, myPos ?? undefined);
        if (reqId !== searchReqIdRef.current) return; // a newer search superseded this one
        setSearchResults(results);
      } catch {
        if (reqId !== searchReqIdRef.current) return;
        setSearchResults(null);
        setSearchError('Could not search right now. Please try again.');
      } finally {
        if (reqId === searchReqIdRef.current) setSearchLoading(false);
      }
    },
    [myPos]
  );

  const debouncedSearch = useMemo(() => geo.debounce(doSearch, 400), [doSearch]);

  const onChangeQuery = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (!text.trim()) {
        searchReqIdRef.current++; // invalidate any in-flight search
        setSearchResults(null);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      debouncedSearch(text);
    },
    [debouncedSearch]
  );

  // --- destination selection ---
  const chooseDestination = useCallback((place: Place) => {
    searchReqIdRef.current++;
    setDestination(place);
    setDestNote('');
    setRoute(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
    setSearchLoading(false);
    setError(null);
  }, []);

  const handleLongPress = useCallback(
    async (coord: LatLng) => {
      setPinLoading(true);
      setError(null);
      try {
        const label = await geo.reverseGeocode(coord);
        chooseDestination({ lat: coord.lat, lng: coord.lng, label: label ?? 'Pinned location' });
      } finally {
        setPinLoading(false);
      }
    },
    [chooseDestination]
  );

  const handleBack = useCallback(() => {
    setDestination(null);
    setDestNote('');
    setRoute(null);
    setError(null);
  }, []);

  // --- ride actions ---
  const submitRequest = useCallback(async () => {
    if (!myPos || !destination) return;
    setSubmitting(true);
    setError(null);
    try {
      const { ride: newRide } = await api.requestRide(token, {
        pickup: myPos,
        destination,
        note: destNote.trim() || undefined,
      });
      const updatedRecents = await addRecentPlace(destination);
      setRecentPlaces(updatedRecents);
      setRide(newRide);
      setDestination(null);
      setDestNote('');
      setRoute(null);
    } catch (err) {
      setError(friendlyError(err, 'Could not request a ride. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [myPos, destination, destNote, token]);

  const handleCancel = useCallback(async () => {
    if (!ride) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.cancelRide(token, ride.id);
      setRide(null);
      setDriverPos(null);
    } catch (err) {
      setError(friendlyError(err, 'Could not cancel. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [ride, token]);

  const handleComplete = useCallback(async () => {
    if (!ride) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.completeRide(token, ride.id);
      setRide(null);
      setDriverPos(null);
    } catch (err) {
      setError(friendlyError(err, 'Could not complete the ride. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [ride, token]);

  const submitReport = useCallback(async () => {
    if (!reportText.trim()) {
      setReportError('Please describe what happened.');
      return;
    }
    setReportSubmitting(true);
    setReportError(null);
    try {
      await api.fileReport(token, { subjectUserId: ride?.driverId, description: reportText.trim() });
      setReportOpen(false);
      setReportText('');
    } catch (err) {
      setReportError(friendlyError(err, 'Could not send the report. Please try again.'));
    } finally {
      setReportSubmitting(false);
    }
  }, [reportText, ride, token]);

  const markers = useMemo<NonNullable<OsmMapProps['markers']>>(() => {
    if (stage === 'preview' && destination && myPos) {
      return [
        { id: 'me', coord: myPos, label: 'You', color: colors.success, kind: 'pin' },
        { id: 'dest', coord: destination, label: destination.label, color: colors.primary, kind: 'pin' },
      ];
    }
    if (stage === 'waiting' && ride) {
      return [
        { id: 'me', coord: ride.pickup, label: 'You', color: colors.success, kind: 'pin' },
        { id: 'dest', coord: ride.destination, label: destLabelFor(ride.destination), color: colors.primary, kind: 'pin' },
      ];
    }
    if (stage === 'active' && ride) {
      const list: NonNullable<OsmMapProps['markers']> = [];
      if (ride.status === 'picked_up') {
        list.push({ id: 'dest', coord: ride.destination, label: destLabelFor(ride.destination), color: colors.primary, kind: 'pin' });
      } else {
        list.push({ id: 'me', coord: ride.pickup, label: 'You', color: colors.success, kind: 'pin' });
      }
      if (driverPos) {
        list.push({ id: 'driver', coord: driverPos, label: ride.driverName ?? 'Driver', color: colors.accent, kind: 'car' });
      }
      return list;
    }
    return [];
  }, [stage, destination, myPos, ride, driverPos]);

  // --- location gating states ---
  if (locStatus === 'checking') {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.body, { marginTop: spacing.m }]}>Finding your location…</Text>
      </View>
    );
  }

  if (locStatus === 'denied') {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: spacing.l }]}>
        <Text style={[styles.h1, { textAlign: 'center' }]}>Location access needed</Text>
        <Text style={[styles.body, { textAlign: 'center', marginTop: spacing.m }]}>
          Holy Roof Rides needs your location to find you a ride and show drivers where to pick you up.
        </Text>
        <Pressable style={[styles.button, { marginTop: spacing.l }]} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </Pressable>
        <Pressable style={[styles.buttonSecondary, { marginTop: spacing.m }]} onPress={requestLocation}>
          <Text style={styles.buttonSecondaryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  if (!myPos) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center', padding: spacing.l }]}>
        {locError ? (
          <>
            <Text style={[styles.body, { textAlign: 'center' }]}>{locError}</Text>
            <Pressable style={[styles.button, { marginTop: spacing.m }]} onPress={requestLocation}>
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.body, { marginTop: spacing.m }]}>Finding your location…</Text>
          </>
        )}
      </View>
    );
  }

  let mapFitTo: LatLng[] | undefined;
  let mapPolyline: LatLng[] | undefined;
  let mapFollowsUser = false;

  if (stage === 'idle') {
    mapFollowsUser = true;
  } else if (stage === 'preview' && destination) {
    mapFitTo = [myPos, destination];
    mapPolyline = route?.coords;
  } else if (stage === 'waiting' && ride) {
    mapFitTo = [ride.pickup, ride.destination];
    mapPolyline = route?.coords;
  } else if (stage === 'active' && ride) {
    const target = ride.status === 'picked_up' ? ride.destination : ride.pickup;
    mapFitTo = [driverPos ?? ride.pickup, target];
    mapPolyline = etaRoute?.coords;
  }

  return (
    <View style={styles.screen}>
      <OsmMap
        style={{ flex: 1 }}
        center={myPos}
        fitTo={mapFitTo}
        polyline={mapPolyline}
        followsUser={mapFollowsUser}
        markers={markers}
        onLongPress={!loadingRides && (stage === 'idle' || stage === 'preview') ? handleLongPress : undefined}
      />

      <View style={{ padding: spacing.m }}>
        {notice && (
          <View style={{ backgroundColor: '#FCEFD8', borderRadius: radius.s, padding: spacing.s, marginBottom: spacing.s }}>
            <Text style={{ color: colors.primaryDark, textAlign: 'center' }}>{notice}</Text>
          </View>
        )}

        {loadingRides ? (
          <LoadingCard text="Checking for an active ride…" />
        ) : pinLoading ? (
          <LoadingCard text="Finding that spot…" />
        ) : stage === 'active' && ride ? (
          <ActiveCard
            ride={ride}
            driverPos={driverPos}
            etaRoute={etaRoute}
            submitting={submitting}
            error={error}
            onCancel={handleCancel}
            onComplete={handleComplete}
            onReport={() => setReportOpen(true)}
          />
        ) : stage === 'waiting' && ride ? (
          <WaitingCard
            label={destLabelFor(ride.destination)}
            pulseAnim={pulseAnim}
            submitting={submitting}
            error={error}
            onCancel={handleCancel}
          />
        ) : stage === 'preview' && destination ? (
          <PreviewCard
            destination={destination}
            route={route}
            routeLoading={routeLoading}
            note={destNote}
            onChangeNote={setDestNote}
            submitting={submitting}
            error={error}
            onBack={handleBack}
            onSubmit={submitRequest}
          />
        ) : (
          <IdleCard
            query={searchQuery}
            onChangeQuery={onChangeQuery}
            searchLoading={searchLoading}
            searchError={searchError}
            searchResults={searchResults}
            onSelectPlace={chooseDestination}
            church={church}
            recentPlaces={recentPlaces}
            error={error}
          />
        )}
      </View>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.l }}>
          <View style={styles.card}>
            <Text style={styles.h2}>Report a concern</Text>
            <Text style={[styles.mutedText, { marginTop: spacing.xs, marginBottom: spacing.s }]}>
              This goes straight to the deacons. Tell them what happened.
            </Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
              value={reportText}
              onChangeText={setReportText}
              multiline
              placeholder="What happened?"
              placeholderTextColor={colors.muted}
            />
            {reportError && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{reportError}</Text>}
            <View style={{ flexDirection: 'row', marginTop: spacing.m, gap: spacing.s }}>
              <Pressable
                style={[styles.buttonSecondary, { flex: 1 }]}
                onPress={() => {
                  setReportOpen(false);
                  setReportText('');
                  setReportError(null);
                }}
                disabled={reportSubmitting}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={submitReport} disabled={reportSubmitting}>
                <Text style={styles.buttonText}>{reportSubmitting ? 'Sending…' : 'Send report'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
