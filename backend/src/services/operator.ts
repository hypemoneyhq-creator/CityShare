import { OperatorDocKey, OperatorStatus, RunStatus } from '@prisma/client';
import { prisma } from '../db';
import { describeRunStatus, startOfToday } from './ops';
import * as paymentProvider from './paymentProvider';

export class OperatorError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const DOC_KEYS = Object.values(OperatorDocKey);

async function requireOperator(userId: string) {
  const operator = await prisma.operator.findUnique({ where: { contactUserId: userId } });
  if (!operator) throw new OperatorError('not_found', 'No Operator application for this account');
  return operator;
}

// One Operator per contact user (same single-owner pattern as
// PartnerTrip.partnerId) — create on first call, update fields on every
// call after. There's no stricter "locked once submitted" rule: the
// spec's certification process (documents, fleet, corridors) already
// gates what actually goes live, so relaxing company-detail edits here
// doesn't bypass anything real.
export async function upsertApplication(
  userId: string,
  fields: { registeredName: string; rgdNumber?: string; operatingSince?: number; contactName?: string },
) {
  return prisma.operator.upsert({
    where: { contactUserId: userId },
    update: fields,
    create: { ...fields, contactUserId: userId },
  });
}

export async function getMine(userId: string) {
  const operator = await prisma.operator.findUnique({
    where: { contactUserId: userId },
    include: {
      vehicles: true,
      corridorInterests: { include: { corridor: true } },
      documents: true,
      drivers: { select: { id: true, firstName: true, lastName: true, phone: true, ghanaCardVerifiedAt: true } },
    },
  });
  if (!operator) return null;
  return { ...operator, readiness: await computeReadiness(operator.id) };
}

async function computeReadiness(operatorId: string) {
  const [vehicleCount, corridorCount, docs] = await Promise.all([
    prisma.operatorVehicle.count({ where: { operatorId } }),
    prisma.operatorCorridorInterest.count({ where: { operatorId } }),
    prisma.operatorDocument.findMany({ where: { operatorId } }),
  ]);
  const uploadedKeys = new Set(docs.filter((d) => d.uploadedAt).map((d) => d.key));
  const docsComplete = DOC_KEYS.every((k) => uploadedKeys.has(k));
  return {
    hasVehicle: vehicleCount > 0,
    hasCorridor: corridorCount > 0,
    docsComplete,
    docsUploaded: uploadedKeys.size,
    docsTotal: DOC_KEYS.length,
    ready: vehicleCount > 0 && corridorCount > 0 && docsComplete,
  };
}

export async function addVehicle(
  userId: string,
  fields: { label: string; vehicleType: string; spec: string; seats: number },
) {
  const operator = await requireOperator(userId);
  if (fields.seats < 1) throw new OperatorError('invalid_seats', 'Seats must be at least 1');
  return prisma.operatorVehicle.create({ data: { ...fields, operatorId: operator.id } });
}

export async function removeVehicle(userId: string, vehicleId: string) {
  const operator = await requireOperator(userId);
  const vehicle = await prisma.operatorVehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.operatorId !== operator.id) throw new OperatorError('not_found', 'Vehicle not found');
  await prisma.operatorVehicle.delete({ where: { id: vehicleId } });
}

export async function setCorridorInterest(userId: string, corridorId: string, on: boolean) {
  const operator = await requireOperator(userId);
  const corridor = await prisma.corridor.findUnique({ where: { id: corridorId } });
  if (!corridor) throw new OperatorError('not_found', 'Corridor not found');
  if (on) {
    await prisma.operatorCorridorInterest.upsert({
      where: { operatorId_corridorId: { operatorId: operator.id, corridorId } },
      update: {},
      create: { operatorId: operator.id, corridorId },
    });
  } else {
    await prisma.operatorCorridorInterest
      .delete({ where: { operatorId_corridorId: { operatorId: operator.id, corridorId } } })
      .catch(() => undefined);
  }
}

// Mock upload, same instant-mock pattern as identity verification since
// step 1 — toggled rather than one-way, mirroring the design's
// Upload/Uploaded button (useful to correct a mistaken upload, since
// there's no real file to replace).
export async function toggleDocument(userId: string, key: OperatorDocKey) {
  const operator = await requireOperator(userId);
  const existing = await prisma.operatorDocument.findUnique({
    where: { operatorId_key: { operatorId: operator.id, key } },
  });
  const uploaded = Boolean(existing?.uploadedAt);
  return prisma.operatorDocument.upsert({
    where: { operatorId_key: { operatorId: operator.id, key } },
    update: { uploadedAt: uploaded ? null : new Date() },
    create: { operatorId: operator.id, key, uploadedAt: new Date() },
  });
}

export async function submitApplication(userId: string) {
  const operator = await requireOperator(userId);
  if (operator.status !== OperatorStatus.APPLICATION) return operator; // idempotent — already submitted
  const readiness = await computeReadiness(operator.id);
  if (!readiness.ready) throw new OperatorError('not_ready', 'Complete fleet, corridors and documents first');
  return prisma.operator.update({
    where: { id: operator.id },
    data: { status: OperatorStatus.CERTIFYING, submittedAt: new Date() },
  });
}

// The CityShare Safety Standard's certification checks (spec section 9),
// computed from real signals rather than a hand-run ops review queue
// (this build has no ops-side "review this application" UI — step 9's
// dashboard doesn't cover it). Company registration / transport licence /
// insurance / the Safety Standard agreement clear the moment their
// document is uploaded; driver vetting is the real ratio of this
// operator's roster who have completed CityShare's existing identity
// verification (Ghana Card + selfie, from step 1) — there's no separate
// driver-specific vetting step in this build, so identity verification
// stands in for it. The design's "fleet inspection" and "scheduling
// walkthrough" checks are dropped rather than faked: neither has a real
// signal in this codebase (no inspection workflow, no scheduling system).
export async function getCertification(userId: string) {
  const operator = await requireOperator(userId);
  const [docs, drivers] = await Promise.all([
    prisma.operatorDocument.findMany({ where: { operatorId: operator.id } }),
    prisma.user.findMany({ where: { operatorId: operator.id }, select: { ghanaCardVerifiedAt: true, selfieVerifiedAt: true } }),
  ]);
  const uploadedAt = new Map(docs.map((d) => [d.key, d.uploadedAt]));

  const docCheck = (key: OperatorDocKey, name: string, detail: string) => {
    const at = uploadedAt.get(key);
    return { key, name, detail, status: at ? ('CLEARED' as const) : ('WAITING' as const), clearedAt: at ?? null };
  };

  const driversVetted = drivers.filter((d) => d.ghanaCardVerifiedAt && d.selfieVerifiedAt).length;
  const driverVettingStatus =
    drivers.length === 0 ? 'WAITING' : driversVetted === drivers.length ? 'CLEARED' : 'IN_PROGRESS';

  const checks = [
    docCheck(OperatorDocKey.RGD_CERTIFICATE, 'Company registration', 'Certificate of incorporation on file'),
    docCheck(OperatorDocKey.TRANSPORT_LICENCE, 'Commercial transport licence', 'Passenger service licence on file'),
    docCheck(OperatorDocKey.INSURANCE_ENDORSEMENT, 'Insurance · fare-paying passengers', 'Endorsement document on file'),
    {
      key: 'DRIVER_VETTING' as const,
      name: 'Driver vetting',
      detail: `${driversVetted} of ${drivers.length} roster driver${drivers.length === 1 ? '' : 's'} identity-verified`,
      status: driverVettingStatus as 'CLEARED' | 'WAITING' | 'IN_PROGRESS',
      clearedAt: null,
    },
    docCheck(OperatorDocKey.SAFETY_STANDARD_AGREEMENT, 'CityShare Safety Standard agreement', 'Agreement accepted'),
  ];

  const allCleared = checks.every((c) => c.status === 'CLEARED');
  let status = operator.status;
  // Lazy resolution, same pattern as every time-based transition elsewhere
  // in this codebase: whoever next asks about certification is what
  // advances it — there's no background job and no human "approve"
  // action for these specific checks.
  if (status === OperatorStatus.CERTIFYING && allCleared) {
    await prisma.operator.update({ where: { id: operator.id }, data: { status: OperatorStatus.CERTIFIED } });
    status = OperatorStatus.CERTIFIED;
  }

  return { operator: { ...operator, status }, checks };
}

export async function addDriver(userId: string, phone: string) {
  const operator = await requireOperator(userId);
  const recipient = await prisma.user.findUnique({ where: { phone } });
  if (!recipient) throw new OperatorError('recipient_not_found', 'No CityShare user with that phone number');
  if (recipient.operatorId && recipient.operatorId !== operator.id) {
    throw new OperatorError('already_rostered', 'That driver already belongs to another Operator');
  }
  return prisma.user.update({ where: { id: recipient.id }, data: { isDriver: true, operatorId: operator.id } });
}

export async function removeDriver(userId: string, driverId: string) {
  const operator = await requireOperator(userId);
  const driver = await prisma.user.findUnique({ where: { id: driverId } });
  if (!driver || driver.operatorId !== operator.id) throw new OperatorError('not_found', 'Driver not found on your roster');
  return prisma.user.update({ where: { id: driverId }, data: { operatorId: null } });
}

// The Operator console (spec section 9 screens: "Operator console").
// Certification gates this the same way the design implies ("nothing
// goes live until you approve") — an uncertified Operator has no runs to
// manage yet.
export async function getConsole(userId: string) {
  const operator = await requireOperator(userId);
  if (operator.status !== OperatorStatus.CERTIFIED) {
    throw new OperatorError('not_certified', 'Certification must complete before the console is available');
  }

  const today = startOfToday();
  const [vehicles, corridorInterests] = await Promise.all([
    prisma.operatorVehicle.findMany({ where: { operatorId: operator.id } }),
    prisma.operatorCorridorInterest.findMany({ where: { operatorId: operator.id } }),
  ]);
  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const corridorIds = corridorInterests.map((c) => c.corridorId);

  const runs = await prisma.run.findMany({
    where: {
      date: { gte: today },
      status: { not: RunStatus.CANCELLED },
      service: { corridorId: { in: corridorIds } },
    },
    include: {
      service: { include: { corridor: true, stops: true } },
      driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
      vehicle: true,
      stopEvents: true,
    },
    orderBy: { date: 'asc' },
  });

  const runIds = runs.map((r) => r.id);
  const seatsSoldByRun = new Map<string, number>();
  if (runIds.length) {
    const bookings = await prisma.booking.findMany({
      where: {
        runHold: { runId: { in: runIds } },
        escrow: { state: { in: ['HELD', 'RELEASABLE', 'SETTLED'] } },
      },
      select: { seats: true, runHold: { select: { runId: true } } },
    });
    for (const b of bookings) {
      const runId = b.runHold!.runId;
      seatsSoldByRun.set(runId, (seatsSoldByRun.get(runId) ?? 0) + b.seats);
    }
  }

  const consoleRuns = runs
    .filter((r) => (r.vehicleId && vehicleIds.has(r.vehicleId)) || !r.vehicleId)
    .map((r) => ({
      runId: r.id,
      serviceCode: r.service.code,
      serviceName: r.service.name,
      stops: r.service.stops.map((s) => s.name),
      scheduledDeparture: r.service.stops[0]?.scheduledDeparture ?? null,
      statusLabel: describeRunStatus(r, r.service.stops, r.stopEvents),
      vehicle: r.vehicle ? { id: r.vehicle.id, label: r.vehicle.label } : null,
      driver: r.driver
        ? { id: r.driver.id, name: [r.driver.firstName, r.driver.lastName].filter(Boolean).join(' ') || r.driver.phone }
        : null,
      seatsSold: seatsSoldByRun.get(r.id) ?? 0,
      capacity: r.capacity,
      isYours: Boolean(r.vehicleId && vehicleIds.has(r.vehicleId)),
    }))
    .sort((a, b) => (a.scheduledDeparture ?? '').localeCompare(b.scheduledDeparture ?? ''));

  const yourRuns = consoleRuns.filter((r) => r.isYours);
  const soldTotal = yourRuns.reduce((sum, r) => sum + r.seatsSold, 0);
  const releasedTotal = yourRuns.reduce((sum, r) => sum + r.capacity, 0);

  const timedEvents = runs
    .filter((r) => r.vehicleId && vehicleIds.has(r.vehicleId))
    .flatMap((r) =>
      r.stopEvents
        .filter((e) => e.arrivedAt)
        .map((e) => {
          const stop = r.service.stops.find((s) => s.id === e.stopId);
          const scheduled = stop?.scheduledArrival ?? stop?.scheduledDeparture;
          return scheduled ? { arrivedAt: e.arrivedAt!, scheduled } : null;
        })
        .filter((x): x is { arrivedAt: Date; scheduled: string } => x != null),
    );
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const onTimeCount = timedEvents.filter(
    (e) => e.arrivedAt.getUTCHours() * 60 + e.arrivedAt.getUTCMinutes() <= toMinutes(e.scheduled),
  ).length;
  const onTimeDeparturePct = timedEvents.length ? Math.round((onTimeCount / timedEvents.length) * 100) : null;

  const unresolvedPayouts = await prisma.payout.findMany({ where: { payeeId: operator.id, status: 'PENDING' } });
  await Promise.all(unresolvedPayouts.map((p) => paymentProvider.getPayoutStatus(p.id)));
  const [approvedPayouts, pendingPayouts] = await Promise.all([
    prisma.payout.aggregate({ where: { payeeId: operator.id, status: 'APPROVED' }, _sum: { amountCedis: true } }),
    prisma.payout.aggregate({ where: { payeeId: operator.id, status: 'PENDING' }, _sum: { amountCedis: true } }),
  ]);

  return {
    vehicles,
    runs: consoleRuns,
    soldTotal,
    releasedTotal,
    loadPct: releasedTotal ? Math.round((soldTotal / releasedTotal) * 100) : null,
    onTimeDeparturePct,
    availablePayoutCedis: approvedPayouts._sum.amountCedis ?? 0,
    pendingPayoutCedis: pendingPayouts._sum.amountCedis ?? 0,
  };
}

// Assigning a vehicle (and optionally a driver from this Operator's own
// roster) to a run — the console's "Assign vehicle" / "Reassign" action.
// Scoped to runs in a corridor this Operator has actually expressed
// interest in, and to vehicles/drivers that are actually theirs: there's
// no corridor-allocation arbiter in this build (no multi-operator
// competition is modeled — see backend README), so this is the real
// boundary standing in for one.
export async function assignRunVehicle(userId: string, runId: string, vehicleId: string, driverId?: string) {
  const operator = await requireOperator(userId);
  if (operator.status !== OperatorStatus.CERTIFIED) {
    throw new OperatorError('not_certified', 'Certification must complete before assigning runs');
  }

  const [vehicle, run] = await Promise.all([
    prisma.operatorVehicle.findUnique({ where: { id: vehicleId } }),
    prisma.run.findUnique({ where: { id: runId }, include: { service: true } }),
  ]);
  if (!vehicle || vehicle.operatorId !== operator.id) throw new OperatorError('not_found', 'Vehicle not found');
  if (!run) throw new OperatorError('not_found', 'Run not found');

  const interested = await prisma.operatorCorridorInterest.findUnique({
    where: { operatorId_corridorId: { operatorId: operator.id, corridorId: run.service.corridorId } },
  });
  if (!interested) throw new OperatorError('not_your_corridor', 'You have not requested this corridor');

  if (driverId) {
    const driver = await prisma.user.findUnique({ where: { id: driverId } });
    if (!driver || driver.operatorId !== operator.id || !driver.isDriver) {
      throw new OperatorError('invalid_driver', 'That driver is not on your roster');
    }
  }

  return prisma.run.update({
    where: { id: runId },
    data: {
      vehicleId,
      driverId: driverId ?? undefined,
      status: run.status === RunStatus.SCHEDULED ? RunStatus.ASSIGNED : run.status,
    },
  });
}
