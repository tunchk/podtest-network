import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Bump when ArayanlarApplication withdraw fields change — forces singleton rebuild. */
export const PRISMA_CLIENT_GENERATION = "arayanlar-withdraw-v2";

const globalGen = globalThis as unknown as {
  prismaGeneration?: string;
};

export const ARAYANLAR_WITHDRAW_FIELDS = [
  "assignedHostUserId",
  "assignedAt",
  "assignedByUserId",
  "recordingScheduledAt",
  "recordingTimezone",
  "recordingMeetingUrl",
  "recordingSchedulingNote",
  "recordingScheduledByUserId",
  "recordingScheduleUpdatedAt",
  "recordingScheduleVersion",
  "publicationReviewRequestedAt",
  "publicationReviewVersionId",
  "publicationChangeRequestNote",
  "publicationChangeRequestedAt",
] as const;

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export function runtimeModelFieldNames(client: PrismaClient, model: string): string[] | null {
  const runtime = client as unknown as {
    _runtimeDataModel?: {
      models?: Record<string, { fields?: Array<{ name: string }> }>;
    };
  };
  const fields = runtime._runtimeDataModel?.models?.[model]?.fields;
  if (!Array.isArray(fields)) return null;
  return fields.map((f) => f.name);
}

function arayanlarWithdrawFieldsOk(client: PrismaClient): boolean {
  const fields = runtimeModelFieldNames(client, "ArayanlarApplication");
  // Fail closed when introspection is available and incomplete.
  if (!fields) return true; // freshly constructed engines may omit introspection briefly
  return ARAYANLAR_WITHDRAW_FIELDS.every((f) => fields.includes(f));
}

function hasRequiredDelegates(client: PrismaClient) {
  const c = client as unknown as {
    legalDocument?: { upsert?: unknown };
    legalAcceptance?: { create?: unknown };
    arayanlarApplication?: { update?: unknown };
  };
  if (typeof c.legalDocument?.upsert !== "function") return false;
  if (typeof c.legalAcceptance?.create !== "function") return false;
  if (typeof c.arayanlarApplication?.update !== "function") return false;
  if (globalGen.prismaGeneration !== PRISMA_CLIENT_GENERATION) return false;
  return arayanlarWithdrawFieldsOk(client);
}

/** Drop the global singleton so the next access rebuilds from the current generated client. */
export function invalidatePrismaClient() {
  const existing = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  globalGen.prismaGeneration = undefined;
  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }
}

function getPrismaClient() {
  const existing = globalForPrisma.prisma;
  if (existing && hasRequiredDelegates(existing)) {
    return existing;
  }

  if (existing) {
    void existing.$disconnect().catch(() => undefined);
    globalForPrisma.prisma = undefined;
  }

  const client = createPrismaClient();
  const fields = runtimeModelFieldNames(client, "ArayanlarApplication");
  if (fields && !ARAYANLAR_WITHDRAW_FIELDS.every((f) => fields.includes(f))) {
    throw new Error(
      "Prisma Client is stale or incomplete (ArayanlarApplication withdraw fields). Run `npm run db:generate` and restart the Next.js process.",
    );
  }

  globalGen.prismaGeneration = PRISMA_CLIENT_GENERATION;
  globalForPrisma.prisma = client;
  return client;
}

/**
 * Lazy proxy so callers never keep a stale client object reference after
 * schema/client regeneration during `next dev` hot reload.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
