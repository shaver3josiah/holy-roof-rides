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
import { Church as ChurchIcon, Phone, Share2, ShieldCheck, TriangleAlert, UserCheck, UsersRound } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useSession } from '../../App';
import * as api from '../api';
import { ApiError } from '../api';
import OsmMap from '../components/OsmMap';
import { Badge, Banner, Button, EmptyState, InviteCodeDisplay } from '../components/ui';
import * as geo from '../geo';
import { colors, fonts, palette, radius, spacing, styles, type } from '../theme';
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
        borderRadius: radius.pill,
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
            minHeight: 44,
            paddingVertical: 10,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active === t.key ? colors.primary : 'transparent',
          }}
        >
          <Text
            style={{
              fontFamily: fonts.sansSemiBold,
              fontSize: type.s,
              color: active === t.key ? palette.white : colors.text,
            }}
          >
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
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
      {error && <Banner kind="error" style={{ marginHorizontal: spacing.m, marginBottom: spacing.s }}>{error}</Banner>}
      {users && users.length === 0 && (
        <EmptyState
          icon={UserCheck}
          title="No one is waiting on approval right now."
          style={{ marginHorizontal: spacing.m }}
        />
      )}
      {users?.map((u) => (
        <View key={u.id} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <Text style={styles.h2}>{u.name}</Text>
          <Text style={[styles.mutedText, { marginTop: 2, marginBottom: spacing.m }]}>{u.phone}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.s }}>
            <Button label="Approve" style={{ flex: 1 }} onPress={() => act(u.id, 'approve')} disabled={busyId === u.id} />
            <Button
              label="Reject"
              variant="danger"
              style={{ flex: 1 }}
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
      {error && <Banner kind="error" style={{ marginHorizontal: spacing.m, marginBottom: spacing.s }}>{error}</Banner>}
      {reports && reports.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="No safety reports have been filed. That's good news."
          style={{ marginHorizontal: spacing.m }}
        />
      )}
      {open.map((r) => (
        <View key={r.id} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <TriangleAlert size={16} color={colors.danger} />
            <Text style={styles.h2}>{r.subjectName ?? 'General concern'}</Text>
          </View>
          <Text style={[styles.mutedText, { marginTop: 2 }]}>Reported by {r.reporterName}</Text>
          <Text style={[styles.body, { marginTop: spacing.s, marginBottom: spacing.m }]}>{r.description}</Text>
          <Button label="Mark resolved" variant="secondary" onPress={() => resolve(r.id)} disabled={busyId === r.id} />
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
      {error && <Banner kind="error" style={{ marginHorizontal: spacing.m, marginBottom: spacing.s }}>{error}</Banner>}
      {members && members.length === 0 && (
        <EmptyState icon={UsersRound} title="No members yet." style={{ marginHorizontal: spacing.m }} />
      )}
      {members?.map((m) => (
        <View key={m.id} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.h2, { flex: 1 }]}>{m.name}</Text>
            {m.isDeacon && <Badge label="DEACON" />}
          </View>
          <Pressable
            onPress={() => call(m.phone)}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 4, marginBottom: spacing.m },
              pressed ? { opacity: 0.6 } : null,
            ]}
          >
            <Phone size={16} color={colors.primary} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.base, color: colors.primary }}>{m.phone}</Text>
          </Pressable>
          {!m.isDeacon && (
            <Button label="Make deacon" variant="secondary" onPress={() => makeDeacon(m.id)} disabled={busyId === m.id} />
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
    Share.share({ message: `Join Holy Roof Rides! Use invite code: ${code}` }).catch(() => {
      // ponytail: share sheet dismissed/unavailable — no follow-up needed
    });
  }, []);

  if (!invites && !error) {
    return <ActivityIndicator style={{ marginTop: spacing.l }} color={colors.primary} />;
  }

  return (
    <View>
      {error && <Banner kind="error" style={{ marginHorizontal: spacing.m, marginBottom: spacing.s }}>{error}</Banner>}
      <View style={{ marginHorizontal: spacing.m, marginBottom: spacing.m }}>
        <Button label={creating ? 'Creating…' : '+ New invite code'} onPress={create} disabled={creating} loading={creating} />
      </View>
      {invites && invites.length === 0 && (
        <EmptyState
          title="No invite codes yet. Create one to bring in new members."
          style={{ marginHorizontal: spacing.m }}
        />
      )}
      {invites?.map((inv) => (
        <View key={inv.code} style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.s }]}>
          <InviteCodeDisplay code={inv.code} style={{ marginBottom: spacing.s }} />
          <Text style={[styles.mutedText, { textAlign: 'center', marginBottom: spacing.m }]}>
            {inv.revoked
              ? 'Revoked'
              : `Used ${inv.uses}/${inv.maxUses} · by ${inv.createdByName}${
                  inv.expiresAt ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}` : ''
                }`}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.s }}>
            <Button
              label="Share"
              icon={Share2}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => share(inv.code)}
              disabled={inv.revoked}
            />
            <Button
              label="Revoke"
              variant="danger"
              style={{ flex: 1 }}
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
      {error && <Banner kind="error" style={{ marginBottom: spacing.s }}>{error}</Banner>}
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
            borderRadius: radius.m,
            marginBottom: spacing.m,
            overflow: 'hidden',
          }}
        >
          {results.map((r, i) => (
            <Pressable
              key={`${r.lat},${r.lng},${i}`}
              onPress={() => pick(r)}
              style={({ pressed }) => [
                {
                  paddingVertical: 12,
                  paddingHorizontal: spacing.m,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                },
                pressed ? { backgroundColor: colors.sunkenPressed } : null,
              ]}
            >
              <Text style={styles.body}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {selected && (
        <View style={{ height: 160, borderRadius: radius.m, overflow: 'hidden', marginBottom: spacing.m }}>
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
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onCancel} disabled={saving} />
        <Button label={saving ? 'Saving…' : 'Save'} style={{ flex: 1 }} onPress={save} disabled={!canSave} loading={saving} />
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
      {error && <Banner kind="error" style={{ marginHorizontal: spacing.m, marginBottom: spacing.s }}>{error}</Banner>}
      <Banner kind="info" style={{ marginHorizontal: spacing.m, marginBottom: spacing.m }}>
        Members get a one-tap "Take me to Church" button.
      </Banner>
      {editing ? (
        <ChurchEditForm token={token} initial={church ?? null} onCancel={() => setEditing(false)} onSaved={handleSaved} />
      ) : (
        <>
          {success && (
            <Banner kind="success" style={{ marginHorizontal: spacing.m, marginBottom: spacing.s }}>
              Saved. Members will see the new location.
            </Banner>
          )}
          {church ? (
            <View style={[styles.card, { marginHorizontal: spacing.m, marginBottom: spacing.m }]}>
              <Text style={styles.h2}>{church.name}</Text>
              <Text style={[styles.mutedText, { marginTop: 2, marginBottom: spacing.m }]}>{church.address}</Text>
              <View style={{ height: 160, borderRadius: radius.m, overflow: 'hidden', marginBottom: spacing.m }}>
                <OsmMap
                  center={{ lat: church.lat, lng: church.lng }}
                  markers={[
                    { id: 'church', coord: { lat: church.lat, lng: church.lng }, label: church.name, kind: 'church' },
                  ]}
                />
              </View>
              <Button label="Set / change" variant="secondary" onPress={startEditing} />
            </View>
          ) : (
            <View style={{ marginHorizontal: spacing.m }}>
              <EmptyState
                icon={ChurchIcon}
                title={`No home location set yet. Members won't see a "Take me to Church" button until you add one.`}
                style={{ marginBottom: spacing.m }}
              />
              <Button label="Set church location" onPress={startEditing} />
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
