import { Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from './asyncHandler';

// Stand-in for Express driver identity (spec: drivers are vetted through
// their Operator, not independently onboarded — but Operators are step
// 10). Gated directly on User.isDriver for now; runs after requireAuth.
export const requireDriver = asyncHandler(async (req: Request, res: Response, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.isDriver) return res.status(403).json({ error: 'not_a_driver' });
  next();
});
