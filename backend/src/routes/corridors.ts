import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';

export const corridorsRouter = Router();

corridorsRouter.get(
  '/corridors',
  asyncHandler(async (_req, res) => {
    const corridors = await prisma.corridor.findMany({
      include: { services: { where: { active: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ corridors });
  }),
);

corridorsRouter.get(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: { stops: { orderBy: { sequence: 'asc' } }, corridor: true },
    });
    if (!service) return res.status(404).json({ error: 'not_found' });
    res.json({ service });
  }),
);

const runsQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

corridorsRouter.get(
  '/services/:id/runs',
  asyncHandler(async (req, res) => {
    const parsed = runsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' });

    const day = parsed.data.date ? new Date(`${parsed.data.date}T00:00:00.000Z`) : undefined;
    const runs = await prisma.run.findMany({
      where: {
        serviceId: req.params.id,
        ...(day ? { date: day } : {}),
      },
      orderBy: { date: 'asc' },
    });
    res.json({ runs });
  }),
);
