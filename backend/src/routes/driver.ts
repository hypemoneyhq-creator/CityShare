import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireDriver } from '../middleware/driver';
import { requireOps } from '../middleware/ops';
import {
  arriveAtStop,
  assignDriver,
  completeRun,
  departStop,
  DriverError,
  getDriverRuns,
  getStopStatus,
  reportIncident,
  startRun,
} from '../services/driver';

export const driverRouter = Router();

function handleDriverError(err: unknown, res: import('express').Response) {
  if (err instanceof DriverError) {
    const status = err.code === 'not_found' ? 404 : err.code === 'not_assigned' ? 403 : 400;
    return res.status(status).json({ error: err.code, message: err.message });
  }
  throw err;
}

const assignSchema = z.object({ driverId: z.string().uuid() });

// No Operator roster/scheduling exists yet (step 10) — ops assigns
// drivers to runs directly in the meantime.
driverRouter.post(
  '/runs/:id/assign-driver',
  requireAuth,
  requireOps,
  asyncHandler(async (req, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const run = await assignDriver(req.params.id, parsed.data.driverId);
      res.json({ run });
    } catch (err) {
      handleDriverError(err, res);
    }
  }),
);

driverRouter.get(
  '/driver/runs',
  requireAuth,
  requireDriver,
  asyncHandler(async (req, res) => {
    const runs = await getDriverRuns(req.userId!);
    res.json({ runs });
  }),
);

driverRouter.post(
  '/runs/:id/start',
  requireAuth,
  requireDriver,
  asyncHandler(async (req, res) => {
    try {
      const run = await startRun(req.params.id, req.userId!);
      res.json({ run });
    } catch (err) {
      handleDriverError(err, res);
    }
  }),
);

const timestampSchema = z.object({ clientTimestamp: z.string().datetime().optional() });

driverRouter.post(
  '/runs/:id/stops/:stopId/arrive',
  requireAuth,
  requireDriver,
  asyncHandler(async (req, res) => {
    const parsed = timestampSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const event = await arriveAtStop(req.params.id, req.userId!, req.params.stopId, parsed.data.clientTimestamp);
      res.json({ event });
    } catch (err) {
      handleDriverError(err, res);
    }
  }),
);

// Public like the other read-only run endpoints — the dwell countdown is
// also useful to a rider's own live-trip screen (not built yet), not
// just the driver.
driverRouter.get(
  '/runs/:id/stops/:stopId/dwell',
  asyncHandler(async (req, res) => {
    try {
      const status = await getStopStatus(req.params.id, req.params.stopId);
      res.json(status);
    } catch (err) {
      handleDriverError(err, res);
    }
  }),
);

const departSchema = z.object({
  markNoShowForUnboarded: z.boolean().default(false),
  clientTimestamp: z.string().datetime().optional(),
});

driverRouter.post(
  '/runs/:id/stops/:stopId/depart',
  requireAuth,
  requireDriver,
  asyncHandler(async (req, res) => {
    const parsed = departSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const result = await departStop(req.params.id, req.userId!, req.params.stopId, parsed.data);
      res.json(result);
    } catch (err) {
      handleDriverError(err, res);
    }
  }),
);

const incidentSchema = z.object({
  category: z.enum(['heavy_traffic', 'vehicle_fault', 'stop_blocked', 'passenger_issue', 'accident_sos']),
  note: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

driverRouter.post(
  '/runs/:id/incidents',
  requireAuth,
  requireDriver,
  asyncHandler(async (req, res) => {
    const parsed = incidentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const incident = await reportIncident(
        req.params.id,
        req.userId!,
        parsed.data.category,
        parsed.data.note,
        parsed.data.lat,
        parsed.data.lng,
      );
      res.status(201).json({ incident });
    } catch (err) {
      handleDriverError(err, res);
    }
  }),
);

driverRouter.post(
  '/runs/:id/complete',
  requireAuth,
  requireDriver,
  asyncHandler(async (req, res) => {
    try {
      const summary = await completeRun(req.params.id, req.userId!);
      res.json(summary);
    } catch (err) {
      handleDriverError(err, res);
    }
  }),
);
