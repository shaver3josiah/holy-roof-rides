// REST + WebSocket client. Every function mirrors a route contract in
// server/src/*.js — keep them in lockstep.
import type { Church, Invite, LatLng, Member, Ride, SafetyReport, User } from './types';

let baseUrl = 'http://10.0.2.2:8787';

export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}

export function getBaseUrl(): string {
  return baseUrl;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(baseUrl + path, {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    // Network failure (server down, wrong address, different Wi-Fi). Status 0
    // so screens can tell it apart from a real server response.
    throw new ApiError(
      0,
      `Can't reach the church server at ${baseUrl}. Check the server address and make sure you're on the same Wi-Fi.`
    );
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

// --- auth ---
export const join = (body: { inviteCode: string; name: string; phone: string; pin: string }) =>
  req<{ userId: number; status: User['status'] }>('/join', { method: 'POST', body });

export const login = (body: { phone: string; pin: string }) =>
  req<{ token: string; user: User }>('/login', { method: 'POST', body });

export const logout = (token: string) => req<{ ok: true }>('/logout', { method: 'POST', token });

export const me = (token: string) => req<{ user: User }>('/me', { token });

// --- rides ---
export const getRides = (token: string) => req<{ open: Ride[]; mine: Ride | null }>('/rides', { token });

export const requestRide = (
  token: string,
  body: { pickup: LatLng; destination: LatLng & { label?: string }; note?: string }
) => req<{ ride: Ride }>('/rides', { method: 'POST', body, token });

export const acceptRide = (token: string, id: number) =>
  req<{ ride: Ride }>(`/rides/${id}/accept`, { method: 'POST', token });

export const pickupRide = (token: string, id: number) =>
  req<{ ride: Ride }>(`/rides/${id}/pickup`, { method: 'POST', token });

export const completeRide = (token: string, id: number) =>
  req<{ ok: true }>(`/rides/${id}/complete`, { method: 'POST', token });

export const cancelRide = (token: string, id: number) =>
  req<{ ok: true }>(`/rides/${id}/cancel`, { method: 'POST', token });

// --- church home location ---
export const getChurch = (token: string) => req<{ church: Church | null }>('/church', { token });

export const adminSetChurch = (token: string, body: Church) =>
  req<{ ok: true }>('/admin/church', { method: 'PUT', body, token });

// --- safety reports ---
export const fileReport = (token: string, body: { subjectUserId?: number; description: string }) =>
  req<{ ok: true }>('/reports', { method: 'POST', body, token });

// --- admin (deacons) ---
export const adminPending = (token: string) =>
  req<{ users: Array<Pick<Member, 'id' | 'name' | 'phone' | 'createdAt'>> }>('/admin/pending', { token });

export const adminApprove = (token: string, id: number) =>
  req<{ ok: true }>(`/admin/users/${id}/approve`, { method: 'POST', token });

export const adminReject = (token: string, id: number) =>
  req<{ ok: true }>(`/admin/users/${id}/reject`, { method: 'POST', token });

export const adminMakeDeacon = (token: string, id: number) =>
  req<{ ok: true }>(`/admin/users/${id}/make-deacon`, { method: 'POST', token });

export const adminMembers = (token: string) => req<{ users: Member[] }>('/admin/members', { token });

export const adminCreateInvite = (token: string, body: { maxUses?: number; expiresAt?: string }) =>
  req<{ code: string }>('/admin/invites', { method: 'POST', body, token });

export const adminInvites = (token: string) => req<{ invites: Invite[] }>('/admin/invites', { token });

export const adminRevokeInvite = (token: string, code: string) =>
  req<{ ok: true }>(`/admin/invites/${code}/revoke`, { method: 'POST', token });

export const adminReports = (token: string) => req<{ reports: SafetyReport[] }>('/admin/reports', { token });

export const adminResolveReport = (token: string, id: number) =>
  req<{ ok: true }>(`/admin/reports/${id}/resolve`, { method: 'POST', token });

// --- live ---
/** Open the live WebSocket. Caller owns the socket (attach handlers, close it). */
export function openLive(token: string): WebSocket {
  const wsUrl = baseUrl.replace(/^http/, 'ws') + `/live?token=${encodeURIComponent(token)}`;
  return new WebSocket(wsUrl);
}
