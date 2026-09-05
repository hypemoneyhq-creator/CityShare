import { Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from './asyncHandler';

// Stand-in for the ops dashboard's access control (not built — step 9).
// Gated directly on User.isOps for now; runs after requireAuth.
export const requireOps = asyncHandler(async (req: Request, res: Response, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.isOps) return res.status(403).json({ error: 'not_ops' });
  next();
});
