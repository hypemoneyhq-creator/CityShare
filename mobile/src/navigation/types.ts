export type TripSelection =
  | { kind: 'RUN'; runId: string; serviceType: 'DIRECT' | 'STOPS'; serviceCode: string; serviceName: string }
  | { kind: 'PARTNER'; tripId: string };

export interface RunSummary {
  stopRecord: { stopName: string; scheduled: string | null; arrivedAt: string | null }[];
  seatsCarried: number;
  noShows: number;
}

export type RootStackParamList = {
  Verification: undefined;
  Home: undefined;
  Results: { corridorId: string; corridorLabel: string; seats: number };
  TripDetail: { selection: TripSelection; seats: number };
  Payment: { kind: 'RUN' | 'PARTNER'; holdId: string; fareCedis: number; seats: number; summary: string };
  Ticket: { bookingId: string };

  // Partner mode
  PartnerHome: undefined;
  PartnerCreateTrip: undefined;
  PartnerPassengerList: { tripId: string };
  PartnerEarnings: undefined;

  // Express driver app
  DriverShift: undefined;
  DriverStop: { runId: string; stopIndex: number };
  DriverEnRoute: { runId: string; nextStopIndex: number };
  DriverRunComplete: { summary: RunSummary; serviceLabel: string };
};
