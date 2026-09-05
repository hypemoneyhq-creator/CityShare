import { BookingKind, EscrowState, RunStatus } from '@prisma/client';
import { prisma } from '../db';

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// A run's real-time status line for the "vehicles now" feed (spec
// screens: "Express vehicles · now"). Derived entirely from RunStopEvent
// — arrived-but-not-departed means at that stop (boarding), departed
// means in transit toward the next one. There's no fleet/vehicle entity
// yet, so this describes the run, not a named vehicle.
function describeRunStatus(
  run: { status: RunStatus },
  stops: { id: string; name: string; sequence: number }[],
  events: { stopId: string; arrivedAt: Date | null; departedAt: Date | null }[],
): string {
  if (run.status === RunStatus.SCHEDULED) return 'SCHEDULED · NOT YET STARTED';
  if (run.status === RunStatus.ASSIGNED) return 'ASSIGNED · AWAITING DEPARTURE';
  if (run.status === RunStatus.CANCELLED) return 'CANCELLED';
  if (run.status === RunStatus.COMPLETED) return 'COMPLETED';

  const byStop = new Map(events.map((e) => [e.stopId, e]));
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const atStop = ordered.find((s) => byStop.get(s.id)?.arrivedAt && !byStop.get(s.id)?.departedAt);
  if (atStop) return `AT ${atStop.name.toUpperCase()} · BOARDING`;
  const lastDeparted = [...ordered].reverse().find((s) => byStop.get(s.id)?.departedAt);
  if (lastDeparted) {
    const next = ordered[ordered.indexOf(lastDeparted) + 1];
    return next ? `IN TRANSIT · NEXT ${next.name.toUpperCase()}` : 'IN TRANSIT';
  }
  return 'IN TRANSIT';
}

// "Live ops" (spec screens table). Every figure here is computed from
// today's real rows — nothing here is a fabricated network-wide number.
// What the design shows that this build genuinely has no data for
// (Express Operator identity/rating, a multi-corridor demand curve built
// from logged searches) is left out rather than invented — see
// getDisputeQueue below and the backend README for the full list.
export async function getLiveSummary() {
  const today = startOfToday();

  const [heldAgg, disputedAgg, releasedEntries, runs, partnerTrips, corridors] = await Promise.all([
    prisma.escrow.aggregate({ where: { state: EscrowState.HELD }, _sum: { amountCedis: true } }),
    prisma.escrow.aggregate({ where: { state: EscrowState.DISPUTED }, _sum: { amountCedis: true }, _count: true }),
    prisma.escrowLedgerEntry.findMany({
      where: { toState: { in: [EscrowState.RELEASABLE, EscrowState.SETTLED] }, createdAt: { gte: today } },
      include: { escrow: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.run.findMany({
      where: { date: { gte: today }, status: { not: RunStatus.CANCELLED } },
      include: { service: { include: { corridor: true, stops: true } }, stopEvents: true },
    }),
    prisma.partnerTrip.findMany({
      where: { departAt: { gte: today }, status: { not: RunStatus.CANCELLED } },
    }),
    prisma.corridor.findMany({ include: { services: { include: { stops: true } } } }),
  ]);

  // A booking's escrow can cross RELEASABLE then SETTLED the same day —
  // count its fare once, at its first release.
  const seenEscrowIds = new Set<string>();
  let releasedTodayCedis = 0;
  for (const entry of releasedEntries) {
    if (seenEscrowIds.has(entry.escrowId)) continue;
    seenEscrowIds.add(entry.escrowId);
    releasedTodayCedis += entry.escrow.amountCedis;
  }

  const runIds = runs.map((r) => r.id);
  const seatsSoldByRun = new Map<string, number>();
  if (runIds.length) {
    const bookings = await prisma.booking.findMany({
      where: {
        runHold: { runId: { in: runIds } },
        escrow: { state: { in: [EscrowState.HELD, EscrowState.RELEASABLE, EscrowState.SETTLED] } },
      },
      select: { seats: true, runHold: { select: { runId: true } } },
    });
    for (const b of bookings) {
      const runId = b.runHold!.runId;
      seatsSoldByRun.set(runId, (seatsSoldByRun.get(runId) ?? 0) + b.seats);
    }
  }

  const vehiclesNow = runs.map((run) => ({
    runId: run.id,
    serviceCode: run.service.code,
    serviceName: run.service.name,
    corridorName: run.service.corridor.name,
    status: run.status,
    statusLabel: describeRunStatus(run, run.service.stops, run.stopEvents),
    seatsSold: seatsSoldByRun.get(run.id) ?? 0,
    capacity: run.capacity,
  }));

  // On-time departure (spec metric, computed for real): among today's
  // recorded stop arrivals against a scheduled time, the share that
  // arrived at or before it.
  const timedEvents = runs.flatMap((run) =>
    run.stopEvents
      .filter((e) => e.arrivedAt)
      .map((e) => {
        const stop = run.service.stops.find((s) => s.id === e.stopId);
        const scheduled = stop?.scheduledArrival ?? stop?.scheduledDeparture;
        return scheduled ? { arrivedAt: e.arrivedAt!, scheduled } : null;
      })
      .filter((x): x is { arrivedAt: Date; scheduled: string } => x != null),
  );
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const onTimeCount = timedEvents.filter((e) => {
    const arrivedMinutes = e.arrivedAt.getUTCHours() * 60 + e.arrivedAt.getUTCMinutes();
    return arrivedMinutes <= toMinutes(e.scheduled);
  }).length;
  const onTimeDeparturePct = timedEvents.length ? Math.round((onTimeCount / timedEvents.length) * 100) : null;

  const activeRuns = runs.filter((r) => r.status !== RunStatus.SCHEDULED || seatsSoldByRun.has(r.id));
  const totalCapacity = runs.reduce((sum, r) => sum + r.capacity, 0);
  const totalSeatsSold = runs.reduce((sum, r) => sum + (seatsSoldByRun.get(r.id) ?? 0), 0);
  const seatUtilizationPct = totalCapacity ? Math.round((totalSeatsSold / totalCapacity) * 100) : null;

  // Corridor capacity (real): Express seats scheduled today vs Partner
  // seats listed today, per corridor. This is supply, not demand — there
  // is no search log to compute unfulfilled demand from (unlike the
  // design's "unfulfilled searches" figure), so that column is omitted
  // rather than invented.
  const corridorCapacity = corridors.map((c) => {
    const services = c.services.map((svc) => {
      const svcRuns = runs.filter((r) => r.serviceId === svc.id);
      const capacity = svcRuns.reduce((sum, r) => sum + r.capacity, 0);
      const seatsSold = svcRuns.reduce((sum, r) => sum + (seatsSoldByRun.get(r.id) ?? 0), 0);
      return {
        code: svc.code,
        name: svc.name,
        type: svc.type,
        runsToday: svcRuns.length,
        capacity,
        seatsSold,
        loadPct: capacity ? Math.round((seatsSold / capacity) * 100) : null,
      };
    });
    const partnerSeatsListed = partnerTrips
      .filter((t) => t.corridorId === c.id)
      .reduce((sum, t) => sum + t.seatsTotal, 0);
    return { corridorId: c.id, name: c.name, origin: c.origin, destination: c.destination, services, partnerSeatsListed };
  });

  return {
    escrowPosition: {
      heldCedis: heldAgg._sum.amountCedis ?? 0,
      releasedTodayCedis,
      disputedCedis: disputedAgg._sum.amountCedis ?? 0,
      openDisputes: disputedAgg._count,
    },
    onTimeDeparturePct,
    seatUtilizationPct,
    partnerTripsToday: partnerTrips.length,
    activeRunsToday: activeRuns.length,
    vehiclesNow,
    corridorCapacity,
  };
}

// "Escrow & disputes" queue (spec section 4: "the case ages into the ops
// queue... every case is decided on GPS, timestamps, driver confirmation,
// passenger confirmation and trip data"). Built from the same evidence
// the escrow ledger already records — nothing new to compute, just
// surfaced for a human.
export async function getDisputeQueue() {
  const bookings = await prisma.booking.findMany({
    where: { escrow: { state: EscrowState.DISPUTED } },
    include: {
      rider: { select: { firstName: true, lastName: true, phone: true } },
      escrow: { include: { ledger: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      runHold: { include: { run: { include: { service: { include: { corridor: true } } } } } },
      partnerHold: { include: { trip: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return bookings.map((b) => {
    const raisedEntry = b.escrow!.ledger[0];
    const evidence = (raisedEntry?.evidence as Record<string, unknown>) ?? {};
    const reason = typeof evidence.reason === 'string' ? evidence.reason : 'unknown';

    const gpsChip =
      reason === 'gps_unavailable_or_mismatch'
        ? evidence.driverBoardLat != null && evidence.riderBoardLat != null
          ? 'GPS MISMATCH'
          : 'GPS UNAVAILABLE'
        : null;

    const claimByReason: Record<string, string> = {
      gps_unavailable_or_mismatch: 'Both taps recorded, but GPS did not confirm the pickup point',
      unknown: 'Dispute reason not recorded',
    };
    const claim = claimByReason[reason] ?? `Rider or driver reported: ${reason}`;

    const tripLabel =
      b.kind === BookingKind.RUN && b.runHold
        ? `${b.runHold.run.service.code} · ${b.runHold.run.service.corridor.name}`
        : b.partnerHold
          ? `Partner · ${b.partnerHold.trip.originName} → ${b.partnerHold.trip.destinationName}`
          : 'Unknown trip';

    return {
      bookingId: b.id,
      riderName: [b.rider.firstName, b.rider.lastName].filter(Boolean).join(' ') || b.rider.phone,
      tripLabel,
      claim,
      raisedBy: raisedEntry?.actorType ?? null,
      ageMs: raisedEntry ? Date.now() - raisedEntry.createdAt.getTime() : null,
      heldCedis: b.escrow!.amountCedis,
      chips: [gpsChip, raisedEntry ? `RAISED BY ${raisedEntry.actorType}` : null].filter((c): c is string => c != null),
    };
  });
}

// "Corridors & stops" (spec screens table). Reuses the same corridor
// capacity numbers as getLiveSummary but with the full stop profile —
// the source of truth a driver's navigation and the rider app both read.
export async function getCorridorsOverview() {
  const today = startOfToday();
  const [corridors, runs] = await Promise.all([
    prisma.corridor.findMany({
      include: { services: { include: { stops: { orderBy: { sequence: 'asc' } } } } },
    }),
    prisma.run.findMany({ where: { date: { gte: today }, status: { not: RunStatus.CANCELLED } } }),
  ]);

  const runsByService = new Map<string, typeof runs>();
  for (const run of runs) {
    runsByService.set(run.serviceId, [...(runsByService.get(run.serviceId) ?? []), run]);
  }

  return corridors.map((c) => ({
    id: c.id,
    name: c.name,
    origin: c.origin,
    destination: c.destination,
    services: c.services.map((svc) => ({
      id: svc.id,
      code: svc.code,
      name: svc.name,
      type: svc.type,
      active: svc.active,
      runsToday: (runsByService.get(svc.id) ?? []).length,
      stops: svc.stops.map((s) => ({
        id: s.id,
        name: s.name,
        sequence: s.sequence,
        lat: s.lat,
        lng: s.lng,
        scheduledArrival: s.scheduledArrival,
        scheduledDeparture: s.scheduledDeparture,
        maxDwellSeconds: s.maxDwellSeconds,
        boardAllowed: s.boardAllowed,
        alightAllowed: s.alightAllowed,
      })),
    })),
  }));
}
