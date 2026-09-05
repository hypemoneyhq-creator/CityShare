-- CreateTable
CREATE TABLE "BookingTransfer" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromRiderId" TEXT NOT NULL,
    "toRiderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingTransfer_bookingId_idx" ON "BookingTransfer"("bookingId");

-- AddForeignKey
ALTER TABLE "BookingTransfer" ADD CONSTRAINT "BookingTransfer_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
