import crypto from 'crypto';
import { prisma } from '../db';

const CODE_LENGTH = 4;
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  const max = 10 ** CODE_LENGTH;
  return crypto.randomInt(0, max).toString().padStart(CODE_LENGTH, '0');
}

/**
 * Issues a new OTP for a phone number. There is no SMS provider wired up yet
 * (see README "Building the money path before MoMo is signed" for the same
 * pattern applied to payments) — outside production the code is returned to
 * the caller so the mobile client and tests can proceed without a real
 * carrier integration.
 */
export async function startPhoneVerification(phone: string) {
  const code = generateCode();
  await prisma.phoneOtp.create({
    data: {
      phone,
      code: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.log(`[otp] issued code for ${phone}`);
    return { devCode: undefined };
  }
  return { devCode: code };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'mismatch' };

export async function verifyPhoneCode(phone: string, code: string): Promise<VerifyResult> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) return { ok: false, reason: 'not_found' };
  if (otp.expiresAt < new Date()) return { ok: false, reason: 'expired' };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  if (otp.code !== hashCode(code)) {
    await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: 'mismatch' };
  }

  await prisma.phoneOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}
