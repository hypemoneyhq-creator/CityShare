import { Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from './asyncHandler';

// Verification is required before first booking (spec section 8). Runs
// after requireAuth, so req.userId is set.
export const requireVerified = asyncHandler(async (req: Request, res: Response, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'not_found' });
  if (!user.phoneVerifiedAt || !user.ghanaCardVerifiedAt || !user.selfieVerifiedAt) {
    return res.status(403).json({ error: 'not_verified' });
  }
  next();
});
