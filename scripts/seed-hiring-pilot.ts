import "dotenv/config";
import { prisma } from "../src/lib/db";
import { ensureHiringPilotGrants } from "../src/lib/hiring/pilot";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/seed-hiring-pilot.ts user@example.com");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`No user for ${email}`);
    process.exit(1);
  }
  await ensureHiringPilotGrants(user.id);
  console.log(`Hiring pilot grants ensured for ${user.email} (provenance hiring_pilot_v1)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
