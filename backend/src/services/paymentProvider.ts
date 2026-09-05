import { PaymentOutcome } from '@prisma/client';
import { prisma } from '../db';

// No MoMo merchant agreement exists yet (root README "Building the money
// path before MoMo is signed"). This mocks the five-function provider
// interface documented there, resolving lazily: the eventual outcome is
// decided at creation time and only "revealed" once resolvesAt passes —
// the same pattern SeatHold expiry uses, so callers just poll a status
// getter instead of needing a real webhook.

const TIMEOUT_MS = 90 * 1000;

function randomDelayMs(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

// Test convention (README's mock behavior table): a seeded phone number
// suffix selects a forced outcome so QA can drive every case without a
// real network. `forceOutcome` (threaded from a route's dev-only param)
// wins when given.
async function resolveOutcome(riderId: string, forceOutcome?: PaymentOutcome): Promise<PaymentOutcome> {
  if (forceOutcome && forceOutcome !== PaymentOutcome.PENDING) return forceOutcome;
  const rider = await prisma.user.findUnique({ where: { id: riderId } });
  if (rider?.phone.endsWith('0000')) return PaymentOutcome.DECLINED;
  if (rider?.phone.endsWith('9999')) return PaymentOutcome.TIMEOUT;
  return PaymentOutcome.APPROVED;
}

function resolveDelayFor(outcome: PaymentOutcome): number {
  if (outcome === PaymentOutcome.TIMEOUT) return TIMEOUT_MS; // exactly 90s, per spec
  if (outcome === PaymentOutcome.DECLINED) return randomDelayMs(1000, 3000);
  return randomDelayMs(3000, 8000); // APPROVED — mirrors a real MoMo PIN prompt
}

export async function initiateCollection(params: {
  riderId: string;
  amountCedis: number;
  reference: string;
  idempotencyKey: string;
  forceOutcome?: PaymentOutcome;
}) {
  // Duplicate submit returns the original intentId, never a second charge.
  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
  if (existing) return { intentId: existing.id, status: PaymentOutcome.PENDING };

  const outcome = await resolveOutcome(params.riderId, params.forceOutcome);
  const intent = await prisma.paymentIntent.create({
    data: {
      riderId: params.riderId,
      amountCedis: params.amountCedis,
      reference: params.reference,
      idempotencyKey: params.idempotencyKey,
      status: PaymentOutcome.PENDING,
      outcome,
      resolvesAt: new Date(Date.now() + resolveDelayFor(outcome)),
    },
  });

  return { intentId: intent.id, status: PaymentOutcome.PENDING };
}

export async function getCollectionStatus(intentId: string): Promise<PaymentOutcome> {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new Error('Payment intent not found');
  if (intent.status === PaymentOutcome.PENDING && intent.resolvesAt <= new Date()) {
    const updated = await prisma.paymentIntent.update({ where: { id: intentId }, data: { status: intent.outcome } });
    return updated.status;
  }
  return intent.status;
}

export async function refund(intentId: string, amountCedis: number, reason: string) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new Error('Payment intent not found');
  if (intent.status !== PaymentOutcome.APPROVED) throw new Error('Cannot refund an intent that was never approved');
  if (amountCedis > intent.amountCedis) throw new Error('Refund exceeds the original amount');

  const record = await prisma.refund.create({
    data: {
      intentId,
      amountCedis,
      reason,
      status: PaymentOutcome.PENDING,
      resolvesAt: new Date(Date.now() + randomDelayMs(2000, 5000)),
    },
  });
  return { refundId: record.id, status: PaymentOutcome.PENDING };
}

export async function getRefundStatus(refundId: string): Promise<PaymentOutcome> {
  const record = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!record) throw new Error('Refund not found');
  if (record.status === PaymentOutcome.PENDING && record.resolvesAt <= new Date()) {
    const updated = await prisma.refund.update({ where: { id: refundId }, data: { status: PaymentOutcome.APPROVED } });
    return updated.status;
  }
  return record.status;
}

// Also needs a failing case (wrong number, dormant wallet) — there is no
// real payee/wallet model yet to validate against, so a `FAIL` marker in
// the reference triggers it for testing.
export async function payout(payeeId: string, amountCedis: number, reference: string) {
  const willFail = reference.includes('FAIL');
  const record = await prisma.payout.create({
    data: {
      payeeId,
      amountCedis,
      reference,
      status: PaymentOutcome.PENDING,
      failReason: willFail ? 'dormant_wallet' : null,
      resolvesAt: new Date(Date.now() + randomDelayMs(2000, 5000)),
    },
  });
  return { payoutId: record.id, status: PaymentOutcome.PENDING };
}

export async function getPayoutStatus(payoutId: string): Promise<PaymentOutcome> {
  const record = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!record) throw new Error('Payout not found');
  if (record.status === PaymentOutcome.PENDING && record.resolvesAt <= new Date()) {
    const finalStatus = record.failReason ? PaymentOutcome.DECLINED : PaymentOutcome.APPROVED;
    const updated = await prisma.payout.update({ where: { id: payoutId }, data: { status: finalStatus } });
    return updated.status;
  }
  return record.status;
}

// Stub — there is no per-account balance ledger yet (that's the
// Operator/Partner payout ledger, steps 9/10). Wire this once payouts
// have a real source of truth to sum against.
export async function getBalance(_accountId: string): Promise<{ available: number; held: number }> {
  return { available: 0, held: 0 };
}
