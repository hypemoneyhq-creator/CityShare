import { EscrowActorType, EscrowState, Run, RunStatus } from '@prisma/client';
import { prisma } from '../db';
import { markNoShow } from './booking';

export class DriverError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function assignDriver(runId: string, driverId: string) {
  const driver = await prisma.user.findUnique({ where: { id: driverId } });
  if (!driver?.isDriver) throw new DriverError('not_a_driver', 'User is not a driver');
  return prisma.run.update({ where: { id: runId }, data: { driverId, status: RunStatus.ASSIGNED } });
}

export async function getDriverRuns(driverId: string) {
  const runs = await prisma.run.findMany({
    where: { driverId },
    include: { service: { include: { corridor: true, stops: { orderBy: { sequence: 'asc' } } } } },
    orderBy: { date: 'asc' },
  });

  return Promise.all(
    runs.map(async (run) => {
      const seatsSold = await prisma.booking.count({
        where: { runHold: { runId: run.id }, escrow: { state: { in: [EscrowState.HELD, EscrowState.RELEASABLE] } } },
      });
      return { ...run, seatsSold };
    }),
  );
}

async function requireAssignedRun(runId: string, driverId: string): Promise<Run> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) throw new DriverError('not_found', 'Run not found');
  if (run.driverId !== driverId) throw new DriverError('not_assigned', 'You are not assigned to this run');
  return run;
}

export async function startRun(runId: string, driverId: string) {
  await requireAssignedRun(runId, driverId);
  return prisma.run.update({ where: { id: runId }, data: { status: RunStatus.IN_PROGRESS } });
}

export async function arriveAtStop(runId: string, driverId: string, stopId: string, clientTimestamp?: string) {
  await requireAssignedRun(runId, driverId);
  const arrivedAt = clientTimestamp ? new Date(clientTimestamp) : new Date();
  return prisma.runStopEvent.upsert({
    where: { runId_stopId: { runId, stopId } },
    create: { runId, stopId, arrivedAt },
    update: { arrivedAt },
  });
}

// Drives the dwell countdown (spec section 6: "maximum dwell is 3
// minutes... a cap, not a negotiation"). remainingSeconds is null until
// the driver has actually arrived — there's nothing to count down from.
export async function getStopStatus(runId: string, stopId: string) {
  const [stop, event] = await Promise.all([
    prisma.stopProfile.findUnique({ where: { id: stopId } }),
    prisma.runStopEvent.findUnique({ where: { runId_stopId: { runId, stopId } } }),
  ]);
  if (!stop) throw new DriverError('not_found', 'Stop not found');

  const arrivedAt = event?.arrivedAt ?? null;
  const remainingSeconds = arrivedAt
    ? Math.max(0, stop.maxDwellSeconds - Math.floor((Date.now() - arrivedAt.getTime()) / 1000))
    : null;

  return {
    stop,
    arrivedAt,
    departedAt: event?.departedAt ?? null,
    maxDwellSeconds: stop.maxDwellSeconds,
    remainingSeconds,
  };
}

// "Depart on schedule even if a passenger has not appeared — they are
// marked no-show" (driver app design notes). Scoped to bookings boarding
// at THIS stop specifically — a passenger boarding further down the
// service isn't affected by this stop's dwell running out.
export async function departStop(
  runId: string,
  driverId: string,
  stopId: string,
  opts: { markNoShowForUnboarded: boolean; clientTimestamp?: string },
) {
  await requireAssignedRun(runId, driverId);
  const departedAt = opts.clientTimestamp ? new Date(opts.clientTimestamp) : new Date();
  await prisma.runStopEvent.upsert({
    where: { runId_stopId: { runId, stopId } },
    create: { runId, stopId, departedAt },
    update: { departedAt },
  });

  let markedNoShow = 0;
  if (opts.markNoShowForUnboarded) {
    const bookings = await prisma.booking.findMany({
      where: { runHold: { runId, boardStopId: stopId }, riderBoardedAt: null, escrow: { state: EscrowState.HELD } },
    });
    for (const b of bookings) {
      await markNoShow(b.id, EscrowActorType.DRIVER, driverId);
      markedNoShow++;
    }
  }
  return { markedNoShow };
}

export async function reportIncident(
  runId: string,
  driverId: string,
  category: string,
  note: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
) {
  await requireAssignedRun(runId, driverId);
  return prisma.runIncident.create({ data: { runId, category, note, lat, lng } });
}

// The run-complete summary (stop-by-stop on-time record, seats carried,
// no-shows) is derived entirely from RunStopEvent and Booking/Escrow —
// nothing new to persist.
export async function completeRun(runId: string, driverId: string) {
  await requireAssignedRun(runId, driverId);
  await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.COMPLETED } });

  const [run, events, bookings] = await Promise.all([
    prisma.run.findUnique({
      where: { id: runId },
      include: { service: { include: { stops: { orderBy: { sequence: 'asc' } } } } },
    }),
    prisma.runStopEvent.findMany({ where: { runId } }),
    prisma.booking.findMany({ where: { runHold: { runId } }, include: { escrow: true } }),
  ]);

  const stopRecord = (run?.service.stops ?? []).map((stop) => {
    const event = events.find((e) => e.stopId === stop.id);
    return {
      stopName: stop.name,
      scheduled: stop.scheduledArrival ?? stop.scheduledDeparture,
      arrivedAt: event?.arrivedAt ?? null,
    };
  });

  const seatsCarried = bookings
    .filter((b) => b.escrow?.state === EscrowState.RELEASABLE || b.escrow?.state === EscrowState.SETTLED)
    .reduce((sum, b) => sum + b.seats, 0);
  const noShows = bookings.filter((b) => b.escrow?.state === EscrowState.FORFEIT).length;

  return { stopRecord, seatsCarried, noShows };
}
