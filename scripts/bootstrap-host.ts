import { loadAppEnvironment } from "../src/lib/env/load-app-env";

loadAppEnvironment();

/**
 * Bootstrap host authorization for an existing verified account identity.
 * Does not hardcode an email — pass it as argv.
 *
 * Usage:
 *   npm run bootstrap:host -- user@example.com
 *   npm run bootstrap:host -- user@example.com --by admin@example.com
 */
async function main() {
  const { prisma } = await import("../src/lib/db");
  const { grantHostAuthorization } = await import("../src/lib/arayanlar/host-auth");

  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run bootstrap:host -- user@example.com [--by granter@example.com]");
    process.exit(1);
  }

  const byIdx = process.argv.indexOf("--by");
  const byEmail = byIdx >= 0 ? process.argv[byIdx + 1] : email;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }
  if (!user.emailVerified) {
    console.error(`User ${email} is not emailVerified. Verify the account first.`);
    process.exit(1);
  }

  const granter = await prisma.user.findUnique({ where: { email: (byEmail ?? email).toLowerCase() } });
  if (!granter) {
    console.error(`Granter not found: ${byEmail}`);
    process.exit(1);
  }

  const authz = await grantHostAuthorization({
    userId: user.id,
    grantedByUserId: granter.id,
    provenance: `bootstrap-host-script:${granter.email}`,
  });

  console.log(`Host authorization granted to ${user.email} (${user.id}) by ${granter.email}`);
  console.log(`authorization id=${authz.id}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
