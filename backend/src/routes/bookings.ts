import { BookingKind, PaymentOutcome } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireOps } from '../middleware/ops';
import { requireVerified } from '../middleware/verified';
import {
  addLocationPing,
  BookingError,
  cancelBooking,
  denyBoarding,
  getLocationTrail,
  getStaleBoardings,
  initiateBookingPayment,
  markNoShow,
  openDispute,
  reassignBooking,
  refreshBookingStatus,
  resolveDispute,
  settleBooking,
  tapBoarded,
} from '../services/booking';
import { EscrowError } from '../services/escrow';

export const bookingsRouter = Router();

function handleError(err: unknown, res: import('express').Response) {
  if (err instanceof BookingError) {
    const status =
      err.code === 'not_found' || err.code === 'recipient_not_found'
        ? 404
        : err.code === 'expired' || err.code === 'too_late'
          ? 410
          : 400;
    return res.status(status).json({ error: err.code, message: err.message });
  }
  if (err instanceof EscrowError) {
    const status = err.code === 'not_found' ? 404 : err.code === 'requires_ops' ? 403 : 400;
    return res.status(status).json({ error: err.code, message: err.message });
  }
  throw err;
}

// forceOutcome is a dev/test-only override — see paymentProvider.ts. The
// whole payment subsystem is a mock (no MoMo agreement exists yet), so
// this isn't gated to non-production; there is no real provider to
// protect against.
const paySchema = z.object({ forceOutcome: z.nativeEnum(PaymentOutcome).optional() });

bookingsRouter.post(
  '/holds/:id/pay',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const parsed = paySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const { booking, intentStatus } = await initiateBookingPayment({
        kind: BookingKind.RUN,
        holdId: req.params.id,
        riderId: req.userId!,
        forceOutcome: parsed.data.forceOutcome,
      });
      res.status(201).json({ booking, intentStatus });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

bookingsRouter.post(
  '/partner-holds/:id/pay',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const parsed = paySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const { booking, intentStatus } = await initiateBookingPayment({
        kind: BookingKind.PARTNER,
        holdId: req.params.id,
        riderId: req.userId!,
        forceOutcome: parsed.data.forceOutcome,
      });
      res.status(201).json({ booking, intentStatus });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

async function requireBookingAccess(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return null;
  if (booking.riderId === userId) return booking;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.isOps ? booking : null;
}

bookingsRouter.get(
  '/bookings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const access = await requireBookingAccess(req.params.id, req.userId!);
    if (!access) return res.status(404).json({ error: 'not_found' });
    try {
      const booking = await refreshBookingStatus(req.params.id);
      res.json({ booking });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

bookingsRouter.get(
  '/bookings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bookings = await prisma.booking.findMany({
      where: { riderId: req.userId },
      include: { escrow: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ bookings });
  }),
);

// GPS is optional at the type level (a real device might report no fix),
// which is exactly the "GPS unavailable" case the escrow logic routes to
// manual review rather than defaulting either way. clientTimestamp
// supports the offline tap queue — see tapBoarded in services/booking.ts.
const boardingTapSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  clientTimestamp: z.string().datetime().optional(),
});

// Driver auth is not built (Express drivers are employed by an Operator —
// step 8). For a Partner booking the Partner IS identifiable, so that
// case is checked properly; for a Run (Express) booking this accepts any
// authenticated caller as a stand-in until driver accounts exist.
bookingsRouter.post(
  '/bookings/:id/board/driver',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = boardingTapSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { partnerHold: { include: { trip: true } } },
    });
    if (!booking) return res.status(404).json({ error: 'not_found' });
    if (booking.kind === BookingKind.PARTNER && booking.partnerHold?.trip.partnerId !== req.userId) {
      return res.status(403).json({ error: 'not_the_driver' });
    }
    try {
      const updated = await tapBoarded(req.params.id, 'driver', parsed.data);
      res.json({ booking: updated });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

bookingsRouter.post(
  '/bookings/:id/board/rider',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = boardingTapSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking || booking.riderId !== req.userId) return res.status(404).json({ error: 'not_found' });
    try {
      const updated = await tapBoarded(req.params.id, 'rider', parsed.data);
      res.json({ booking: updated });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

const denyBoardingSchema = z.object({ reason: z.string().min(1) });

bookingsRouter.post(
  '/bookings/:id/deny-boarding',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = denyBoardingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { partnerHold: { include: { trip: true } } },
    });
    if (!booking) return res.status(404).json({ error: 'not_found' });
    if (booking.kind === BookingKind.PARTNER && booking.partnerHold?.trip.partnerId !== req.userId) {
      return res.status(403).json({ error: 'not_the_driver' });
    }
    try {
      const updated = await denyBoarding(req.params.id, parsed.data.reason);
      res.json({ booking: updated });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  clientTimestamp: z.string().datetime().optional(),
});

bookingsRouter.post(
  '/bookings/:id/location-pings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = locationPingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const ping = await addLocationPing(
        req.params.id,
        req.userId!,
        parsed.data.lat,
        parsed.data.lng,
        parsed.data.clientTimestamp,
      );
      res.status(201).json({ ping });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

bookingsRouter.get(
  '/bookings/:id/location-pings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const access = await requireBookingAccess(req.params.id, req.userId!);
    if (!access) return res.status(404).json({ error: 'not_found' });
    const trail = await getLocationTrail(req.params.id);
    res.json({ trail });
  }),
);

bookingsRouter.post(
  '/bookings/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const booking = await cancelBooking(req.params.id, req.userId!);
      res.json({ booking });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

const reassignSchema = z.object({ toPhone: z.string().regex(/^\+\d{7,15}$/) });

// Reassignment must be presented above cancellation in the UI (spec
// section 5) — that's a client concern; this is the endpoint both
// options call.
bookingsRouter.post(
  '/bookings/:id/reassign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = reassignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const booking = await reassignBooking(req.params.id, req.userId!, parsed.data.toPhone);
      res.json({ booking });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

const disputeSchema = z.object({
  reason: z.enum(['never_arrived', 'left_early', 'wrong_vehicle', 'refused_seat']),
});

bookingsRouter.post(
  '/bookings/:id/dispute',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = disputeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const booking = await openDispute(req.params.id, req.userId!, parsed.data.reason);
      res.json({ booking });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

const resolveSchema = z.object({ toState: z.enum(['RELEASABLE', 'REFUNDING']), note: z.string().min(1) });

bookingsRouter.post(
  '/bookings/:id/resolve-dispute',
  requireAuth,
  requireOps,
  asyncHandler(async (req, res) => {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const booking = await resolveDispute(req.params.id, req.userId!, parsed.data.toState, parsed.data.note);
      res.json({ booking });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

bookingsRouter.post(
  '/bookings/:id/mark-no-show',
  requireAuth,
  requireOps,
  asyncHandler(async (req, res) => {
    try {
      const booking = await markNoShow(req.params.id, req.userId!);
      res.json({ booking });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

const settleSchema = z.object({ payoutAmountCedis: z.number().int().min(0) });

bookingsRouter.post(
  '/bookings/:id/settle',
  requireAuth,
  requireOps,
  asyncHandler(async (req, res) => {
    const parsed = settleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const booking = await settleBooking(req.params.id, req.userId!, parsed.data.payoutAmountCedis);
      res.json({ booking });
    } catch (err) {
      handleError(err, res);
    }
  }),
);

// "Ages into the ops queue" (spec section 4) — there's no ops dashboard
// yet (step 9) to poll this on a schedule, so it's exposed as a query
// ops can run directly. Defaults to the same 90 minutes as a generous
// multiple of the pilot's 3-minute max dwell, not a spec'd number.
const staleQuerySchema = z.object({ minutes: z.coerce.number().int().min(1).max(1440).optional() });

bookingsRouter.get(
  '/ops/stale-boardings',
  requireAuth,
  requireOps,
  asyncHandler(async (req, res) => {
    const parsed = staleQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
    const bookings = await getStaleBoardings(parsed.data.minutes ?? 90);
    res.json({ bookings });
  }),
);
