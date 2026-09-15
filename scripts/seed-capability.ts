import "dotenv/config";
import { prisma } from "../src/lib/db";
import { seedDevCapabilityGrant } from "../src/lib/capabilities/evaluate";

async function main() {
  const email = process.argv[2];
  const capabilityKey = process.argv[3] ?? "ai.profile.prepare";

  if (!email) {
    console.error("Usage: npm run seed:capability -- user@example.com [capabilityKey]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  const grant = await seedDevCapabilityGrant({
    userId: user.id,
    capabilityKey: capabilityKey as "ai.profile.prepare",
    provenance: `dev-seed-cli:${new Date().toISOString()}`,
  });

  console.log(`Granted ${grant.capabilityKey} to ${user.email} (${grant.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
