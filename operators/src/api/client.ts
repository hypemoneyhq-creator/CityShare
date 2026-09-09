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
  const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface SessionUser {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
}

export type OperatorStatus = 'APPLICATION' | 'CERTIFYING' | 'CERTIFIED' | 'SUSPENDED';

export type DocumentKey =
  | 'RGD_CERTIFICATE'
  | 'TRANSPORT_LICENCE'
  | 'DRIVER_ROSTER'
  | 'INSURANCE_ENDORSEMENT'
  | 'SAFETY_STANDARD_AGREEMENT';

export interface Operator {
  id: string;
  registeredName: string;
  rgdNumber: string | null;
  operatingSince: number | null;
  contactName: string | null;
  status: OperatorStatus;
  submittedAt: string | null;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  label: string;
  vehicleType: string;
  spec: string;
  seats: number;
}

export interface CorridorInterest {
  corridorId: string;
  corridor: { id: string; name: string; origin: string; destination: string };
}

export interface OperatorDocument {
  key: DocumentKey;
  uploadedAt: string | null;
}

export interface RosterDriver {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  ghanaCardVerifiedAt: string | null;
}

export interface Readiness {
  hasVehicle: boolean;
  hasCorridor: boolean;
  docsComplete: boolean;
  docsUploaded: number;
  docsTotal: number;
  ready: boolean;
}

export interface OperatorProfile extends Operator {
  vehicles: Vehicle[];
  corridorInterests: CorridorInterest[];
  documents: OperatorDocument[];
  drivers: RosterDriver[];
  readiness: Readiness;
}

export interface CertificationCheck {
  key: string;
  name: string;
  detail: string;
  status: 'CLEARED' | 'WAITING' | 'IN_PROGRESS';
  clearedAt: string | null;
}

export interface ConsoleRun {
  runId: string;
  serviceCode: string;
  serviceName: string;
  stops: string[];
  scheduledDeparture: string | null;
  statusLabel: string;
  vehicle: { id: string; label: string } | null;
  driver: { id: string; name: string } | null;
  seatsSold: number;
  capacity: number;
  isYours: boolean;
}

export interface ConsoleData {
  vehicles: Vehicle[];
  runs: ConsoleRun[];
  soldTotal: number;
  releasedTotal: number;
  loadPct: number | null;
  onTimeDeparturePct: number | null;
  availablePayoutCedis: number;
  pendingPayoutCedis: number;
}

export interface Corridor {
  id: string;
  name: string;
  origin: string;
  destination: string;
}

export const api = {
  startPhoneVerification: (phone: string) =>
    request<{ sent: true; devCode?: string }>('/api/auth/phone/start', { method: 'POST', body: JSON.stringify({ phone }) }),

  verifyPhoneCode: (phone: string, code: string) =>
    request<{ token: string; user: SessionUser }>('/api/auth/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),

  getCorridors: () => request<{ corridors: Corridor[] }>('/api/corridors'),

  upsertApplication: (
    token: string,
    fields: { registeredName: string; rgdNumber?: string; operatingSince?: number; contactName?: string },
  ) => request<{ operator: Operator }>('/api/operators/application', { method: 'POST', body: JSON.stringify(fields) }, token),

  getMine: (token: string) => request<{ operator: OperatorProfile }>('/api/operators/mine', {}, token),

  addVehicle: (token: string, fields: { label: string; vehicleType: string; spec: string; seats: number }) =>
    request<{ vehicle: Vehicle }>('/api/operators/vehicles', { method: 'POST', body: JSON.stringify(fields) }, token),

  removeVehicle: (token: string, id: string) => request(`/api/operators/vehicles/${id}`, { method: 'DELETE' }, token),

  setCorridorInterest: (token: string, corridorId: string, on: boolean) =>
    request(`/api/operators/corridors/${corridorId}`, { method: 'POST', body: JSON.stringify({ on }) }, token),

  toggleDocument: (token: string, key: DocumentKey) =>
    request<{ document: OperatorDocument }>(`/api/operators/documents/${key}`, { method: 'POST' }, token),

  submitApplication: (token: string) => request<{ operator: Operator }>('/api/operators/submit', { method: 'POST' }, token),

  getCertification: (token: string) =>
    request<{ operator: Operator; checks: CertificationCheck[] }>('/api/operators/certification', {}, token),

  addDriver: (token: string, phone: string) =>
    request<{ driver: SessionUser }>('/api/operators/drivers', { method: 'POST', body: JSON.stringify({ phone }) }, token),

  removeDriver: (token: string, userId: string) =>
    request(`/api/operators/drivers/${userId}`, { method: 'DELETE' }, token),

  getConsole: (token: string) => request<ConsoleData>('/api/operators/console', {}, token),

  assignRun: (token: string, runId: string, vehicleId: string, driverId?: string) =>
    request<{ run: unknown }>(
      `/api/operators/runs/${runId}/assign`,
      { method: 'POST', body: JSON.stringify({ vehicleId, driverId }) },
      token,
    ),
};
