-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDriver" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RunStopEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "departedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunStopEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunIncident" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RunStopEvent_runId_stopId_key" ON "RunStopEvent"("runId", "stopId");

-- CreateIndex
CREATE INDEX "RunIncident_runId_idx" ON "RunIncident"("runId");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStopEvent" ADD CONSTRAINT "RunStopEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunIncident" ADD CONSTRAINT "RunIncident_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
