import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireVerified } from '../middleware/verified';
import { cancelPartnerTrip } from '../services/booking';
import {
  createPartnerHold,
  getPartnerTripAvailability,
  InventoryError,
  releasePartnerHold,
} from '../services/inventory';
import * as paymentProvider from '../services/paymentProvider';

export const partnerTripsRouter = Router();

function handleInventoryError(err: unknown, res: import('express').Response) {
  if (err instanceof InventoryError) {
    const status = err.code === 'not_found' ? 404 : err.code === 'full' ? 409 : 400;
    return res.status(status).json({ error: err.code, message: err.message });
  }
  throw err;
}

const createTripSchema = z.object({
  corridorId: z.string().uuid().optional(),
  originName: z.string().min(1),
  originLat: z.number(),
  originLng: z.number(),
  destinationName: z.string().min(1),
  destLat: z.number(),
  destLng: z.number(),
  departAt: z.string().datetime(),
  // A Partner may list at most the passenger seats declared at onboarding
  // (spec section 2) — capped at 4 here since onboarding isn't built yet.
  seatsTotal: z.number().int().min(1).max(4),
  farePerSeatCedis: z.number().int().min(0),
  vehicleDescription: z.string().min(1),
  comfortAc: z.boolean().optional(),
  comfortUsb: z.boolean().optional(),
  comfortBoot: z.boolean().optional(),
});

partnerTripsRouter.post(
  '/partner-trips',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const parsed = createTripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.isPartner) return res.status(403).json({ error: 'not_a_partner' });

    const trip = await prisma.partnerTrip.create({
      data: { ...parsed.data, departAt: new Date(parsed.data.departAt), partnerId: req.userId! },
    });
    res.status(201).json({ trip });
  }),
);

const listQuerySchema = z.object({ corridorId: z.string().uuid().optional() });

partnerTripsRouter.get(
  '/partner-trips',
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });

    const trips = await prisma.partnerTrip.findMany({
      where: {
        status: 'SCHEDULED',
        ...(parsed.data.corridorId ? { corridorId: parsed.data.corridorId } : {}),
      },
      include: { partner: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { departAt: 'asc' },
    });

    const withAvailability = await Promise.all(
      trips.map(async (trip) => ({ trip, availableSeats: await getPartnerTripAvailability(trip.id) })),
    );
    res.json({ trips: withAvailability });
  }),
);

// "Partner home" (spec screens table) — a Partner's own trips, each with
// how many of its seats are booked.
partnerTripsRouter.get(
  '/partner-trips/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trips = await prisma.partnerTrip.findMany({
      where: { partnerId: req.userId },
      orderBy: { departAt: 'desc' },
    });
    const withAvailability = await Promise.all(
      trips.map(async (trip) => ({
        trip,
        availableSeats: await getPartnerTripAvailability(trip.id),
      })),
    );
    res.json({ trips: withAvailability });
  }),
);

// "Passenger list" (spec screens table) — same shape as the Run
// manifest, for the Partner's own trip.
partnerTripsRouter.get(
  '/partner-trips/:id/manifest',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await prisma.partnerTrip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'not_found' });
    if (trip.partnerId !== req.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user?.isOps) return res.status(403).json({ error: 'not_the_partner' });
    }

    const bookings = await prisma.booking.findMany({
      where: { partnerHold: { tripId: req.params.id }, escrow: { state: { in: ['HELD', 'RELEASABLE'] } } },
      include: { rider: { select: { firstName: true, lastName: true, phone: true } }, escrow: true },
    });

    res.json({
      manifest: bookings.map((b) => ({
        bookingId: b.id,
        riderName: [b.rider.firstName, b.rider.lastName].filter(Boolean).join(' ') || b.rider.phone,
        seats: b.seats,
        boardingCode: b.boardingCode,
        driverBoardedAt: b.driverBoardedAt,
        riderBoardedAt: b.riderBoardedAt,
        escrowState: b.escrow?.state,
      })),
    });
  }),
);

partnerTripsRouter.post(
  '/partner-trips/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await prisma.partnerTrip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'not_found' });
    if (trip.partnerId !== req.userId) return res.status(403).json({ error: 'not_the_partner' });
    const updated = await prisma.partnerTrip.update({ where: { id: req.params.id }, data: { status: 'COMPLETED' } });
    res.json({ trip: updated });
  }),
);

// "Earnings" (spec screens table). Real figures from Payout and Escrow —
// no commission rate is shown, because none has been decided (Operator
// revenue shares are marked "to be agreed" in the spec, and nothing
// analogous exists for Partners either).
partnerTripsRouter.get(
  '/partner/earnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Payouts resolve lazily like every other mock-provider outcome, but
    // nothing else polls them the way GET /bookings/:id polls payments
    // and refunds — do it here so a settled payout doesn't sit PENDING
    // forever just because no one asked.
    const unresolvedPayouts = await prisma.payout.findMany({
      where: { payeeId: req.userId, status: 'PENDING' },
    });
    await Promise.all(unresolvedPayouts.map((p) => paymentProvider.getPayoutStatus(p.id)));

    const [approvedPayouts, pendingPayouts, heldBookings, recentPayouts] = await Promise.all([
      prisma.payout.aggregate({ where: { payeeId: req.userId, status: 'APPROVED' }, _sum: { amountCedis: true } }),
      prisma.payout.aggregate({ where: { payeeId: req.userId, status: 'PENDING' }, _sum: { amountCedis: true } }),
      prisma.booking.findMany({
        where: { partnerHold: { trip: { partnerId: req.userId } }, escrow: { state: { in: ['HELD', 'RELEASABLE'] } } },
        select: { fareCedis: true },
      }),
      prisma.payout.findMany({ where: { payeeId: req.userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    res.json({
      availableCedis: approvedPayouts._sum.amountCedis ?? 0,
      pendingPayoutCedis: pendingPayouts._sum.amountCedis ?? 0,
      heldInEscrowCedis: heldBookings.reduce((sum, b) => sum + b.fareCedis, 0),
      recentPayouts,
    });
  }),
);

const holdSchema = z.object({ seats: z.number().int().min(1).max(4) });

partnerTripsRouter.post(
  '/partner-trips/:id/holds',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const parsed = holdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    try {
      const { hold, fareCedis } = await createPartnerHold({
        tripId: req.params.id,
        seats: parsed.data.seats,
        riderId: req.userId!,
      });
      res.status(201).json({ hold, fareCedis });
    } catch (err) {
      handleInventoryError(err, res);
    }
  }),
);

// Driver-side cancellation (spec section 5) — the Partner IS the driver
// here, so unlike the Run case this is properly ownership-checked rather
// than ops-gated. An ops user may also cancel on a Partner's behalf.
partnerTripsRouter.post(
  '/partner-trips/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await prisma.partnerTrip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'not_found' });
    if (trip.partnerId !== req.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user?.isOps) return res.status(403).json({ error: 'not_the_partner' });
    }
    const result = await cancelPartnerTrip(req.params.id);
    res.json(result);
  }),
);

partnerTripsRouter.post(
  '/partner-holds/:id/release',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const hold = await releasePartnerHold(req.params.id, req.userId!);
      res.json({ hold });
    } catch (err) {
      handleInventoryError(err, res);
    }
  }),
);
