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

  const k01 = await prisma.service.create({
    data: {
      corridorId: western.id,
      code: 'K01',
      name: 'Express Direct',
      type: ServiceType.DIRECT,
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
          },
          {
            name: 'Circle',
            sequence: 3,
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

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.run.createMany({
    data: [
      { serviceId: k01.id, date: today },
      { serviceId: k02.id, date: today },
    ],
  });

  console.log(`Seeded corridor "${western.name}" with services ${k01.code}, ${k02.code}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
