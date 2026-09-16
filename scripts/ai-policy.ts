import "dotenv/config";
import { prisma } from "../src/lib/db";
import { setAiUsagePolicyByEmail } from "../src/lib/ai/usage-policy";
import type { AiUsagePolicy } from "../src/generated/prisma/client";

function usage() {
  console.error("Usage: npm run ai-policy -- <email> <unlimited|standard>");
  process.exit(1);
}

function parsePolicy(raw: string | undefined): AiUsagePolicy {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "unlimited" || value === "unlimited_internal") {
    return "UNLIMITED_INTERNAL";
  }
  if (value === "standard") {
    return "STANDARD";
  }
  usage();
  return "STANDARD";
}

async function main() {
  const email = process.argv[2];
  const policyArg = process.argv[3];
  if (!email || !policyArg) usage();

  const policy = parsePolicy(policyArg);

  try {
    const result = await setAiUsagePolicyByEmail({ email, policy });
    console.log(
      [
        `userId=${result.user.id}`,
        `email=${result.user.email}`,
        `staffRole=${result.user.staffRole}`,
        `previous=${result.previous}`,
        `next=${result.next}`,
        `changed=${result.changed}`,
      ].join(" "),
    );
    if (!result.changed) {
      console.log("Idempotent: policy already set.");
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "ERROR";
    if (code === "USER_NOT_FOUND") {
      console.error(`No user found for ${email}`);
      process.exit(1);
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
