import { BookingKind, EscrowActorType, EscrowState, HoldStatus, PaymentOutcome } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../db';
import { createEscrowForBooking, EscrowError, transitionEscrow } from './escrow';
import { distanceMeters, PICKUP_GPS_TOLERANCE_METERS } from './geo';
import * as paymentProvider from './paymentProvider';

export class BookingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function generateBoardingCode(): string {
  return crypto.randomInt(0, 10000).toString().padStart(4, '0');
}

// Rider taps pay on a still-PENDING hold (spec: "seats held 5 minutes from
// payment initiation" — hold creation IS payment initiation in this flow,
// see backend README). Creates the Booking + Escrow(PENDING) and kicks off
// the mock MoMo prompt; the hold itself keeps the seat reserved until the
// payment resolves one way or the other.
export async function initiateBookingPayment(params: {
  kind: BookingKind;
  holdId: string;
  riderId: string;
  forceOutcome?: PaymentOutcome;
}) {
  const hold =
    params.kind === BookingKind.RUN
      ? await prisma.seatHold.findUnique({ where: { id: params.holdId } })
      : await prisma.partnerSeatHold.findUnique({ where: { id: params.holdId } });

  if (!hold || hold.riderId !== params.riderId) throw new BookingError('not_found', 'Hold not found');
  if (hold.status !== HoldStatus.PENDING) throw new BookingError('invalid_state', 'Hold is not pending');
  if (hold.expiresAt < new Date()) throw new BookingError('expired', 'Hold has expired');

  // Idempotency key = hold id, so a retried "pay" tap on the same hold
  // (e.g. a flaky network) never double-charges (README payment rules).
  const intent = await paymentProvider.initiateCollection({
    riderId: params.riderId,
    amountCedis: hold.fareCedis,
    reference: hold.id,
    idempotencyKey: hold.id,
    forceOutcome: params.forceOutcome,
  });

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        kind: params.kind,
        riderId: params.riderId,
        seats: hold.seats,
        fareCedis: hold.fareCedis,
        paymentIntentId: intent.intentId,
        ...(params.kind === BookingKind.RUN ? { runHoldId: hold.id } : { partnerHoldId: hold.id }),
      },
    });
    await createEscrowForBooking({ bookingId: created.id, amountCedis: hold.fareCedis, tx });
    return created;
  });

  return { booking, intentStatus: intent.status };
}

async function loadBookingOrThrow(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      escrow: true,
      paymentIntent: true,
      runHold: true,
      partnerHold: { include: { trip: { include: { partner: { select: { firstName: true, lastName: true } } } } } },
    },
  });
  if (!booking || !booking.escrow) throw new BookingError('not_found', 'Booking not found');
  return booking;
}

// Lazily advances the booking's escrow the same way inventory holds and
// the payment provider itself resolve: whoever asks next does the work.
// PENDING -> HELD/VOID once the mock MoMo prompt resolves; REFUNDING ->
// REFUNDED once the mock refund resolves.
export async function refreshBookingStatus(bookingId: string) {
  const booking = await loadBookingOrThrow(bookingId);
  const escrow = booking.escrow!;

  if (escrow.state === EscrowState.PENDING) {
    const status = await paymentProvider.getCollectionStatus(booking.paymentIntentId);
    if (status === PaymentOutcome.APPROVED) {
      const boardingCode = generateBoardingCode();
      await prisma.$transaction(async (tx) => {
        if (booking.kind === BookingKind.RUN) {
          await tx.seatHold.update({ where: { id: booking.runHoldId! }, data: { status: HoldStatus.CONFIRMED } });
        } else {
          await tx.partnerSeatHold.update({
            where: { id: booking.partnerHoldId! },
            data: { status: HoldStatus.CONFIRMED },
          });
        }
        await tx.booking.update({ where: { id: booking.id }, data: { boardingCode } });
        await transitionEscrow({
          escrowId: escrow.id,
          toState: EscrowState.HELD,
          actorType: EscrowActorType.SYSTEM,
          evidence: { paymentIntentId: booking.paymentIntentId },
          tx,
        });
      });
    } else if (status === PaymentOutcome.DECLINED || status === PaymentOutcome.TIMEOUT) {
      // "Nothing was charged" — release the seat back to inventory.
      await prisma.$transaction(async (tx) => {
        if (booking.kind === BookingKind.RUN) {
          await tx.seatHold.update({ where: { id: booking.runHoldId! }, data: { status: HoldStatus.RELEASED } });
        } else {
          await tx.partnerSeatHold.update({
            where: { id: booking.partnerHoldId! },
            data: { status: HoldStatus.RELEASED },
          });
        }
        await transitionEscrow({
          escrowId: escrow.id,
          toState: EscrowState.VOID,
          actorType: EscrowActorType.SYSTEM,
          evidence: { paymentIntentId: booking.paymentIntentId, reason: status },
          tx,
        });
      });
    }
  } else if (escrow.state === EscrowState.REFUNDING) {
    const latestRefund = await prisma.refund.findFirst({
      where: { intentId: booking.paymentIntentId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestRefund) {
      const status = await paymentProvider.getRefundStatus(latestRefund.id);
      if (status === PaymentOutcome.APPROVED) {
        await transitionEscrow({
          escrowId: escrow.id,
          toState: EscrowState.REFUNDED,
          actorType: EscrowActorType.SYSTEM,
          evidence: { refundId: latestRefund.id },
        });
      }
    }
  }

  return loadBookingOrThrow(bookingId);
}

// The pickup point's stored coordinates (spec section 4: "geolocation is
// sampled against the stop's stored coordinates"). A Run booking boards
// at a StopProfile; a Partner booking boards at the trip's own origin.
async function getPickupCoords(
  booking: Awaited<ReturnType<typeof loadBookingOrThrow>>,
): Promise<{ lat: number; lng: number } | null> {
  if (booking.kind === BookingKind.RUN && booking.runHold) {
    const stop = await prisma.stopProfile.findUnique({ where: { id: booking.runHold.boardStopId } });
    return stop ? { lat: stop.lat, lng: stop.lng } : null;
  }
  if (booking.kind === BookingKind.PARTNER && booking.partnerHold) {
    return { lat: booking.partnerHold.trip.originLat, lng: booking.partnerHold.trip.originLng };
  }
  return null;
}

// Boarding is two-sided (spec section 4): neither tap alone releases
// money. `clientTimestamp` supports the offline tap queue — a driver tap
// made with no network carries the time it actually happened, and that
// is what gets recorded here, never the time it happens to sync (spec
// section 11).
export async function tapBoarded(
  bookingId: string,
  side: 'driver' | 'rider',
  evidence: { lat?: number; lng?: number; clientTimestamp?: string },
) {
  const booking = await loadBookingOrThrow(bookingId);
  if (booking.escrow!.state !== EscrowState.HELD) {
    throw new BookingError('invalid_state', 'Boarding taps only apply to a HELD escrow');
  }

  const tappedAt = evidence.clientTimestamp ? new Date(evidence.clientTimestamp) : new Date();
  const lat = evidence.lat ?? null;
  const lng = evidence.lng ?? null;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data:
      side === 'driver'
        ? { driverBoardedAt: tappedAt, driverBoardLat: lat, driverBoardLng: lng }
        : { riderBoardedAt: tappedAt, riderBoardLat: lat, riderBoardLng: lng },
  });

  if (updated.driverBoardedAt && updated.riderBoardedAt) {
    const pickup = await getPickupCoords(booking);

    const withinRange = (tapLat: number | null, tapLng: number | null) =>
      pickup != null &&
      tapLat != null &&
      tapLng != null &&
      distanceMeters(tapLat, tapLng, pickup.lat, pickup.lng) <= PICKUP_GPS_TOLERANCE_METERS;

    const gpsConsistent = withinRange(updated.driverBoardLat, updated.driverBoardLng) && withinRange(updated.riderBoardLat, updated.riderBoardLng);

    if (gpsConsistent) {
      await transitionEscrow({
        escrowId: booking.escrow!.id,
        toState: EscrowState.RELEASABLE,
        actorType: EscrowActorType.SYSTEM,
        evidence: { driverBoardedAt: updated.driverBoardedAt, riderBoardedAt: updated.riderBoardedAt, gps: 'consistent' },
      });
    } else {
      // GPS missing or inconsistent with the pickup point — spec section
      // 4: route to manual review, and this must not default to either
      // party, so it lands as a system-raised dispute for ops, not an
      // automatic release or an automatic denial.
      await transitionEscrow({
        escrowId: booking.escrow!.id,
        toState: EscrowState.DISPUTED,
        actorType: EscrowActorType.SYSTEM,
        evidence: {
          reason: 'gps_unavailable_or_mismatch',
          pickup,
          driverBoardLat: updated.driverBoardLat,
          driverBoardLng: updated.driverBoardLng,
          riderBoardLat: updated.riderBoardLat,
          riderBoardLng: updated.riderBoardLng,
        },
      });
    }
  }

  return loadBookingOrThrow(bookingId);
}

// Driver-side symmetric case to openDispute below — spec section 4's
// "rider taps and driver denies." Also HELD-only, and also lands as a
// DISPUTED case for ops rather than resolving itself.
export async function denyBoarding(bookingId: string, reason: string) {
  const booking = await loadBookingOrThrow(bookingId);
  if (booking.escrow!.state !== EscrowState.HELD) {
    throw new BookingError('invalid_state', 'Can only deny boarding while HELD');
  }
  await transitionEscrow({
    escrowId: booking.escrow!.id,
    toState: EscrowState.DISPUTED,
    actorType: EscrowActorType.DRIVER,
    evidence: { reason },
  });
  return loadBookingOrThrow(bookingId);
}

// The rider's location trail for the trip window (spec section 4: "the
// decisive evidence is the rider's location trail against the vehicle's
// route"). Client-timestamped for the same offline reason as taps.
export async function addLocationPing(
  bookingId: string,
  riderId: string,
  lat: number,
  lng: number,
  clientTimestamp?: string,
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.riderId !== riderId) throw new BookingError('not_found', 'Booking not found');
  return prisma.locationPing.create({
    data: { bookingId, lat, lng, recordedAt: clientTimestamp ? new Date(clientTimestamp) : new Date() },
  });
}

export async function getLocationTrail(bookingId: string) {
  return prisma.locationPing.findMany({ where: { bookingId }, orderBy: { recordedAt: 'asc' } });
}

// "Driver taps Boarded against a named passenger on the manifest" (spec
// section 4) — the list of paid passengers a driver app would show for
// one run. The driver app itself is step 8; this is the data it needs.
export async function getManifestForRun(runId: string) {
  return prisma.booking.findMany({
    where: { runHold: { runId }, escrow: { state: { in: [EscrowState.HELD, EscrowState.RELEASABLE] } } },
    include: {
      rider: { select: { firstName: true, lastName: true, phone: true } },
      runHold: { select: { boardStopId: true, alightStopId: true, seats: true } },
      escrow: true,
    },
  });
}

// "A rider who does not respond within the trip duration does not
// auto-release; the case ages into the ops queue" (spec section 4).
// There's no ops dashboard yet (step 9) to surface this, so this is the
// query it will run: HELD bookings the driver boarded but the rider
// never confirmed, past a threshold.
export async function getStaleBoardings(thresholdMinutes: number) {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  return prisma.booking.findMany({
    where: { driverBoardedAt: { lt: cutoff }, riderBoardedAt: null, escrow: { state: EscrowState.HELD } },
    include: { rider: { select: { phone: true, firstName: true } }, escrow: true },
  });
}

// Rider-initiated "I did not board" (spec section 4). A photo is
// deliberately not part of this contract — it must stay optional, and
// the decisive evidence is the location trail (step 6), not a picture.
export async function openDispute(bookingId: string, riderId: string, reason: string) {
  const booking = await loadBookingOrThrow(bookingId);
  if (booking.riderId !== riderId) throw new BookingError('not_found', 'Booking not found');

  await transitionEscrow({
    escrowId: booking.escrow!.id,
    toState: EscrowState.DISPUTED,
    actorType: EscrowActorType.RIDER,
    actorId: riderId,
    evidence: { reason },
  });
  return loadBookingOrThrow(bookingId);
}

// Ops-only (spec: "DISPUTED is terminal until a human resolves it").
export async function resolveDispute(
  bookingId: string,
  opsId: string,
  toState: typeof EscrowState.RELEASABLE | typeof EscrowState.REFUNDING,
  note: string,
) {
  const booking = await loadBookingOrThrow(bookingId);

  await transitionEscrow({
    escrowId: booking.escrow!.id,
    toState,
    actorType: EscrowActorType.OPS,
    actorId: opsId,
    evidence: { note },
  });

  if (toState === EscrowState.REFUNDING) {
    await paymentProvider.refund(booking.paymentIntentId, booking.fareCedis, note);
  }

  return loadBookingOrThrow(bookingId);
}

// Rider no-show at departure (spec section 5) — the cancellation policy
// engine that triggers this automatically is step 7, not built. This is
// the ops-invoked mechanism it will call.
export async function markNoShow(bookingId: string, opsId: string) {
  const booking = await loadBookingOrThrow(bookingId);
  await transitionEscrow({
    escrowId: booking.escrow!.id,
    toState: EscrowState.FORFEIT,
    actorType: EscrowActorType.OPS,
    actorId: opsId,
    evidence: { reason: 'no_show' },
  });
  return loadBookingOrThrow(bookingId);
}

// OPEN in the spec: whether FORFEIT pays the driver in full, partially,
// or not at all is an unresolved legal/tax question. This does not
// decide it — `payoutAmountCedis` is a caller-supplied choice, not a
// policy this code invents. For a RUN booking there is also no payee yet
// (Express drivers are employed by an Operator — an earnings/payout
// ledger for that is steps 9/10), so only the state transition happens;
// wiring an actual payout call is deferred to when that exists.
export async function settleBooking(bookingId: string, opsId: string, payoutAmountCedis: number) {
  const booking = await loadBookingOrThrow(bookingId);
  const fromState = booking.escrow!.state;
  if (fromState !== EscrowState.RELEASABLE && fromState !== EscrowState.FORFEIT) {
    throw new EscrowError('invalid_transition', `Cannot settle from ${fromState}`);
  }

  if (booking.kind === BookingKind.PARTNER && payoutAmountCedis > 0) {
    await paymentProvider.payout(booking.partnerHold!.trip.partnerId, payoutAmountCedis, `booking:${bookingId}`);
  }

  await transitionEscrow({
    escrowId: booking.escrow!.id,
    toState: EscrowState.SETTLED,
    actorType: EscrowActorType.OPS,
    actorId: opsId,
    evidence: { payoutAmountCedis },
  });
  return loadBookingOrThrow(bookingId);
}
