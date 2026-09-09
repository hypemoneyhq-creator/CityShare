-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('APPLICATION', 'CERTIFYING', 'CERTIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OperatorDocKey" AS ENUM ('RGD_CERTIFICATE', 'TRANSPORT_LICENCE', 'DRIVER_ROSTER', 'INSURANCE_ENDORSEMENT', 'SAFETY_STANDARD_AGREEMENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "operatorId" TEXT;

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "registeredName" TEXT NOT NULL,
    "rgdNumber" TEXT,
    "operatingSince" INTEGER,
    "contactName" TEXT,
    "contactUserId" TEXT NOT NULL,
    "status" "OperatorStatus" NOT NULL DEFAULT 'APPLICATION',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorVehicle" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorCorridorInterest" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "corridorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorCorridorInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorDocument" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "key" "OperatorDocKey" NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_contactUserId_key" ON "Operator"("contactUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorCorridorInterest_operatorId_corridorId_key" ON "OperatorCorridorInterest"("operatorId", "corridorId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorDocument_operatorId_key_key" ON "OperatorDocument"("operatorId", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "OperatorVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorVehicle" ADD CONSTRAINT "OperatorVehicle_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorCorridorInterest" ADD CONSTRAINT "OperatorCorridorInterest_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorCorridorInterest" ADD CONSTRAINT "OperatorCorridorInterest_corridorId_fkey" FOREIGN KEY ("corridorId") REFERENCES "Corridor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorDocument" ADD CONSTRAINT "OperatorDocument_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
