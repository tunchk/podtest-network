import { loadAppEnvironment } from "../src/lib/env/load-app-env";

loadAppEnvironment();

/**
 * Bootstrap host authorization for an existing account identity.
 * Does not hardcode an email — pass it as argv.
 *
 * Usage:
 *   npm run bootstrap:host -- user@example.com --by admin@example.com
 *   npm run bootstrap:host -- user@example.com --by admin@example.com --mark-email-verified
 *
 * Granter must be ADMIN. `--mark-email-verified` is ops-only for trusted production
 * bootstrap when outbound verification email is unavailable. Never alters staffRole.
 */
async function main() {
  const { prisma } = await import("../src/lib/db");
  const { bootstrapHostAuthorization } = await import("../src/lib/arayanlar/bootstrap-host");

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const markEmailVerified = args.includes("--mark-email-verified");
  const byIdx = args.indexOf("--by");
  const byEmail = byIdx >= 0 ? args[byIdx + 1] : undefined;
  const skip = new Set(["--mark-email-verified", "--by"]);
  if (byEmail) skip.add(byEmail);
  const email = args.find((a) => !skip.has(a) && !a.startsWith("--"));

  if (!email || !byEmail || byEmail.startsWith("--")) {
    console.error(
      "Usage: npm run bootstrap:host -- user@example.com --by admin@example.com [--mark-email-verified]",
    );
    process.exit(1);
  }

  try {
    const result = await bootstrapHostAuthorization({
      targetEmail: email,
      granterEmail: byEmail,
      markEmailVerified,
    });
    console.log(
      `Host authorization granted to ${result.email} (${result.userId}) by ${byEmail}`,
    );
    if (result.emailVerifiedMarked) {
      console.log("emailVerified marked true (ops flag --mark-email-verified)");
    }
    if (result.alreadyAuthorized) {
      console.log("authorization already active (idempotent)");
    }
    console.log(`authorization id=${result.authorizationId}`);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? String((error as { code: string }).code) : null;
    console.error(error instanceof Error ? error.message : error);
    if (code) console.error(`code=${code}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
