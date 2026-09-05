import { PrismaClient, ServiceType } from '@prisma/client';

const prisma = new PrismaClient();

// Matches the Western corridor example used throughout the design
// prototypes (CityShare App.dc.html, stopFare / times) so the seeded data
// lines up with what the screens show: Kasoa -> Mallam -> Kaneshie ->
// Circle, K01 running direct, K02 stopping at all four.
async function main() {
  const western = await prisma.corridor.create({
    data: { name: 'Western', origin: 'Kasoa', destination: 'Circle' },
  });

  // Flat fare, matching the design's Express Direct example (18 cedis).
  const k01 = await prisma.service.create({
    data: {
      corridorId: western.id,
      code: 'K01',
      name: 'Express Direct',
      type: ServiceType.DIRECT,
      flatFareCedis: 18,
      stops: {
        create: [
          {
            name: 'Kasoa',
            sequence: 0,
            lat: 5.5301,
            lng: -0.4231,
            scheduledDeparture: '06:15',
            boardAllowed: true,
            alightAllowed: false,
          },
          {
            name: 'Circle',
            sequence: 1,
            lat: 5.5717,
            lng: -0.2107,
            scheduledArrival: '07:15',
            boardAllowed: false,
            alightAllowed: true,
          },
        ],
      },
    },
  });

  // Per-leg fares, matching the design's stopFare example (6 / 4 / 4 cedis).
  const k02 = await prisma.service.create({
    data: {
      corridorId: western.id,
      code: 'K02',
      name: 'Express Stops',
      type: ServiceType.STOPS,
      stops: {
        create: [
          {
            name: 'Kasoa',
            sequence: 0,
            lat: 5.5301,
            lng: -0.4231,
            scheduledDeparture: '06:18',
            boardAllowed: true,
            alightAllowed: false,
          },
          {
            name: 'Mallam',
            sequence: 1,
            lat: 5.5686,
            lng: -0.2762,
            scheduledArrival: '06:40',
            scheduledDeparture: '06:43',
            boardAllowed: true,
            alightAllowed: true,
            legFareCedis: 6,
          },
          {
            name: 'Kaneshie',
            sequence: 2,
            lat: 5.5638,
            lng: -0.2412,
            scheduledArrival: '07:00',
            scheduledDeparture: '07:03',
            boardAllowed: true,
            alightAllowed: true,
            legFareCedis: 4,
          },
          {
            name: 'Circle',
            sequence: 3,
            lat: 5.5717,
            lng: -0.2107,
            scheduledArrival: '07:15',
            boardAllowed: false,
            alightAllowed: true,
            legFareCedis: 4,
          },
        ],
      },
    },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 11-seater Hyundai H1s on both Express services, matching the design copy.
  await prisma.run.createMany({
    data: [
      { serviceId: k01.id, date: today, capacity: 11 },
      { serviceId: k02.id, date: today, capacity: 11 },
    ],
  });

  // A Partner trip on the same corridor, matching the design's Partner card
  // example: Kwame A., Toyota Corolla, 4 seats, 20 cedis, Total Kasoa Toll.
  const kwame = await prisma.user.create({
    data: {
      phone: '+233241110001',
      firstName: 'Kwame',
      lastName: 'Asante',
      phoneVerifiedAt: new Date(),
      ghanaCardVerifiedAt: new Date(),
      selfieVerifiedAt: new Date(),
      isPartner: true,
    },
  });

  await prisma.partnerTrip.create({
    data: {
      partnerId: kwame.id,
      corridorId: western.id,
      originName: 'Total Kasoa Toll',
      originLat: 5.5301,
      originLng: -0.4231,
      destinationName: 'Circle',
      destLat: 5.5717,
      destLng: -0.2107,
      departAt: new Date(today.getTime() + 6.5 * 60 * 60 * 1000), // 06:30
      seatsTotal: 4,
      farePerSeatCedis: 20,
      vehicleDescription: 'Toyota Corolla · silver',
      comfortAc: true,
      comfortUsb: true,
      comfortBoot: true,
    },
  });

  console.log(`Seeded corridor "${western.name}" with services ${k01.code}, ${k02.code}, and a Partner trip.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
