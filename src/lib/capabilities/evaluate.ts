import { prisma } from "@/lib/db";
import {
  assertKnownCapability,
  evaluateCapability,
  type CapabilityEvaluation,
  type CapabilityKey,
} from "@/lib/capabilities/catalog";

export async function listActiveGrantsForUser(userId: string) {
  return prisma.capabilityGrant.findMany({
    where: {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}

export async function evaluateUserCapability(
  userId: string,
  capabilityKey: string,
): Promise<CapabilityEvaluation> {
  if (!assertKnownCapability(capabilityKey)) {
    return {
      allowed: false,
      reason: "unknown_capability",
      capabilityKey,
    };
  }

  const grants = await prisma.capabilityGrant.findMany({
    where: { userId, capabilityKey },
    select: {
      capabilityKey: true,
      source: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  return evaluateCapability({
    capabilityKey,
    grants,
  });
}

export async function requireCapability(userId: string, capabilityKey: CapabilityKey) {
  const result = await evaluateUserCapability(userId, capabilityKey);
  if (!result.allowed) {
    const error = new Error(`Capability denied: ${capabilityKey} (${result.reason})`);
    (error as Error & { code: string }).code = "CAPABILITY_DENIED";
    throw error;
  }
  return result;
}

/**
 * Development-only seed helper. Never exposed as a client-accessible plan switch.
 */
export async function seedDevCapabilityGrant(options: {
  userId: string;
  capabilityKey: CapabilityKey;
  provenance: string;
  expiresAt?: Date | null;
}) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev capability seeding is disabled in production");
  }

  return prisma.capabilityGrant.create({
    data: {
      userId: options.userId,
      capabilityKey: options.capabilityKey,
      source: "DEV_SEED",
      planCode: null,
      provenance: options.provenance,
      expiresAt: options.expiresAt ?? null,
    },
  });
}
