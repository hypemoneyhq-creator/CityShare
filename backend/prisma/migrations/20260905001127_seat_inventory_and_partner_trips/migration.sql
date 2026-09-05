/*
  Warnings:

  - Added the required column `capacity` to the `Run` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "capacity" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "flatFareCedis" INTEGER;

-- AlterTable
ALTER TABLE "StopProfile" ADD COLUMN     "legFareCedis" INTEGER;

-- CreateTable
CREATE TABLE "SeatHold" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "boardStopId" TEXT NOT NULL,
    "alightStopId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'PENDING',
    "riderId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTrip" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "corridorId" TEXT,
    "originName" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationName" TEXT NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLng" DOUBLE PRECISION NOT NULL,
    "departAt" TIMESTAMP(3) NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "farePerSeatCedis" INTEGER NOT NULL,
    "vehicleDescription" TEXT NOT NULL,
    "comfortAc" BOOLEAN NOT NULL DEFAULT false,
    "comfortUsb" BOOLEAN NOT NULL DEFAULT false,
    "comfortBoot" BOOLEAN NOT NULL DEFAULT false,
    "status" "RunStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSeatHold" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'PENDING',
    "riderId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSeatHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatHold_runId_status_idx" ON "SeatHold"("runId", "status");

-- CreateIndex
CREATE INDEX "PartnerSeatHold_tripId_status_idx" ON "PartnerSeatHold"("tripId", "status");

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTrip" ADD CONSTRAINT "PartnerTrip_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTrip" ADD CONSTRAINT "PartnerTrip_corridorId_fkey" FOREIGN KEY ("corridorId") REFERENCES "Corridor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSeatHold" ADD CONSTRAINT "PartnerSeatHold_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "PartnerTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSeatHold" ADD CONSTRAINT "PartnerSeatHold_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
