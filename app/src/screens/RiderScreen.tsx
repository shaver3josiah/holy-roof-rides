// CONTRACT (implemented by build agent): "Receiving Rides" view (the default).
// Rendered INSIDE HomeScreen (no navigation props; use useSession()/useMode()).
// - expo-location foreground permission -> current position -> OsmMap centered
//   there, followsUser.
// - No active ride: long-press map to drop destination pin (optional label +
//   note) -> api.requestRide with pickup = current location.
// - Waiting: show "Asking the congregation..." card + cancel button.
// - Accepted: show driver name + live driver marker (api.openLive; handle
//   'driver_location', 'ride_ended', 'ride_reopened'). Buttons: complete, cancel,
//   "Report a concern" -> api.fileReport (small modal).
// - Poll/refresh rides on 'rides_changed'. Close the socket on unmount.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import OsmMap, { type OsmMapProps } from '../components/OsmMap';
import { colors, spacing, styles } from '../theme';
import type { LatLng, LiveMessage, Ride } from '../types';

function friendlyError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

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

  const [pendingDest, setPendingDest] = useState<LatLng | null>(null);
  const [destLabel, setDestLabel] = useState('');
  const [destNote, setDestNote] = useState('');

  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const rideRef = useRef(ride);
  useEffect(() => {
    rideRef.current = ride;
  }, [ride]);

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
      if (!mine || mine.status !== 'accepted') setDriverPos(null);
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

  // --- live socket ---
  useEffect(() => {
    const ws = api.openLive(token);
    ws.onmessage = (event) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'rides_changed':
          refreshRides();
          break;
        case 'ride_accepted':
        case 'ride_reopened':
          if (rideRef.current && rideRef.current.id === msg.ride.id) {
            setRide(msg.ride);
            if (msg.ride.status !== 'accepted') setDriverPos(null);
          }
          break;
        case 'ride_ended':
          if (rideRef.current && rideRef.current.id === msg.rideId) {
            setRide(null);
            setDriverPos(null);
            setNotice(msg.reason === 'cancelled' ? 'Your ride was cancelled.' : 'Your ride has ended.');
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
  }, [token, refreshRides]);

  // --- actions ---
  const submitRequest = useCallback(async () => {
    if (!myPos || !pendingDest) return;
    setSubmitting(true);
    setError(null);
    try {
      const { ride: newRide } = await api.requestRide(token, {
        pickup: myPos,
        destination: { ...pendingDest, label: destLabel.trim() || undefined },
        note: destNote.trim() || undefined,
      });
      setRide(newRide);
      setPendingDest(null);
      setDestLabel('');
      setDestNote('');
    } catch (err) {
      setError(friendlyError(err, 'Could not request a ride. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [myPos, pendingDest, destLabel, destNote, token]);

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
    const list: NonNullable<OsmMapProps['markers']> = [];
    if (ride) {
      list.push({
        id: 'dest',
        coord: ride.destination,
        label: ride.destination.label ?? 'Drop-off',
        color: colors.primary,
      });
      if (ride.status === 'accepted' && driverPos) {
        list.push({ id: 'driver', coord: driverPos, label: ride.driverName ?? 'Driver', color: colors.accent });
      }
    } else if (pendingDest) {
      list.push({ id: 'pending', coord: pendingDest, label: destLabel || 'Drop-off', color: colors.primary });
    }
    return list;
  }, [ride, driverPos, pendingDest, destLabel]);

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

  return (
    <View style={styles.screen}>
      <OsmMap
        style={{ flex: 1 }}
        center={myPos}
        followsUser
        markers={markers}
        onLongPress={!ride && !loadingRides ? (coord) => setPendingDest(coord) : undefined}
      />

      <View style={{ padding: spacing.m }}>
        {notice && (
          <Text style={[styles.mutedText, { marginBottom: spacing.s, textAlign: 'center' }]}>{notice}</Text>
        )}

        {ride && ride.status === 'accepted' ? (
          <View style={styles.card}>
            <Text style={styles.h2}>🚗 {ride.driverName ?? 'A driver'} is on the way</Text>
            <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>
              Heading to {ride.destination.label ?? 'your drop-off'}.
            </Text>
            {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
            <View style={{ flexDirection: 'row', marginTop: spacing.m, gap: spacing.s }}>
              <Pressable style={[styles.buttonSecondary, { flex: 1 }]} onPress={handleCancel} disabled={submitting}>
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={handleComplete} disabled={submitting}>
                <Text style={styles.buttonText}>{submitting ? 'Please wait…' : 'Complete ride'}</Text>
              </Pressable>
            </View>
            <Pressable
              style={{ marginTop: spacing.m, alignItems: 'center', paddingVertical: spacing.xs }}
              onPress={() => setReportOpen(true)}
            >
              <Text style={{ color: colors.danger, fontWeight: '600' }}>⚠️ Report a concern</Text>
            </Pressable>
          </View>
        ) : ride && ride.status === 'open' ? (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.h2, { marginLeft: spacing.s }]}>Asking the congregation…</Text>
            </View>
            <Text style={[styles.mutedText, { marginTop: spacing.xs }]}>
              We'll let you know as soon as someone can take you.
            </Text>
            {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
            <Pressable
              style={[styles.buttonSecondary, { marginTop: spacing.m }]}
              onPress={handleCancel}
              disabled={submitting}
            >
              <Text style={styles.buttonSecondaryText}>{submitting ? 'Cancelling…' : 'Cancel request'}</Text>
            </Pressable>
          </View>
        ) : pendingDest ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Where are you headed?</Text>
            <TextInput
              style={[styles.input, { marginTop: spacing.s }]}
              value={destLabel}
              onChangeText={setDestLabel}
              placeholder="Label (optional) — e.g. Grocery store"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={[styles.input, { marginTop: spacing.s }]}
              value={destNote}
              onChangeText={setDestNote}
              placeholder="Note for drivers (optional)"
              placeholderTextColor={colors.muted}
            />
            {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
            <View style={{ flexDirection: 'row', marginTop: spacing.m, gap: spacing.s }}>
              <Pressable
                style={[styles.buttonSecondary, { flex: 1 }]}
                onPress={() => setPendingDest(null)}
                disabled={submitting}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { flex: 1 }]}
                onPress={submitRequest}
                disabled={submitting}
              >
                <Text style={styles.buttonText}>{submitting ? 'Requesting…' : 'Request ride'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            {loadingRides ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.body, { marginLeft: spacing.s }]}>Checking for an active ride…</Text>
              </View>
            ) : (
              <>
                <Text style={styles.h2}>Need a ride?</Text>
                <Text style={[styles.body, { marginTop: spacing.xs }]}>
                  Long-press anywhere on the map to drop a pin where you're headed.
                </Text>
              </>
            )}
            {error && <Text style={{ color: colors.danger, marginTop: spacing.s }}>{error}</Text>}
          </View>
        )}
      </View>

      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReportOpen(false)}
      >
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
