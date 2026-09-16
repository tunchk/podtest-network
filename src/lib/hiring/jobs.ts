import { prisma } from "@/lib/db";
import type {
  JobApplicationMethod,
  JobEmploymentType,
  JobRemoteType,
  JobSalaryPeriod,
  Prisma,
} from "@/generated/prisma/client";
import { classifyCommunityContent } from "@/lib/community/moderation";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { requireWorkspaceMember } from "@/lib/hiring/access";
import {
  HIRING_ACTIVE_JOBS_PER_WORKSPACE,
  HIRING_JOB_BODY_MAX,
  HIRING_JOB_TITLE_MAX,
  HIRING_MODERATION_ADAPTER,
  HIRING_MODERATION_POLICY_VERSION,
} from "@/lib/hiring/constants";
import { isMessagingTemporarilyRestricted } from "@/lib/messaging/preferences";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function slugify(title: string, suffix: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "ilan"}-${suffix}`;
}

export type JobDraftInput = {
  title: string;
  description: string;
  responsibilities?: string | null;
  skills?: string[];
  location?: string | null;
  remoteType?: JobRemoteType;
  employmentType?: JobEmploymentType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: JobSalaryPeriod | null;
  applicationMethod: JobApplicationMethod;
  applicationUrl?: string | null;
  contactUserId?: string | null;
  closingDate?: Date | null;
};

function normalizeJobInput(input: JobDraftInput) {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || title.length > HIRING_JOB_TITLE_MAX) fail("INVALID_TITLE");
  if (!description || description.length > HIRING_JOB_BODY_MAX) fail("INVALID_BODY");

  let applicationUrl: string | null = null;
  if (input.applicationMethod === "EXTERNAL_URL") {
    if (!input.applicationUrl?.trim()) fail("APPLICATION_URL_REQUIRED");
    applicationUrl = sanitizeExternalUrl(input.applicationUrl);
    if (!applicationUrl) fail("INVALID_URL");
  }

  if (input.applicationMethod === "MESSAGING") {
    if (!input.contactUserId) fail("CONTACT_REQUIRED");
  }

  return {
    title,
    description,
    responsibilities: input.responsibilities?.trim() || null,
    skills: (input.skills ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 30),
    location: input.location?.trim() || null,
    remoteType: input.remoteType ?? "UNSPECIFIED",
    employmentType: input.employmentType ?? "FULL_TIME",
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency?.trim() || null,
    salaryPeriod: input.salaryPeriod ?? null,
    applicationMethod: input.applicationMethod,
    applicationUrl,
    contactUserId: input.contactUserId || null,
    closingDate: input.closingDate ?? null,
  };
}

/** Messaging contact must be active workspace member and reachable (prefs not checked against random recipient at publish — contact is employer side). */
async function assertMessagingContactAvailable(workspaceId: string, contactUserId: string) {
  const member = await prisma.employerWorkspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: contactUserId },
    },
  });
  if (!member || member.status !== "ACTIVE") fail("CONTACT_NOT_IN_WORKSPACE");
  if (await isMessagingTemporarilyRestricted(contactUserId)) fail("CONTACT_UNAVAILABLE");
}

export async function createJobDraft(options: {
  userId: string;
  workspaceId: string;
  input: JobDraftInput;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  const cap = await evaluateUserCapability(options.userId, "hiring.job.publish");
  if (!cap.allowed) fail("CAPABILITY_DENIED");

  const data = normalizeJobInput(options.input);
  if (data.applicationMethod === "MESSAGING" && data.contactUserId) {
    await assertMessagingContactAvailable(options.workspaceId, data.contactUserId);
  }

  const suffix = Date.now().toString(36);
  let slug = slugify(data.title, suffix);
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.jobListing.findUnique({ where: { slug } });
    if (!exists) break;
    slug = slugify(data.title, `${suffix}-${i}`);
  }

  return prisma.jobListing.create({
    data: {
      workspaceId: options.workspaceId,
      slug,
      ...data,
      status: "DRAFT",
      createdById: options.userId,
    },
  });
}

export async function updateJobDraft(options: {
  userId: string;
  workspaceId: string;
  jobId: string;
  input: JobDraftInput;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  const job = await prisma.jobListing.findUnique({ where: { id: options.jobId } });
  if (!job || job.workspaceId !== options.workspaceId) fail("NOT_FOUND");
  if (job.status !== "DRAFT" && job.status !== "REJECTED") fail("NOT_EDITABLE");

  const data = normalizeJobInput(options.input);
  if (data.applicationMethod === "MESSAGING" && data.contactUserId) {
    await assertMessagingContactAvailable(options.workspaceId, data.contactUserId);
  }

  return prisma.jobListing.update({
    where: { id: job.id },
    data: { ...data, status: "DRAFT", moderationReason: null },
  });
}

function countActivePublishedJobsWhere(workspaceId: string): Prisma.JobListingWhereInput {
  return {
    workspaceId,
    status: "PUBLISHED",
    OR: [{ closingDate: null }, { closingDate: { gt: new Date() } }],
  };
}

export async function submitJobForPublication(options: {
  userId: string;
  workspaceId: string;
  jobId: string;
}) {
  const cap = await evaluateUserCapability(options.userId, "hiring.job.publish");
  if (!cap.allowed) fail("CAPABILITY_DENIED");
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });

  return prisma.$transaction(async (tx) => {
    const job = await tx.jobListing.findUnique({ where: { id: options.jobId } });
    if (!job || job.workspaceId !== options.workspaceId) fail("NOT_FOUND");
    if (job.status === "PENDING_REVIEW") fail("ALREADY_PENDING");

    if (job.applicationMethod === "MESSAGING" && job.contactUserId) {
      await assertMessagingContactAvailable(job.workspaceId, job.contactUserId);
    }

    const isFirstPublish = job.publishedRevision == null && job.status !== "PUBLISHED";
    if (isFirstPublish) {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`job-slot:${job.workspaceId}`}))
      `;
      const active = await tx.jobListing.count({ where: countActivePublishedJobsWhere(job.workspaceId) });
      if (active >= HIRING_ACTIVE_JOBS_PER_WORKSPACE) fail("ACTIVE_JOB_LIMIT");
    }

    const nextRev = job.currentRevision + 1;
    const text = `${job.title}\n${job.description}\n${job.responsibilities ?? ""}`;
    const classification = classifyCommunityContent(text);

    const payload = {
      title: job.title,
      description: job.description,
      responsibilities: job.responsibilities,
      skills: job.skills,
      location: job.location,
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryPeriod: job.salaryPeriod,
      applicationMethod: job.applicationMethod,
      applicationUrl: job.applicationUrl,
      contactUserId: job.contactUserId,
      closingDate: job.closingDate?.toISOString() ?? null,
    };

    await tx.jobListingRevision.create({
      data: {
        jobId: job.id,
        revision: nextRev,
        payload,
        classificationOutcome: classification.outcome,
        classificationReason:
          classification.outcome === "reject" || classification.outcome === "hold"
            ? classification.reasonCode
            : classification.outcome === "unavailable"
              ? "unavailable"
              : null,
        moderationDecision:
          classification.outcome === "clear"
            ? "publish"
            : classification.outcome === "reject"
              ? "reject"
              : "hold",
      },
    });

    if (classification.outcome === "reject") {
      return tx.jobListing.update({
        where: { id: job.id },
        data: {
          currentRevision: nextRev,
          status: job.publishedRevision != null ? "PUBLISHED" : "REJECTED",
          moderationReason: classification.safeMessage,
          moderationAdapter: HIRING_MODERATION_ADAPTER,
          moderationPolicyVersion: HIRING_MODERATION_POLICY_VERSION,
        },
      });
    }

    if (classification.outcome === "hold" || classification.outcome === "unavailable") {
      await tx.moderationHold.create({
        data: {
          kind: "JOB_LISTING",
          status: "HELD",
          senderId: options.userId,
          payload: { jobId: job.id, revision: nextRev },
          idempotencyKey: `job:${job.id}:r${nextRev}`,
        },
      });
      return tx.jobListing.update({
        where: { id: job.id },
        data: {
          currentRevision: nextRev,
          status: job.publishedRevision != null ? "PUBLISHED" : "PENDING_REVIEW",
          moderationReason: classification.safeMessage,
          moderationAdapter: HIRING_MODERATION_ADAPTER,
          moderationPolicyVersion: HIRING_MODERATION_POLICY_VERSION,
        },
      });
    }

    return tx.jobListing.update({
      where: { id: job.id },
      data: {
        currentRevision: nextRev,
        publishedRevision: nextRev,
        status: "PUBLISHED",
        publishedAt: job.publishedAt ?? new Date(),
        moderationReason: null,
        moderationAdapter: HIRING_MODERATION_ADAPTER,
        moderationPolicyVersion: HIRING_MODERATION_POLICY_VERSION,
      },
    });
  });
}

export async function publishHeldJobRevision(options: { jobId: string; revision: number }) {
  const rev = await prisma.jobListingRevision.findUnique({
    where: { jobId_revision: { jobId: options.jobId, revision: options.revision } },
  });
  if (!rev) fail("NOT_FOUND");
  const payload = rev.payload as Record<string, unknown>;
  const job = await prisma.jobListing.findUnique({ where: { id: options.jobId } });
  if (!job) fail("NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    if (job.publishedRevision == null) {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`job-slot:${job.workspaceId}`}))
      `;
      const active = await tx.jobListing.count({ where: countActivePublishedJobsWhere(job.workspaceId) });
      if (active >= HIRING_ACTIVE_JOBS_PER_WORKSPACE) fail("ACTIVE_JOB_LIMIT");
    }
    return tx.jobListing.update({
      where: { id: job.id },
      data: {
        title: String(payload.title),
        description: String(payload.description),
        responsibilities: payload.responsibilities ? String(payload.responsibilities) : null,
        skills: Array.isArray(payload.skills) ? (payload.skills as string[]) : [],
        location: payload.location ? String(payload.location) : null,
        remoteType: payload.remoteType as JobRemoteType,
        employmentType: payload.employmentType as JobEmploymentType,
        salaryMin: payload.salaryMin != null ? Number(payload.salaryMin) : null,
        salaryMax: payload.salaryMax != null ? Number(payload.salaryMax) : null,
        salaryCurrency: payload.salaryCurrency ? String(payload.salaryCurrency) : null,
        salaryPeriod: (payload.salaryPeriod as JobSalaryPeriod | null) ?? null,
        applicationMethod: payload.applicationMethod as JobApplicationMethod,
        applicationUrl: payload.applicationUrl ? String(payload.applicationUrl) : null,
        contactUserId: payload.contactUserId ? String(payload.contactUserId) : null,
        closingDate: payload.closingDate ? new Date(String(payload.closingDate)) : null,
        publishedRevision: rev.revision,
        status: "PUBLISHED",
        publishedAt: new Date(),
        moderationReason: null,
      },
    });
  });
}

export async function closeJob(options: {
  userId: string;
  workspaceId: string;
  jobId: string;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  const job = await prisma.jobListing.findUnique({ where: { id: options.jobId } });
  if (!job || job.workspaceId !== options.workspaceId) fail("NOT_FOUND");
  return prisma.jobListing.update({
    where: { id: job.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
}

export async function removeJob(options: {
  userId: string;
  workspaceId: string;
  jobId: string;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  const job = await prisma.jobListing.findUnique({ where: { id: options.jobId } });
  if (!job || job.workspaceId !== options.workspaceId) fail("NOT_FOUND");
  return prisma.jobListing.update({
    where: { id: job.id },
    data: { status: "REMOVED", removedAt: new Date() },
  });
}

export function isJobPubliclyApplyable(job: {
  status: string;
  closingDate: Date | null;
}) {
  if (job.status !== "PUBLISHED") return false;
  if (job.closingDate && job.closingDate.getTime() <= Date.now()) return false;
  return true;
}

export async function listPublicJobs(page = 1, pageSize = 20) {
  const where: Prisma.JobListingWhereInput = {
    status: "PUBLISHED",
    OR: [{ closingDate: null }, { closingDate: { gt: new Date() } }],
  };
  const [total, items] = await Promise.all([
    prisma.jobListing.count({ where }),
    prisma.jobListing.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        workspace: { select: { id: true, name: true, website: true } },
      },
    }),
  ]);
  return { page, pageSize, total, items };
}

export async function getPublicJobBySlug(slug: string) {
  const job = await prisma.jobListing.findUnique({
    where: { slug },
    include: {
      workspace: { select: { id: true, name: true, website: true, description: true } },
    },
  });
  if (!job || !isJobPubliclyApplyable(job)) return null;
  return job;
}

export async function listWorkspaceJobs(userId: string, workspaceId: string) {
  await requireWorkspaceMember({ userId, workspaceId });
  return prisma.jobListing.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });
}

export { fail as jobFail };
