import { prisma } from "@/lib/db";

export type HealthResult =
  | { ok: true; status: 200 }
  | { ok: false; status: 503 };

/**
 * Minimal production health probe: process alive + database reachable.
 * Never returns connection strings, stack traces, or environment values.
 */
export async function checkHealth(options?: {
  ping?: () => Promise<unknown>;
}): Promise<HealthResult> {
  try {
    await (options?.ping ?? (() => prisma.$queryRaw`SELECT 1`))();
    return { ok: true, status: 200 };
  } catch {
    return { ok: false, status: 503 };
  }
}
