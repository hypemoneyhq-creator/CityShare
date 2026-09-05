import { API_BASE_URL } from './config';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface OpsUser {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  isOps: boolean;
}

export type RunStatus = 'SCHEDULED' | 'ASSIGNED' | 'CLOSED_UNASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ServiceType = 'DIRECT' | 'STOPS';

export interface VehicleNow {
  runId: string;
  serviceCode: string;
  serviceName: string;
  corridorName: string;
  status: RunStatus;
  statusLabel: string;
  seatsSold: number;
  capacity: number;
}

export interface CorridorCapacity {
  corridorId: string;
  name: string;
  origin: string;
  destination: string;
  services: {
    code: string;
    name: string;
    type: ServiceType;
    runsToday: number;
    capacity: number;
    seatsSold: number;
    loadPct: number | null;
  }[];
  partnerSeatsListed: number;
}

export interface LiveSummary {
  escrowPosition: {
    heldCedis: number;
    releasedTodayCedis: number;
    disputedCedis: number;
    openDisputes: number;
  };
  onTimeDeparturePct: number | null;
  seatUtilizationPct: number | null;
  partnerTripsToday: number;
  activeRunsToday: number;
  vehiclesNow: VehicleNow[];
  corridorCapacity: CorridorCapacity[];
}

export interface DisputeCase {
  bookingId: string;
  riderName: string;
  tripLabel: string;
  claim: string;
  raisedBy: 'SYSTEM' | 'RIDER' | 'DRIVER' | 'OPS' | null;
  ageMs: number | null;
  heldCedis: number;
  chips: string[];
}

export interface CorridorStop {
  id: string;
  name: string;
  sequence: number;
  lat: number;
  lng: number;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  maxDwellSeconds: number;
  boardAllowed: boolean;
  alightAllowed: boolean;
}

export interface CorridorOverview {
  id: string;
  name: string;
  origin: string;
  destination: string;
  services: {
    id: string;
    code: string;
    name: string;
    type: ServiceType;
    active: boolean;
    runsToday: number;
    stops: CorridorStop[];
  }[];
}

export const api = {
  startPhoneVerification: (phone: string) =>
    request<{ sent: true; devCode?: string }>('/api/auth/phone/start', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyPhoneCode: (phone: string, code: string) =>
    request<{ token: string; user: OpsUser }>('/api/auth/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),

  me: (token: string) => request<{ user: OpsUser }>('/api/auth/me', {}, token),

  getSummary: (token: string) => request<LiveSummary>('/api/ops/summary', {}, token),

  getDisputes: (token: string) => request<{ disputes: DisputeCase[] }>('/api/ops/disputes', {}, token),

  getCorridors: (token: string) => request<{ corridors: CorridorOverview[] }>('/api/ops/corridors', {}, token),

  resolveDispute: (token: string, bookingId: string, toState: 'RELEASABLE' | 'REFUNDING', note: string) =>
    request(
      `/api/bookings/${bookingId}/resolve-dispute`,
      { method: 'POST', body: JSON.stringify({ toState, note }) },
      token,
    ),
};
