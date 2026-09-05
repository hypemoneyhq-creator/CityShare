import { EscrowActorType, EscrowState, Prisma } from '@prisma/client';
import { prisma } from '../db';

export class EscrowError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Spec section 3's state table, transcribed directly:
//   PENDING    -> HELD, VOID
//   HELD       -> RELEASABLE, REFUNDING, DISPUTED, FORFEIT
//   RELEASABLE -> SETTLED
//   DISPUTED   -> RELEASABLE, REFUNDING
//   REFUNDING  -> REFUNDED
//   FORFEIT    -> SETTLED
// REFUNDED, SETTLED and VOID are terminal.
const TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  PENDING: [EscrowState.HELD, EscrowState.VOID],
  HELD: [EscrowState.RELEASABLE, EscrowState.REFUNDING, EscrowState.DISPUTED, EscrowState.FORFEIT],
  RELEASABLE: [EscrowState.SETTLED],
  DISPUTED: [EscrowState.RELEASABLE, EscrowState.REFUNDING],
  REFUNDING: [EscrowState.REFUNDED],
  REFUNDED: [],
  FORFEIT: [EscrowState.SETTLED],
  SETTLED: [],
  VOID: [],
};

export async function createEscrowForBooking(params: {
  bookingId: string;
  amountCedis: number;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  const escrow = await db.escrow.create({
    data: { bookingId: params.bookingId, amountCedis: params.amountCedis, state: EscrowState.PENDING },
  });
  await db.escrowLedgerEntry.create({
    data: {
      escrowId: escrow.id,
      fromState: null,
      toState: EscrowState.PENDING,
      actorType: EscrowActorType.SYSTEM,
      evidence: { reason: 'booking_created' },
    },
  });
  return escrow;
}

// Runs the state check, the update and the append-only ledger write in
// one transaction so Escrow.state and its ledger can never disagree.
export async function transitionEscrow(params: {
  escrowId: string;
  toState: EscrowState;
  actorType: EscrowActorType;
  actorId?: string;
  evidence?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}) {
  const run = async (tx: Prisma.TransactionClient) => {
    const escrow = await tx.escrow.findUnique({ where: { id: params.escrowId } });
    if (!escrow) throw new EscrowError('not_found', 'Escrow not found');

    const allowed = TRANSITIONS[escrow.state];
    if (!allowed.includes(params.toState)) {
      throw new EscrowError('invalid_transition', `Cannot move from ${escrow.state} to ${params.toState}`);
    }

    // Invariant (spec section 3): DISPUTED is terminal until a human
    // resolves it — no timer or automated process may exit it.
    if (escrow.state === EscrowState.DISPUTED && params.actorType !== EscrowActorType.OPS) {
      throw new EscrowError('requires_ops', 'Only ops can resolve a disputed escrow');
    }

    const updated = await tx.escrow.update({ where: { id: params.escrowId }, data: { state: params.toState } });

    await tx.escrowLedgerEntry.create({
      data: {
        escrowId: params.escrowId,
        fromState: escrow.state,
        toState: params.toState,
        actorType: params.actorType,
        actorId: params.actorId,
        evidence: params.evidence,
      },
    });

    return updated;
  };

  return params.tx ? run(params.tx) : prisma.$transaction(run);
}
