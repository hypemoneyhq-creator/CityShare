import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireVerified } from '../middleware/verified';
import {
  createPartnerHold,
  getPartnerTripAvailability,
  InventoryError,
  releasePartnerHold,
} from '../services/inventory';

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
