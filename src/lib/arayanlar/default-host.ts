/**
 * Server-only default host for Kariyer Portresi handoff (v1: single host).
 * Do not import from client components.
 */

import { prisma } from "@/lib/db";
import { isAuthorizedHost } from "@/lib/arayanlar/host-auth";

export type DefaultHostResolution =
  | { ok: true; userId: string; name: string }
  | { ok: false; code: "HOST_NOT_CONFIGURED" | "HOST_NOT_FOUND" | "HOST_NOT_AUTHORIZED"; message: string };

/**
 * Resolve the fixed Kariyer Portresi host from env.
 * Requires an active hostAuthorization row — staff role alone is not enough.
 */
export async function resolveDefaultKariyerPortresiHost(): Promise<DefaultHostResolution> {
  const userId = process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID?.trim();
  if (!userId) {
    return {
      ok: false,
      code: "HOST_NOT_CONFIGURED",
      message: "Host henüz yapılandırılmadı. Lütfen daha sonra tekrar dene.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) {
    return {
      ok: false,
      code: "HOST_NOT_FOUND",
      message: "Host henüz yapılandırılmadı. Lütfen daha sonra tekrar dene.",
    };
  }

  if (!(await isAuthorizedHost(user.id))) {
    return {
      ok: false,
      code: "HOST_NOT_AUTHORIZED",
      message: "Host henüz yapılandırılmadı. Lütfen daha sonra tekrar dene.",
    };
  }

  return { ok: true, userId: user.id, name: user.name };
}

export function hostPrepNotesPath(applicationId: string) {
  return `/sunucu/basvurular/${applicationId}/notlar`;
}

export function hostHandoffIdempotencyKey(options: {
  applicationId: string;
  revision: number;
  hostUserId: string;
}) {
  return `kariyer-portresi-handoff:${options.applicationId}:r${options.revision}:${options.hostUserId}`;
}
