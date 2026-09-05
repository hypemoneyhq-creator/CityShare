import { HoldStatus, ServiceType } from '@prisma/client';
import { prisma } from '../db';

const HOLD_TTL_MS = 5 * 60 * 1000;

export class InventoryError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

interface StopLike {
  id: string;
  sequence: number;
  name: string;
  boardAllowed: boolean;
  alightAllowed: boolean;
  legFareCedis: number | null;
}

interface HoldLike {
  boardStopId: string;
  alightStopId: string;
  seats: number;
}

function sortedStops<T extends { sequence: number }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => a.sequence - b.sequence);
}

// Express Stops sells per leg (spec section 2): a seat on Kasoa->Mallam and
// a seat on Mallam->Circle are the same physical seat sold twice. A hold
// spanning stops [board, alight) occupies every leg in that range, so
// availability for any one leg is capacity minus the seats of every hold
// whose range covers it — this is what makes overlapping-but-not-identical
// bookings (e.g. Kasoa->Kaneshie and Mallam->Circle) correctly compete for
// the Mallam->Kaneshie leg while not blocking each other on the legs they
// don't share.
function computeLegAvailability(capacity: number, stops: StopLike[], holds: HoldLike[]): number[] {
  const legCount = stops.length - 1;
  const availability = new Array(legCount).fill(capacity);
  const seqById = new Map(stops.map((s) => [s.id, s.sequence]));

  for (const hold of holds) {
    const boardSeq = seqById.get(hold.boardStopId);
    const alightSeq = seqById.get(hold.alightStopId);
    if (boardSeq === undefined || alightSeq === undefined) continue;
    for (let leg = boardSeq; leg < alightSeq; leg++) {
      availability[leg] -= hold.seats;
    }
  }
  return availability;
}

function segmentAvailability(legAvailability: number[], boardSeq: number, alightSeq: number): number {
  let min = Infinity;
  for (let leg = boardSeq; leg < alightSeq; leg++) min = Math.min(min, legAvailability[leg]);
  return min;
}

export function computeRunFare(
  service: { type: ServiceType; flatFareCedis: number | null },
  stops: StopLike[],
  boardStopId: string,
  alightStopId: string,
): number {
  const boardSeq = stops.find((s) => s.id === boardStopId)?.sequence;
  const alightSeq = stops.find((s) => s.id === alightStopId)?.sequence;
  if (boardSeq === undefined || alightSeq === undefined) {
    throw new InventoryError('invalid_segment', 'Invalid board/alight stop pair');
  }

  if (service.type === ServiceType.DIRECT) {
    if (service.flatFareCedis == null) throw new InventoryError('no_fare', 'Service has no flat fare configured');
    return service.flatFareCedis;
  }

  let total = 0;
  for (const stop of stops) {
    if (stop.sequence > boardSeq && stop.sequence <= alightSeq) {
      if (stop.legFareCedis == null) {
        throw new InventoryError('no_fare', `Missing leg fare at stop "${stop.name}"`);
      }
      total += stop.legFareCedis;
    }
  }
  return total;
}

async function reapExpiredHolds() {
  const now = new Date();
  await prisma.seatHold.updateMany({
    where: { status: HoldStatus.PENDING, expiresAt: { lt: now } },
    data: { status: HoldStatus.EXPIRED },
  });
  await prisma.partnerSeatHold.updateMany({
    where: { status: HoldStatus.PENDING, expiresAt: { lt: now } },
    data: { status: HoldStatus.EXPIRED },
  });
}

export async function getRunSegments(runId: string) {
  await reapExpiredHolds();

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { service: { include: { stops: true } } },
  });
  if (!run) throw new InventoryError('not_found', 'Run not found');

  const stops = sortedStops(run.service.stops);
  const holds = await prisma.seatHold.findMany({
    where: { runId, status: { in: [HoldStatus.PENDING, HoldStatus.CONFIRMED] } },
  });
  const legAvailability = computeLegAvailability(run.capacity, stops, holds);

  return { run, stops, legAvailability };
}

export async function getSegmentAvailability(
  runId: string,
  boardStopId: string,
  alightStopId: string,
): Promise<number> {
  const { stops, legAvailability } = await getRunSegments(runId);
  const boardSeq = stops.find((s) => s.id === boardStopId)?.sequence;
  const alightSeq = stops.find((s) => s.id === alightStopId)?.sequence;
  if (boardSeq === undefined || alightSeq === undefined || boardSeq >= alightSeq) {
    throw new InventoryError('invalid_segment', 'Invalid board/alight stop pair');
  }
  return segmentAvailability(legAvailability, boardSeq, alightSeq);
}

// Runs inside a transaction: reap, re-check availability and create the
// hold atomically so two riders racing for the last seat on a leg can't
// both succeed. Prisma's default (read-committed) isolation means this
// still has a narrow race window under real concurrency — a follow-up
// hardening pass should move the availability check to a `SELECT ... FOR
// UPDATE` or serializable transaction before this handles real traffic.
export async function createRunHold(params: {
  runId: string;
  boardStopId: string;
  alightStopId: string;
  seats: number;
  riderId: string;
}) {
  const { runId, boardStopId, alightStopId, seats, riderId } = params;
  if (seats < 1) throw new InventoryError('invalid_seats', 'Seats must be at least 1');

  return prisma.$transaction(async (tx) => {
    await tx.seatHold.updateMany({
      where: { runId, status: HoldStatus.PENDING, expiresAt: { lt: new Date() } },
      data: { status: HoldStatus.EXPIRED },
    });

    const run = await tx.run.findUnique({
      where: { id: runId },
      include: { service: { include: { stops: true } } },
    });
    if (!run) throw new InventoryError('not_found', 'Run not found');

    const stops = sortedStops(run.service.stops);
    const boardStop = stops.find((s) => s.id === boardStopId);
    const alightStop = stops.find((s) => s.id === alightStopId);
    if (!boardStop || !alightStop || boardStop.sequence >= alightStop.sequence) {
      throw new InventoryError('invalid_segment', 'Invalid board/alight stop pair');
    }
    if (!boardStop.boardAllowed) throw new InventoryError('board_not_allowed', `${boardStop.name} is alight-only`);
    if (!alightStop.alightAllowed) throw new InventoryError('alight_not_allowed', `${alightStop.name} is board-only`);

    const holds = await tx.seatHold.findMany({
      where: { runId, status: { in: [HoldStatus.PENDING, HoldStatus.CONFIRMED] } },
    });
    const legAvailability = computeLegAvailability(run.capacity, stops, holds);
    if (segmentAvailability(legAvailability, boardStop.sequence, alightStop.sequence) < seats) {
      throw new InventoryError('full', 'Not enough seats on this segment');
    }

    const fareCedis = computeRunFare(run.service, stops, boardStopId, alightStopId) * seats;

    const hold = await tx.seatHold.create({
      data: { runId, boardStopId, alightStopId, seats, riderId, expiresAt: new Date(Date.now() + HOLD_TTL_MS) },
    });

    return { hold, fareCedis };
  });
}

export async function releaseRunHold(holdId: string, riderId: string) {
  const hold = await prisma.seatHold.findUnique({ where: { id: holdId } });
  if (!hold || hold.riderId !== riderId) throw new InventoryError('not_found', 'Hold not found');
  if (hold.status !== HoldStatus.PENDING) throw new InventoryError('invalid_state', 'Hold is not pending');
  return prisma.seatHold.update({ where: { id: holdId }, data: { status: HoldStatus.RELEASED } });
}

// --- Partner trips: single leg, no per-segment inventory needed. ---------

export async function getPartnerTripAvailability(tripId: string): Promise<number> {
  await reapExpiredHolds();
  const trip = await prisma.partnerTrip.findUnique({ where: { id: tripId } });
  if (!trip) throw new InventoryError('not_found', 'Trip not found');
  const holds = await prisma.partnerSeatHold.findMany({
    where: { tripId, status: { in: [HoldStatus.PENDING, HoldStatus.CONFIRMED] } },
  });
  const held = holds.reduce((sum, h) => sum + h.seats, 0);
  return trip.seatsTotal - held;
}

export async function createPartnerHold(params: { tripId: string; seats: number; riderId: string }) {
  const { tripId, seats, riderId } = params;
  if (seats < 1) throw new InventoryError('invalid_seats', 'Seats must be at least 1');

  return prisma.$transaction(async (tx) => {
    await tx.partnerSeatHold.updateMany({
      where: { tripId, status: HoldStatus.PENDING, expiresAt: { lt: new Date() } },
      data: { status: HoldStatus.EXPIRED },
    });

    const trip = await tx.partnerTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new InventoryError('not_found', 'Trip not found');

    const holds = await tx.partnerSeatHold.findMany({
      where: { tripId, status: { in: [HoldStatus.PENDING, HoldStatus.CONFIRMED] } },
    });
    const held = holds.reduce((sum, h) => sum + h.seats, 0);
    if (trip.seatsTotal - held < seats) throw new InventoryError('full', 'Not enough seats on this trip');

    const hold = await tx.partnerSeatHold.create({
      data: { tripId, seats, riderId, expiresAt: new Date(Date.now() + HOLD_TTL_MS) },
    });

    return { hold, fareCedis: trip.farePerSeatCedis * seats };
  });
}

export async function releasePartnerHold(holdId: string, riderId: string) {
  const hold = await prisma.partnerSeatHold.findUnique({ where: { id: holdId } });
  if (!hold || hold.riderId !== riderId) throw new InventoryError('not_found', 'Hold not found');
  if (hold.status !== HoldStatus.PENDING) throw new InventoryError('invalid_state', 'Hold is not pending');
  return prisma.partnerSeatHold.update({ where: { id: holdId }, data: { status: HoldStatus.RELEASED } });
}
