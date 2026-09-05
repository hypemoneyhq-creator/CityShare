import { BookingKind, EscrowActorType, EscrowState, HoldStatus, PaymentOutcome } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../db';
import { createEscrowForBooking, EscrowError, transitionEscrow } from './escrow';
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

// Boarding is two-sided (spec section 4): neither tap alone releases
// money. Real GPS/offline-queue evidence is step 6 — these are bare
// timestamps for now, enough to exercise the "both taps required"
// invariant the escrow state machine enforces.
export async function tapBoarded(bookingId: string, side: 'driver' | 'rider') {
  const booking = await loadBookingOrThrow(bookingId);
  if (booking.escrow!.state !== EscrowState.HELD) {
    throw new BookingError('invalid_state', 'Boarding taps only apply to a HELD escrow');
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: side === 'driver' ? { driverBoardedAt: new Date() } : { riderBoardedAt: new Date() },
  });

  if (updated.driverBoardedAt && updated.riderBoardedAt) {
    await transitionEscrow({
      escrowId: booking.escrow!.id,
      toState: EscrowState.RELEASABLE,
      actorType: EscrowActorType.SYSTEM,
      evidence: { driverBoardedAt: updated.driverBoardedAt, riderBoardedAt: updated.riderBoardedAt },
    });
  }

  return loadBookingOrThrow(bookingId);
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
