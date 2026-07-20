// CONTRACT (implemented by build agent): Deacon admin panel (tabs or sections):
// 1. Approvals: adminPending -> approve / reject buttons.
// 2. Safety reports: adminReports -> reporter, subject, description, resolve.
// 3. Members: adminMembers -> name, phone (tap to call via Linking), deacon
//    badge, make-deacon action.
// 4. Invites: adminInvites list + create (adminCreateInvite -> show code big,
//    Share button) + revoke.
// 5. Church: getChurch -> card with name/address/small map. "Set / change"
//    flow: name + address search (geo.searchPlaces, debounced) -> pick a
//    result to preview on the map -> adminSetChurch to save.
// Non-deacons never reach this screen (Home hides the button), but guard
// anyway: if !session.user.isDeacon, render nothing.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import OsmMap from '../components/OsmMap';
import * as geo from '../geo';
import { colors, spacing, styles } from '../theme';
import type { Church, Invite, Member, Place, SafetyReport } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Admin'>;

type Tab = 'approvals' | 'reports' | 'members' | 'invites' | 'church';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'approvals', label: 'Approvals' },
  { key: 'reports', label: 'Reports' },
  { key: 'members', label: 'Members' },
  { key: 'invites', label: 'Invites' },
  { key: 'church', label: 'Church' },
];

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Check your connection and try again.';
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.border,
        borderRadius: 999,
        padding: 3,
        marginHorizontal: spacing.m,
        marginVertical: spacing.s,
      }}
    >
      {TABS.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => onChange(t.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: active === t.key }}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: 'center',
            backgroundColor: active === t.key ? colors.primary : 'transparent',
          }}
        >
          <Text style={{ fontWeight: '600', fontSize: 13, color: active === t.key ? '#fff' : colors.muted }}>
            {t.label}
          </Text>
        </Pressable>
      ))}
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <View
      style={{
        backgroundColor: '#FBEAE5',
        borderRadius: 12,
        padding: spacing.m,
        marginHorizontal: spacing.m,
        marginBottom: spacing.s,
      }}
    >
      <Text style={{ color: colors.danger, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : 'transparent';
  const border = kind === 'secondary' ? colors.primary : bg;
  const textColor = kind === 'secondary' ? colors.primary : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        backgroundColor: kind === 'secondary' ? 'transparent' : bg,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: textColor, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

// --- Approvals ---

function ApprovalsTab({ token }: { token: string }) {
  const [users, setUsers] = useState<Array<Pick<Member, 'id' | 'name' | 'phone' | 'createdAt'>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { users } = await api.adminPending(token);
      setUsers(users);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (id: number, action: 'approve' | 'reject') => {
      setBusyId(id);
      setError(null);
      // optimistic: pull the row immediately
      const prev = users;
      setUsers((u) => (u ? u.filter((m) => m.id !== id) : u));
      try {
        if (action === 'approve') await api.adminApprove(token, id);
        else await api.adminReject(token, id);
      } catch (err) {
        setUsers(prev);
        setError(friendlyError(err));
      } finally {
        setBusyId(null);
      }
    },
    [token, users]
  );

  if (!users && !error) {
    return <ActivityIndicator style={{ marginTop: spacing.l }} color={colors.primary} />;
  }

  return (
    <View>
      {error && <ErrorBanner message={error} />}
      {users && users.length === 0 && <EmptyState text="No one is waiting on approval right now." />}
      {users?.map((u) => (
        <View key={u.id} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <Text style={styles.h2}>{u.name}</Text>
          <Text style={[styles.mutedText, { marginTop: 2, marginBottom: spacing.m }]}>{u.phone}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.s }}>
            <ActionButton label="Approve" onPress={() => act(u.id, 'approve')} disabled={busyId === u.id} />
            <ActionButton
              label="Reject"
              kind="danger"
              onPress={() => act(u.id, 'reject')}
              disabled={busyId === u.id}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// --- Reports ---

function ReportsTab({ token }: { token: string }) {
  const [reports, setReports] = useState<SafetyReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { reports } = await api.adminReports(token);
      setReports(reports);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = useCallback(
    async (id: number) => {
      setBusyId(id);
      setError(null);
      const prev = reports;
      setReports((r) => (r ? r.map((x) => (x.id === id ? { ...x, status: 'resolved' } : x)) : r));
      try {
        await api.adminResolveReport(token, id);
      } catch (err) {
        setReports(prev);
        setError(friendlyError(err));
      } finally {
        setBusyId(null);
      }
    },
    [token, reports]
  );

  if (!reports && !error) {
    return <ActivityIndicator style={{ marginTop: spacing.l }} color={colors.primary} />;
  }

  const open = reports?.filter((r) => r.status === 'open') ?? [];
  const resolved = reports?.filter((r) => r.status === 'resolved') ?? [];

  return (
    <View>
      {error && <ErrorBanner message={error} />}
      {reports && reports.length === 0 && <EmptyState text="No safety reports have been filed. That's good news." />}
      {open.map((r) => (
        <View key={r.id} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <Text style={styles.h2}>{r.subjectName ?? 'General concern'}</Text>
          <Text style={[styles.mutedText, { marginTop: 2 }]}>Reported by {r.reporterName}</Text>
          <Text style={[styles.body, { marginTop: spacing.s, marginBottom: spacing.m }]}>{r.description}</Text>
          <ActionButton label="Mark resolved" onPress={() => resolve(r.id)} disabled={busyId === r.id} />
        </View>
      ))}
      {resolved.length > 0 && (
        <>
          <Text style={[styles.mutedText, { marginHorizontal: spacing.m, marginTop: spacing.s, marginBottom: spacing.xs }]}>
            Resolved
          </Text>
          {resolved.map((r) => (
            <View
              key={r.id}
              style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s, opacity: 0.6 }]}
            >
              <Text style={styles.h2}>{r.subjectName ?? 'General concern'}</Text>
              <Text style={[styles.mutedText, { marginTop: 2 }]}>Reported by {r.reporterName}</Text>
              <Text style={[styles.body, { marginTop: spacing.s }]}>{r.description}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// --- Members ---

function MembersTab({ token }: { token: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { users } = await api.adminMembers(token);
      setMembers(users);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const makeDeacon = useCallback(
    async (id: number) => {
      setBusyId(id);
      setError(null);
      const prev = members;
      setMembers((m) => (m ? m.map((x) => (x.id === id ? { ...x, isDeacon: true } : x)) : m));
      try {
        await api.adminMakeDeacon(token, id);
      } catch (err) {
        setMembers(prev);
        setError(friendlyError(err));
      } finally {
        setBusyId(null);
      }
    },
    [token, members]
  );

  const call = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      // ponytail: no device can dial (e.g. simulator) — silently ignore, tap just does nothing
    });
  }, []);

  if (!members && !error) {
    return <ActivityIndicator style={{ marginTop: spacing.l }} color={colors.primary} />;
  }

  return (
    <View>
      {error && <ErrorBanner message={error} />}
      {members && members.length === 0 && <EmptyState text="No members yet." />}
      {members?.map((m) => (
        <View key={m.id} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.h2, { flex: 1 }]}>{m.name}</Text>
            {m.isDeacon && (
              <View
                style={{
                  backgroundColor: colors.accent,
                  borderRadius: 999,
                  paddingHorizontal: spacing.s,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>DEACON</Text>
              </View>
            )}
          </View>
          <Pressable onPress={() => call(m.phone)} style={{ marginTop: 4, marginBottom: spacing.m }}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>📞 {m.phone}</Text>
          </Pressable>
          {!m.isDeacon && (
            <ActionButton
              label="Make deacon"
              kind="secondary"
              onPress={() => makeDeacon(m.id)}
              disabled={busyId === m.id}
            />
          )}
        </View>
      ))}
    </View>
  );
}

// --- Invites ---

function InvitesTab({ token }: { token: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { invites } = await api.adminInvites(token);
      setInvites(invites);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const { code } = await api.adminCreateInvite(token, {});
      await load();
      Share.share({ message: `Join Holy Roof Rides! Use invite code: ${code}` }).catch(() => {
        // ponytail: share sheet dismissed/unavailable — code is still shown on screen
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCreating(false);
    }
  }, [token, load]);

  const revoke = useCallback(
    async (code: string) => {
      setBusyCode(code);
      setError(null);
      const prev = invites;
      setInvites((list) => (list ? list.map((i) => (i.code === code ? { ...i, revoked: true } : i)) : list));
      try {
        await api.adminRevokeInvite(token, code);
      } catch (err) {
        setInvites(prev);
        setError(friendlyError(err));
      } finally {
        setBusyCode(null);
      }
    },
    [token, invites]
  );

  const share = useCallback((code: string) => {
    Share.share({ message: `Join Holy Roof Rides! Use invite code: ${code}` }).catch(() => {});
  }, []);

  if (!invites && !error) {
    return <ActivityIndicator style={{ marginTop: spacing.l }} color={colors.primary} />;
  }

  return (
    <View>
      {error && <ErrorBanner message={error} />}
      <View style={{ marginHorizontal: spacing.m, marginBottom: spacing.m }}>
        <ActionButton label={creating ? 'Creating…' : '+ New invite code'} onPress={create} disabled={creating} />
      </View>
      {invites && invites.length === 0 && <EmptyState text="No invite codes yet. Create one to bring in new members." />}
      {invites?.map((inv) => (
        <View key={inv.code} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: '800',
              letterSpacing: 2,
              color: colors.primaryDark,
              textAlign: 'center',
              marginBottom: spacing.s,
            }}
          >
            {inv.code}
          </Text>
          <Text style={[styles.mutedText, { textAlign: 'center', marginBottom: spacing.m }]}>
            {inv.revoked
              ? 'Revoked'
              : `Used ${inv.uses}/${inv.maxUses} · by ${inv.createdByName}${
                  inv.expiresAt ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}` : ''
                }`}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.s }}>
            <ActionButton label="Share" kind="secondary" onPress={() => share(inv.code)} disabled={inv.revoked} />
            <ActionButton
              label="Revoke"
              kind="danger"
              onPress={() => revoke(inv.code)}
              disabled={inv.revoked || busyCode === inv.code}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// --- Church ---

function ChurchEditForm({
  token,
  initial,
  onCancel,
  onSaved,
}: {
  token: string;
  initial: Church | null;
  onCancel: () => void;
  onSaved: (church: Church) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [query, setQuery] = useState(initial?.address ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Place | null>(
    initial ? { label: initial.address, lat: initial.lat, lng: initial.lng } : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchReqIdRef = useRef(0);
  const doSearch = useCallback(async (q: string) => {
    const reqId = ++searchReqIdRef.current;
    setSearching(true);
    const found = await geo.searchPlaces(q);
    if (reqId !== searchReqIdRef.current) return; // a newer search superseded us
    setResults(found);
    setSearching(false);
  }, []);

  const debouncedSearch = useMemo(() => geo.debounce(doSearch, 400), [doSearch]);

  const onQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setSelected(null);
      if (text.trim().length < 3) {
        setResults([]);
        return;
      }
      debouncedSearch(text.trim());
    },
    [debouncedSearch]
  );

  const pick = useCallback((place: Place) => {
    setSelected(place);
    setQuery(place.label);
    setResults([]);
  }, []);

  const canSave = name.trim().length > 0 && !!selected && !saving;

  const save = useCallback(async () => {
    if (!selected || !name.trim()) return;
    setSaving(true);
    setError(null);
    const church: Church = { name: name.trim(), address: selected.label, lat: selected.lat, lng: selected.lng };
    try {
      await api.adminSetChurch(token, church);
      onSaved(church);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }, [token, name, selected, onSaved]);

  return (
    <View style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.m }]}>
      {error && <ErrorBanner message={error} />}
      <Text style={[styles.mutedText, { marginBottom: 4 }]}>Church name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Mount Zion Baptist Church"
        placeholderTextColor={colors.muted}
        style={[styles.input, { marginBottom: spacing.m }]}
      />
      <Text style={[styles.mutedText, { marginBottom: 4 }]}>Address</Text>
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder="Start typing an address…"
        placeholderTextColor={colors.muted}
        style={[styles.input, { marginBottom: spacing.s }]}
      />
      {searching && <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.s }} />}
      {results.length > 0 && (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            marginBottom: spacing.m,
            overflow: 'hidden',
          }}
        >
          {results.map((r, i) => (
            <Pressable
              key={`${r.lat},${r.lng},${i}`}
              onPress={() => pick(r)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: spacing.m,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={styles.body}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {selected && (
        <View style={{ height: 160, borderRadius: 12, overflow: 'hidden', marginBottom: spacing.m }}>
          <OsmMap
            center={{ lat: selected.lat, lng: selected.lng }}
            markers={[
              {
                id: 'preview',
                coord: { lat: selected.lat, lng: selected.lng },
                label: name.trim() || selected.label,
                kind: 'church',
              },
            ]}
          />
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.s }}>
        <ActionButton label="Cancel" kind="secondary" onPress={onCancel} disabled={saving} />
        <ActionButton label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={!canSave} />
      </View>
    </View>
  );
}

function ChurchTab({ token }: { token: string }) {
  const [church, setChurch] = useState<Church | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { church } = await api.getChurch(token);
      setChurch(church);
    } catch (err) {
      setError(friendlyError(err));
      setChurch(null);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const startEditing = useCallback(() => {
    setSuccess(false);
    setEditing(true);
  }, []);

  const handleSaved = useCallback((c: Church) => {
    setChurch(c);
    setEditing(false);
    setSuccess(true);
  }, []);

  if (church === undefined && !error) {
    return <ActivityIndicator style={{ marginTop: spacing.l }} color={colors.primary} />;
  }

  return (
    <View>
      {error && <ErrorBanner message={error} />}
      <Text style={[styles.mutedText, { marginHorizontal: spacing.m, marginBottom: spacing.m }]}>
        Members get a one-tap "Take me to Church" button.
      </Text>
      {editing ? (
        <ChurchEditForm token={token} initial={church ?? null} onCancel={() => setEditing(false)} onSaved={handleSaved} />
      ) : (
        <>
          {success && (
            <View
              style={{
                backgroundColor: '#E7F3EA',
                borderRadius: 12,
                padding: spacing.m,
                marginHorizontal: spacing.m,
                marginBottom: spacing.s,
              }}
            >
              <Text style={{ color: colors.success, fontSize: 14 }}>Saved. Members will see the new location.</Text>
            </View>
          )}
          {church ? (
            <View style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.m }]}>
              <Text style={styles.h2}>{church.name}</Text>
              <Text style={[styles.mutedText, { marginTop: 2, marginBottom: spacing.m }]}>{church.address}</Text>
              <View style={{ height: 160, borderRadius: 12, overflow: 'hidden', marginBottom: spacing.m }}>
                <OsmMap
                  center={{ lat: church.lat, lng: church.lng }}
                  markers={[
                    { id: 'church', coord: { lat: church.lat, lng: church.lng }, label: church.name, kind: 'church' },
                  ]}
                />
              </View>
              <ActionButton label="Set / change" kind="secondary" onPress={startEditing} />
            </View>
          ) : (
            <View style={{ marginHorizontal: spacing.m }}>
              <EmptyState text="No home location set yet. Members won't see a 'Take me to Church' button until you add one." />
              <ActionButton label="Set church location" onPress={startEditing} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

export default function AdminScreen(_props: Props) {
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>('approvals');

  if (!session || !session.user.isDeacon) return null;
  const { token } = session;

  return (
    <View style={styles.screen}>
      <TabBar active={tab} onChange={setTab} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {tab === 'approvals' && <ApprovalsTab token={token} />}
        {tab === 'reports' && <ReportsTab token={token} />}
        {tab === 'members' && <MembersTab token={token} />}
        {tab === 'invites' && <InvitesTab token={token} />}
        {tab === 'church' && <ChurchTab token={token} />}
      </ScrollView>
    </View>
  );
}
