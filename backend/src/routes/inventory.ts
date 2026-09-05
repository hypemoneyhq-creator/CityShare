import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireVerified } from '../middleware/verified';
import {
  createRunHold,
  getRunSegments,
  InventoryError,
  releaseRunHold,
} from '../services/inventory';

export const inventoryRouter = Router();

function handleInventoryError(err: unknown, res: import('express').Response) {
  if (err instanceof InventoryError) {
    const status = err.code === 'not_found' ? 404 : err.code === 'full' ? 409 : 400;
    return res.status(status).json({ error: err.code, message: err.message });
  }
  throw err;
}

// Stops + per-leg availability for a run, e.g. to drive the "leg picker"
// and seat pips on the trip detail screen.
inventoryRouter.get(
  '/runs/:id/segments',
  asyncHandler(async (req, res) => {
    try {
      const { run, stops, legAvailability } = await getRunSegments(req.params.id);
      res.json({
        run: { id: run.id, date: run.date, status: run.status, capacity: run.capacity },
        service: {
          id: run.service.id,
          code: run.service.code,
          name: run.service.name,
          type: run.service.type,
          flatFareCedis: run.service.flatFareCedis,
        },
        stops: stops.map((s, i) => ({
          id: s.id,
          name: s.name,
          sequence: s.sequence,
          scheduledArrival: s.scheduledArrival,
          scheduledDeparture: s.scheduledDeparture,
          boardAllowed: s.boardAllowed,
          alightAllowed: s.alightAllowed,
          legFareCedis: s.legFareCedis,
          // Availability of the leg starting at this stop, if any (the last
          // stop has no outgoing leg).
          legAvailability: i < legAvailability.length ? legAvailability[i] : null,
        })),
      });
    } catch (err) {
      handleInventoryError(err, res);
    }
  }),
);

const holdSchema = z.object({
  boardStopId: z.string().uuid(),
  alightStopId: z.string().uuid(),
  seats: z.number().int().min(1).max(8),
});

inventoryRouter.post(
  '/runs/:id/holds',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const parsed = holdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    try {
      const { hold, fareCedis } = await createRunHold({
        runId: req.params.id,
        boardStopId: parsed.data.boardStopId,
        alightStopId: parsed.data.alightStopId,
        seats: parsed.data.seats,
        riderId: req.userId!,
      });
      res.status(201).json({ hold, fareCedis });
    } catch (err) {
      handleInventoryError(err, res);
    }
  }),
);

inventoryRouter.post(
  '/holds/:id/release',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const hold = await releaseRunHold(req.params.id, req.userId!);
      res.json({ hold });
    } catch (err) {
      handleInventoryError(err, res);
    }
  }),
);
