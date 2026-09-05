export type TripSelection =
  | { kind: 'RUN'; runId: string; serviceType: 'DIRECT' | 'STOPS'; serviceCode: string; serviceName: string }
  | { kind: 'PARTNER'; tripId: string };

export type RootStackParamList = {
  Verification: undefined;
  Home: undefined;
  Results: { corridorId: string; corridorLabel: string; seats: number };
  TripDetail: { selection: TripSelection; seats: number };
  Payment: { kind: 'RUN' | 'PARTNER'; holdId: string; fareCedis: number; seats: number; summary: string };
  Ticket: { bookingId: string };
};
