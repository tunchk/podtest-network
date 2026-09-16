import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

function hasRequiredDelegates(client: PrismaClient) {
  const c = client as unknown as {
    legalDocument?: { upsert?: unknown };
    legalAcceptance?: { create?: unknown };
  };
  return typeof c.legalDocument?.upsert === "function" && typeof c.legalAcceptance?.create === "function";
}

/**
 * Next.js `next dev` can keep a PrismaClient singleton constructed before
 * `prisma generate` added new models. Access then yields undefined delegates
 * (e.g. `prisma.legalDocument.upsert` → Cannot read properties of undefined).
 */
function getPrismaClient() {
  const existing = globalForPrisma.prisma;
  if (existing && hasRequiredDelegates(existing)) {
    return existing;
  }

  const client = createPrismaClient();
  if (!hasRequiredDelegates(client)) {
    throw new Error(
      "Prisma Client is missing LegalDocument/LegalAcceptance delegates. Run `npx prisma generate` and restart the Next.js process.",
    );
  }

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
