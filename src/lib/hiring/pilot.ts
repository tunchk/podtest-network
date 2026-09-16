import { prisma } from "@/lib/db";
import { assertKnownCapability, type CapabilityKey } from "@/lib/capabilities/catalog";
import { HIRING_PILOT_CAPABILITY_KEYS, HIRING_PILOT_PROVENANCE } from "@/lib/hiring/constants";

/**
 * Idempotent free-pilot grants. Separate from future commercial EMPLOYER plans.
 * Does not mark users as paid subscribers.
 */
export async function ensureHiringPilotGrants(userId: string) {
  for (const key of HIRING_PILOT_CAPABILITY_KEYS) {
    if (!assertKnownCapability(key)) continue;
    const existing = await prisma.capabilityGrant.findFirst({
      where: {
        userId,
        capabilityKey: key,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (existing) continue;
    await prisma.capabilityGrant.create({
      data: {
        userId,
        capabilityKey: key,
        source: "PROMOTIONAL",
        planCode: null,
        provenance: HIRING_PILOT_PROVENANCE,
        expiresAt: null,
      },
    });
  }
}

export async function listHiringPilotGrants(userId: string) {
  return prisma.capabilityGrant.findMany({
    where: {
      userId,
      capabilityKey: { in: [...HIRING_PILOT_CAPABILITY_KEYS] },
      provenance: HIRING_PILOT_PROVENANCE,
    },
    orderBy: { createdAt: "asc" },
  });
}

export function isHiringPilotKey(key: string): key is CapabilityKey {
  return (HIRING_PILOT_CAPABILITY_KEYS as readonly string[]).includes(key);
}
