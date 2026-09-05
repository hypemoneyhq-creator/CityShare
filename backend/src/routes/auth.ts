import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { issueSessionToken } from '../services/jwt';
import { startPhoneVerification, verifyPhoneCode } from '../services/otp';

export const authRouter = Router();

const phoneSchema = z.object({ phone: z.string().regex(/^\+\d{7,15}$/) });

authRouter.post(
  '/phone/start',
  asyncHandler(async (req, res) => {
    const parsed = phoneSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_phone' });

    const { devCode } = await startPhoneVerification(parsed.data.phone);
    res.json({ sent: true, devCode });
  }),
);

const verifyPhoneSchema = phoneSchema.extend({ code: z.string().length(4) });

// Verifying the phone code both confirms the number and logs the rider in:
// there is no separate password step (see spec section 8 — phone + Ghana
// Card is the whole identity story for a Rider).
authRouter.post(
  '/phone/verify',
  asyncHandler(async (req, res) => {
    const parsed = verifyPhoneSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const { phone, code } = parsed.data;

    const result = await verifyPhoneCode(phone, code);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    const user = await prisma.user.upsert({
      where: { phone },
      update: { phoneVerifiedAt: new Date() },
      create: { phone, phoneVerifiedAt: new Date() },
    });

    const token = issueSessionToken({ userId: user.id });
    res.json({ token, user: serializeUser(user) });
  }),
);

const identitySchema = z.object({
  // e.g. "GHA-724812190-4" — loose on purpose; the real format needs a
  // Ghana Card / NIA integration (see README blocker #3).
  ghanaCardNumber: z.string().regex(/^GHA-\d{6,12}-\d$/i),
  selfieImage: z.string().min(1),
});

// There is no NIA or KYC-vendor integration behind this — see README
// blocker #3. This mocks an instant match so the seat-inventory and
// booking flows downstream have a "verified" user to work with; swapping
// in a real verification provider does not change this route's contract.
authRouter.post(
  '/identity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = identitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const now = new Date();
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ghanaCardNumber: parsed.data.ghanaCardNumber,
        ghanaCardVerifiedAt: now,
        selfieVerifiedAt: now,
      },
    });

    res.json({ user: serializeUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json({ user: serializeUser(user) });
  }),
);

// Stand-in for Partner onboarding (vehicle documents, Safety Standard
// agreement — see README screens table), which is not built yet. This
// exists so Partner trips are exercisable now; a real onboarding flow
// will set isPartner as its last step instead of a direct client call.
authRouter.post(
  '/become-partner',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.userId }, data: { isPartner: true } });
    res.json({ user: serializeUser(user) });
  }),
);

// Stand-in for Express driver vetting (spec: drivers are vetted through
// their Operator, not independently onboarded — Operators are step 10).
authRouter.post(
  '/become-driver',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.userId }, data: { isDriver: true } });
    res.json({ user: serializeUser(user) });
  }),
);

function serializeUser(user: {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  phoneVerifiedAt: Date | null;
  ghanaCardVerifiedAt: Date | null;
  selfieVerifiedAt: Date | null;
  isRider: boolean;
  isPartner: boolean;
  isDriver: boolean;
  isOps: boolean;
}) {
  return {
    id: user.id,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    isRider: user.isRider,
    isPartner: user.isPartner,
    isDriver: user.isDriver,
    // Ops accounts are provisioned directly (no self-service "become-ops",
    // unlike Partner/driver — see README): exposing the flag here just
    // lets a client like the ops dashboard tell "logged in, not ops" from
    // "not logged in" without probing an ops-only endpoint for a 403.
    isOps: user.isOps,
    verification: {
      phoneVerified: Boolean(user.phoneVerifiedAt),
      idVerified: Boolean(user.ghanaCardVerifiedAt && user.selfieVerifiedAt),
    },
  };
}
