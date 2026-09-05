import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireOps } from '../middleware/ops';
import { getCorridorsOverview, getDisputeQueue, getLiveSummary } from '../services/ops';

export const opsRouter = Router();

opsRouter.get(
  '/ops/summary',
  requireAuth,
  requireOps,
  asyncHandler(async (_req, res) => {
    const summary = await getLiveSummary();
    res.json(summary);
  }),
);

opsRouter.get(
  '/ops/disputes',
  requireAuth,
  requireOps,
  asyncHandler(async (_req, res) => {
    const disputes = await getDisputeQueue();
    res.json({ disputes });
  }),
);

opsRouter.get(
  '/ops/corridors',
  requireAuth,
  requireOps,
  asyncHandler(async (_req, res) => {
    const corridors = await getCorridorsOverview();
    res.json({ corridors });
  }),
);
