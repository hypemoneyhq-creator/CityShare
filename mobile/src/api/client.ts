import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`);
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

export interface VerificationStatus {
  phoneVerified: boolean;
  idVerified: boolean;
}

export interface UserProfile {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  isRider: boolean;
  isPartner: boolean;
  isDriver: boolean;
  verification: VerificationStatus;
}

export type ServiceType = 'DIRECT' | 'STOPS';

export interface Service {
  id: string;
  corridorId: string;
  code: string;
  name: string;
  type: ServiceType;
  active: boolean;
  flatFareCedis: number | null;
}

export interface Corridor {
  id: string;
  name: string;
  origin: string;
  destination: string;
  services: Service[];
}

export type RunStatus = 'SCHEDULED' | 'ASSIGNED' | 'CLOSED_UNASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Run {
  id: string;
  serviceId: string;
  date: string;
  status: RunStatus;
  vehicleId: string | null;
  driverId: string | null;
  capacity: number;
  createdAt: string;
}

export interface RunStop {
  id: string;
  name: string;
  sequence: number;
  lat: number;
  lng: number;
  maxDwellSeconds: number;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  boardAllowed: boolean;
  alightAllowed: boolean;
  legFareCedis: number | null;
  legAvailability: number | null;
}

export interface RunSegments {
  run: { id: string; date: string; status: RunStatus; capacity: number };
  service: { id: string; code: string; name: string; type: ServiceType; flatFareCedis: number | null };
  stops: RunStop[];
}

export interface PartnerTrip {
  id: string;
  partnerId: string;
  corridorId: string | null;
  originName: string;
  originLat: number;
  originLng: number;
  destinationName: string;
  destLat: number;
  destLng: number;
  departAt: string;
  seatsTotal: number;
  farePerSeatCedis: number;
  vehicleDescription: string;
  comfortAc: boolean;
  comfortUsb: boolean;
  comfortBoot: boolean;
  status: RunStatus;
  createdAt: string;
  partner: { id: string; firstName: string | null; lastName: string | null };
}

export interface Hold {
  id: string;
  seats: number;
  fareCedis: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  expiresAt: string;
}

export type EscrowState =
  | 'PENDING'
  | 'HELD'
  | 'RELEASABLE'
  | 'DISPUTED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'FORFEIT'
  | 'SETTLED'
  | 'VOID';

export interface Escrow {
  id: string;
  bookingId: string;
  state: EscrowState;
  amountCedis: number;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  kind: 'RUN' | 'PARTNER';
  riderId: string;
  runHoldId: string | null;
  partnerHoldId: string | null;
  seats: number;
  fareCedis: number;
  boardingCode: string | null;
  paymentIntentId: string;
  driverBoardedAt: string | null;
  riderBoardedAt: string | null;
  createdAt: string;
  escrow?: Escrow;
  runHold?: { runId: string; boardStopId: string; alightStopId: string } | null;
  partnerHold?: {
    trip: {
      originName: string;
      destinationName: string;
      partner: { firstName: string | null; lastName: string | null };
    };
  } | null;
}

export type ForceOutcome = 'APPROVED' | 'DECLINED' | 'TIMEOUT';

export interface ManifestEntry {
  bookingId: string;
  riderName: string;
  seats: number;
  boardStopId?: string;
  alightStopId?: string;
  boardingCode: string | null;
  driverBoardedAt: string | null;
  riderBoardedAt: string | null;
  escrowState: EscrowState;
}

export interface Earnings {
  availableCedis: number;
  pendingPayoutCedis: number;
  heldInEscrowCedis: number;
  recentPayouts: { id: string; amountCedis: number; status: string; reference: string; createdAt: string }[];
}

export interface DriverRun extends Run {
  service: Service & { corridor: Corridor; stops: RunStop[] };
  seatsSold: number;
}

export interface DwellStatus {
  stop: RunStop & { maxDwellSeconds: number };
  arrivedAt: string | null;
  departedAt: string | null;
  maxDwellSeconds: number;
  remainingSeconds: number | null;
}

export type IncidentCategory = 'heavy_traffic' | 'vehicle_fault' | 'stop_blocked' | 'passenger_issue' | 'accident_sos';

export const api = {
  startPhoneVerification: (phone: string) =>
    request<{ sent: true; devCode?: string }>('/api/auth/phone/start', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyPhoneCode: (phone: string, code: string) =>
    request<{ token: string; user: UserProfile }>('/api/auth/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),

  submitIdentity: (token: string, ghanaCardNumber: string, selfieImage: string) =>
    request<{ user: UserProfile }>(
      '/api/auth/identity',
      { method: 'POST', body: JSON.stringify({ ghanaCardNumber, selfieImage }) },
      token,
    ),

  me: (token: string) => request<{ user: UserProfile }>('/api/auth/me', {}, token),

  getCorridors: () => request<{ corridors: Corridor[] }>('/api/corridors'),

  getServiceRuns: (serviceId: string, date?: string) =>
    request<{ runs: Run[] }>(`/api/services/${serviceId}/runs${date ? `?date=${date}` : ''}`),

  getRunSegments: (runId: string) => request<RunSegments>(`/api/runs/${runId}/segments`),

  getPartnerTrips: (corridorId?: string) =>
    request<{ trips: { trip: PartnerTrip; availableSeats: number }[] }>(
      `/api/partner-trips${corridorId ? `?corridorId=${corridorId}` : ''}`,
    ),

  createRunHold: (token: string, runId: string, boardStopId: string, alightStopId: string, seats: number) =>
    request<{ hold: Hold; fareCedis: number }>(
      `/api/runs/${runId}/holds`,
      { method: 'POST', body: JSON.stringify({ boardStopId, alightStopId, seats }) },
      token,
    ),

  createPartnerHold: (token: string, tripId: string, seats: number) =>
    request<{ hold: Hold; fareCedis: number }>(
      `/api/partner-trips/${tripId}/holds`,
      { method: 'POST', body: JSON.stringify({ seats }) },
      token,
    ),

  payRunHold: (token: string, holdId: string, forceOutcome?: ForceOutcome) =>
    request<{ booking: Booking; intentStatus: string }>(
      `/api/holds/${holdId}/pay`,
      { method: 'POST', body: JSON.stringify(forceOutcome ? { forceOutcome } : {}) },
      token,
    ),

  payPartnerHold: (token: string, holdId: string, forceOutcome?: ForceOutcome) =>
    request<{ booking: Booking; intentStatus: string }>(
      `/api/partner-holds/${holdId}/pay`,
      { method: 'POST', body: JSON.stringify(forceOutcome ? { forceOutcome } : {}) },
      token,
    ),

  getBooking: (token: string, bookingId: string) => request<{ booking: Booking }>(`/api/bookings/${bookingId}`, {}, token),

  becomePartner: (token: string) => request<{ user: UserProfile }>('/api/auth/become-partner', { method: 'POST' }, token),
  becomeDriver: (token: string) => request<{ user: UserProfile }>('/api/auth/become-driver', { method: 'POST' }, token),

  // --- Partner mode ---

  createPartnerTrip: (
    token: string,
    input: {
      corridorId?: string;
      originName: string;
      originLat: number;
      originLng: number;
      destinationName: string;
      destLat: number;
      destLng: number;
      departAt: string;
      seatsTotal: number;
      farePerSeatCedis: number;
      vehicleDescription: string;
      comfortAc?: boolean;
      comfortUsb?: boolean;
      comfortBoot?: boolean;
    },
  ) => request<{ trip: PartnerTrip }>('/api/partner-trips', { method: 'POST', body: JSON.stringify(input) }, token),

  getMyPartnerTrips: (token: string) =>
    request<{ trips: { trip: PartnerTrip; availableSeats: number }[] }>('/api/partner-trips/mine', {}, token),

  getPartnerTripManifest: (token: string, tripId: string) =>
    request<{ manifest: ManifestEntry[] }>(`/api/partner-trips/${tripId}/manifest`, {}, token),

  completePartnerTrip: (token: string, tripId: string) =>
    request<{ trip: PartnerTrip }>(`/api/partner-trips/${tripId}/complete`, { method: 'POST' }, token),

  getPartnerEarnings: (token: string) => request<Earnings>('/api/partner/earnings', {}, token),

  markNoShow: (token: string, bookingId: string) =>
    request<{ booking: Booking }>(`/api/bookings/${bookingId}/mark-no-show`, { method: 'POST' }, token),

  // --- Express driver app ---

  getDriverRuns: (token: string) => request<{ runs: DriverRun[] }>('/api/driver/runs', {}, token),

  getRunManifest: (runId: string) => request<{ manifest: ManifestEntry[] }>(`/api/runs/${runId}/manifest`),

  startRun: (token: string, runId: string) => request<{ run: Run }>(`/api/runs/${runId}/start`, { method: 'POST' }, token),

  arriveAtStop: (token: string, runId: string, stopId: string, clientTimestamp?: string) =>
    request(
      `/api/runs/${runId}/stops/${stopId}/arrive`,
      { method: 'POST', body: JSON.stringify(clientTimestamp ? { clientTimestamp } : {}) },
      token,
    ),

  getDwellStatus: (runId: string, stopId: string) => request<DwellStatus>(`/api/runs/${runId}/stops/${stopId}/dwell`),

  departStop: (token: string, runId: string, stopId: string, markNoShowForUnboarded: boolean) =>
    request<{ markedNoShow: number }>(
      `/api/runs/${runId}/stops/${stopId}/depart`,
      { method: 'POST', body: JSON.stringify({ markNoShowForUnboarded }) },
      token,
    ),

  reportIncident: (token: string, runId: string, category: IncidentCategory, note?: string) =>
    request(`/api/runs/${runId}/incidents`, { method: 'POST', body: JSON.stringify({ category, note }) }, token),

  completeRun: (token: string, runId: string) =>
    request<{ stopRecord: { stopName: string; scheduled: string | null; arrivedAt: string | null }[]; seatsCarried: number; noShows: number }>(
      `/api/runs/${runId}/complete`,
      { method: 'POST' },
      token,
    ),

  boardDriver: (token: string, bookingId: string, lat?: number, lng?: number) =>
    request<{ booking: Booking }>(
      `/api/bookings/${bookingId}/board/driver`,
      { method: 'POST', body: JSON.stringify({ lat, lng }) },
      token,
    ),

  denyBoarding: (token: string, bookingId: string, reason: string) =>
    request<{ booking: Booking }>(
      `/api/bookings/${bookingId}/deny-boarding`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      token,
    ),
};
