import { OperatorDocKey } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  OperatorError,
  addDriver,
  addVehicle,
  assignRunVehicle,
  getCertification,
  getConsole,
  getMine,
  removeDriver,
  removeVehicle,
  setCorridorInterest,
  submitApplication,
  toggleDocument,
  upsertApplication,
} from '../services/operator';

export const operatorsRouter = Router();

function handleOperatorError(err: unknown, res: import('express').Response) {
  if (err instanceof OperatorError) {
    const status =
      err.code === 'not_found' || err.code === 'recipient_not_found'
        ? 404
        : err.code === 'not_certified' || err.code === 'not_your_corridor'
          ? 403
          : 400;
    return res.status(status).json({ error: err.code, message: err.message });
  }
  throw err;
}

const applicationSchema = z.object({
  registeredName: z.string().min(1),
  rgdNumber: z.string().optional(),
  operatingSince: z.number().int().optional(),
  contactName: z.string().optional(),
});

operatorsRouter.post(
  '/operators/application',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = applicationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const operator = await upsertApplication(req.userId!, parsed.data);
    res.json({ operator });
  }),
);

operatorsRouter.get(
  '/operators/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const operator = await getMine(req.userId!);
    if (!operator) return res.status(404).json({ error: 'not_found' });
    res.json({ operator });
  }),
);

const vehicleSchema = z.object({
  label: z.string().min(1),
  vehicleType: z.string().min(1),
  spec: z.string().min(1),
  seats: z.number().int().min(1).max(60),
});

operatorsRouter.post(
  '/operators/vehicles',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = vehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const vehicle = await addVehicle(req.userId!, parsed.data);
      res.status(201).json({ vehicle });
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

operatorsRouter.delete(
  '/operators/vehicles/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      await removeVehicle(req.userId!, req.params.id);
      res.status(204).end();
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

const corridorSchema = z.object({ on: z.boolean() });

operatorsRouter.post(
  '/operators/corridors/:corridorId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = corridorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      await setCorridorInterest(req.userId!, req.params.corridorId, parsed.data.on);
      res.status(204).end();
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

operatorsRouter.post(
  '/operators/documents/:key',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!Object.values(OperatorDocKey).includes(req.params.key as OperatorDocKey)) {
      return res.status(400).json({ error: 'invalid_document_key' });
    }
    try {
      const document = await toggleDocument(req.userId!, req.params.key as OperatorDocKey);
      res.json({ document });
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

operatorsRouter.post(
  '/operators/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const operator = await submitApplication(req.userId!);
      res.json({ operator });
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

operatorsRouter.get(
  '/operators/certification',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const result = await getCertification(req.userId!);
      res.json(result);
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

const addDriverSchema = z.object({ phone: z.string().regex(/^\+\d{7,15}$/) });

operatorsRouter.post(
  '/operators/drivers',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = addDriverSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const driver = await addDriver(req.userId!, parsed.data.phone);
      res.status(201).json({ driver: { id: driver.id, phone: driver.phone, firstName: driver.firstName, lastName: driver.lastName } });
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

operatorsRouter.delete(
  '/operators/drivers/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      await removeDriver(req.userId!, req.params.userId);
      res.status(204).end();
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

operatorsRouter.get(
  '/operators/console',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const console_ = await getConsole(req.userId!);
      res.json(console_);
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);

const assignSchema = z.object({ vehicleId: z.string().uuid(), driverId: z.string().uuid().optional() });

operatorsRouter.post(
  '/operators/runs/:runId/assign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    try {
      const run = await assignRunVehicle(req.userId!, req.params.runId, parsed.data.vehicleId, parsed.data.driverId);
      res.json({ run });
    } catch (err) {
      handleOperatorError(err, res);
    }
  }),
);
