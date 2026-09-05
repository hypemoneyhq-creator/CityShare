-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "driverBoardLat" DOUBLE PRECISION,
ADD COLUMN     "driverBoardLng" DOUBLE PRECISION,
ADD COLUMN     "riderBoardLat" DOUBLE PRECISION,
ADD COLUMN     "riderBoardLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationPing_bookingId_idx" ON "LocationPing"("bookingId");

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
