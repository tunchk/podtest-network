import { prisma } from "@/lib/db";

/**
 * Host access is server-owned. Paid plans, HIRING status, or client role claims
 * never grant host capability.
 */
export async function isAuthorizedHost(userId: string) {
  const row = await prisma.hostAuthorization.findUnique({ where: { userId } });
  return Boolean(row && !row.revokedAt);
}

export async function requireAuthorizedHost(userId: string) {
  const ok = await isAuthorizedHost(userId);
  if (!ok) throw new Error("HOST_FORBIDDEN");
}

export async function grantHostAuthorization(options: {
  userId: string;
  grantedByUserId: string;
  provenance: string;
}) {
  const existing = await prisma.hostAuthorization.findUnique({
    where: { userId: options.userId },
  });
  if (existing && !existing.revokedAt) {
    return existing;
  }
  if (existing?.revokedAt) {
    return prisma.hostAuthorization.update({
      where: { userId: options.userId },
      data: {
        revokedAt: null,
        grantedByUserId: options.grantedByUserId,
        provenance: options.provenance,
        createdAt: new Date(),
      },
    });
  }
  return prisma.hostAuthorization.create({
    data: {
      userId: options.userId,
      grantedByUserId: options.grantedByUserId,
      provenance: options.provenance,
    },
  });
}

export async function revokeHostAuthorization(userId: string) {
  return prisma.hostAuthorization.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Assigned host for a non-withdrawn application, with live host authorization.
 * Reassignment and withdrawal revoke access on subsequent checks (pages, APIs, exports).
 */
export async function canHostAccessApplication(options: {
  hostUserId: string;
  applicationId: string;
}) {
  const app = await prisma.arayanlarApplication.findUnique({
    where: { id: options.applicationId },
  });
  if (!app) return { ok: false as const, reason: "not_found" };
  if (app.status === "WITHDRAWN") return { ok: false as const, reason: "withdrawn" };
  if (app.assignedHostUserId !== options.hostUserId) {
    return { ok: false as const, reason: "not_assigned" };
  }
  if (!(await isAuthorizedHost(options.hostUserId))) {
    return { ok: false as const, reason: "not_authorized_host" };
  }
  return { ok: true as const, application: app };
}

/** Deny host-pack job result payloads to non-assigned callers. */
export async function canHostReadPrepareJob(options: {
  hostUserId: string;
  jobId: string;
}) {
  const job = await prisma.aiJob.findUnique({ where: { id: options.jobId } });
  if (!job || job.kind !== "ARAYANLAR_PREPARE") {
    return { ok: false as const, reason: "not_found" };
  }
  if (!job.arayanlarApplicationId) return { ok: false as const, reason: "not_found" };
  return canHostAccessApplication({
    hostUserId: options.hostUserId,
    applicationId: job.arayanlarApplicationId,
  });
}
