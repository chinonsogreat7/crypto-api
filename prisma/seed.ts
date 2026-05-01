import { prisma } from "../src/data/prisma";
import { seedDatabase } from "../src/data/persistence";

async function main() {
  await seedDatabase();
  console.log("Database seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
