/*
  Warnings:

  - Added the required column `fareCedis` to the `PartnerSeatHold` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fareCedis` to the `SeatHold` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentOutcome" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "BookingKind" AS ENUM ('RUN', 'PARTNER');

-- CreateEnum
CREATE TYPE "EscrowState" AS ENUM ('PENDING', 'HELD', 'RELEASABLE', 'DISPUTED', 'REFUNDING', 'REFUNDED', 'FORFEIT', 'SETTLED', 'VOID');

-- CreateEnum
CREATE TYPE "EscrowActorType" AS ENUM ('SYSTEM', 'RIDER', 'DRIVER', 'OPS');

-- AlterTable
ALTER TABLE "PartnerSeatHold" ADD COLUMN     "fareCedis" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "SeatHold" ADD COLUMN     "fareCedis" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isOps" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "amountCedis" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentOutcome" NOT NULL DEFAULT 'PENDING',
    "outcome" "PaymentOutcome" NOT NULL,
    "resolvesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "amountCedis" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PaymentOutcome" NOT NULL DEFAULT 'PENDING',
    "resolvesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "amountCedis" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentOutcome" NOT NULL DEFAULT 'PENDING',
    "failReason" TEXT,
    "resolvesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "kind" "BookingKind" NOT NULL,
    "riderId" TEXT NOT NULL,
    "runHoldId" TEXT,
    "partnerHoldId" TEXT,
    "seats" INTEGER NOT NULL,
    "fareCedis" INTEGER NOT NULL,
    "boardingCode" TEXT,
    "paymentIntentId" TEXT NOT NULL,
    "driverBoardedAt" TIMESTAMP(3),
    "riderBoardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escrow" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "state" "EscrowState" NOT NULL DEFAULT 'PENDING',
    "amountCedis" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowLedgerEntry" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "fromState" "EscrowState",
    "toState" "EscrowState" NOT NULL,
    "actorType" "EscrowActorType" NOT NULL,
    "actorId" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscrowLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_idempotencyKey_key" ON "PaymentIntent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_runHoldId_key" ON "Booking"("runHoldId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_partnerHoldId_key" ON "Booking"("partnerHoldId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_paymentIntentId_key" ON "Booking"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Escrow_bookingId_key" ON "Escrow"("bookingId");

-- CreateIndex
CREATE INDEX "EscrowLedgerEntry_escrowId_idx" ON "EscrowLedgerEntry"("escrowId");

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_runHoldId_fkey" FOREIGN KEY ("runHoldId") REFERENCES "SeatHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_partnerHoldId_fkey" FOREIGN KEY ("partnerHoldId") REFERENCES "PartnerSeatHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowLedgerEntry" ADD CONSTRAINT "EscrowLedgerEntry_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "Escrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
