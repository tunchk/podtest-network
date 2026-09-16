import { prisma } from "@/lib/db";
import type { AiUsagePolicy } from "@/generated/prisma/client";

export type { AiUsagePolicy };

export async function getAiUsagePolicy(userId: string): Promise<AiUsagePolicy> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiUsagePolicy: true },
  });
  return user?.aiUsagePolicy ?? "STANDARD";
}

export async function isUnlimitedAiUsage(userId: string): Promise<boolean> {
  return (await getAiUsagePolicy(userId)) === "UNLIMITED_INTERNAL";
}

/**
 * Ops-only policy change. Email is used solely to resolve the user once;
 * the persisted field is on the stable user id.
 */
export async function setAiUsagePolicyByEmail(options: {
  email: string;
  policy: AiUsagePolicy;
}) {
  const email = options.email.trim().toLowerCase();
  if (!email) {
    throw new Error("EMAIL_REQUIRED");
  }
  if (options.policy !== "STANDARD" && options.policy !== "UNLIMITED_INTERNAL") {
    throw new Error("INVALID_POLICY");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, aiUsagePolicy: true, staffRole: true },
  });
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (user.aiUsagePolicy === options.policy) {
    return { user, previous: user.aiUsagePolicy, next: user.aiUsagePolicy, changed: false as const };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { aiUsagePolicy: options.policy },
    select: { id: true, email: true, aiUsagePolicy: true, staffRole: true },
  });

  return {
    user: updated,
    previous: user.aiUsagePolicy,
    next: updated.aiUsagePolicy,
    changed: true as const,
  };
}
