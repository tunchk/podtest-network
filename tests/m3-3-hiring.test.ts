import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser, submitProfileForReview, resolvePublicationReview, updateOwnedProfileDraft } from "@/lib/profiles/service";
import { ensureHiringPilotGrants } from "@/lib/hiring/pilot";
import { createEmployerWorkspace, removeWorkspaceMember } from "@/lib/hiring/workspace";
import { createEmployerMembershipInvitation, acceptEmployerMembershipInvitation } from "@/lib/hiring/invitations";
import {
  createJobDraft,
  submitJobForPublication,
  closeJob,
  getPublicJobBySlug,
  listPublicJobs,
} from "@/lib/hiring/jobs";
import { searchHiringCandidates } from "@/lib/hiring/discovery";
import { addCandidateToList, createCandidateList, listCandidateListEntries, upsertCandidateNote } from "@/lib/hiring/candidates";
import { contactCandidateFromWorkspace } from "@/lib/hiring/outreach";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { requireWorkspaceMember } from "@/lib/hiring/access";
import { blockMember } from "@/lib/messaging/blocks";
import { HIRING_ACTIVE_JOBS_PER_WORKSPACE } from "@/lib/hiring/constants";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `m33-${Date.now().toString(36)}`;

async function createUser(label: string) {
  return db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
}

async function publishCandidate(userId: string, slug: string, adminId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await createDefaultProfileForUser(user);
  await updateOwnedProfileDraft(userId, {
    slug,
    displayName: slug,
    skills: ["typescript"],
    openToWork: true,
    headline: "Backend engineer",
  });
  await submitProfileForReview(userId);
  const review = await db.publicationReview.findFirst({
    where: { profile: { userId }, status: "PENDING" },
  });
  if (!review) throw new Error("no review");
  await resolvePublicationReview({ reviewId: review.id, reviewerId: adminId, decision: "APPROVED" });
}

describe("m3.3 hiring workspaces and jobs", () => {
  let owner = "";
  let recruiter = "";
  let outsider = "";
  let candidate = "";
  let admin = "";
  let wsA = "";
  let wsB = "";
  let recruiterEmail = "";
  const ids: string[] = [];

  beforeAll(async () => {
    const uOwner = await createUser("m33owner");
    const uRec = await createUser("m33rec");
    const uOut = await createUser("m33out");
    const uCand = await createUser("m33cand");
    const uAdmin = await createUser("m33admin");
    await db.user.update({ where: { id: uAdmin.id }, data: { staffRole: "ADMIN" } });
    owner = uOwner.id;
    recruiter = uRec.id;
    recruiterEmail = uRec.email;
    outsider = uOut.id;
    candidate = uCand.id;
    admin = uAdmin.id;
    ids.push(owner, recruiter, outsider, candidate, admin);

    await createDefaultProfileForUser(uOwner);
    await ensureHiringPilotGrants(owner);
    await ensureHiringPilotGrants(recruiter);
    await ensureHiringPilotGrants(outsider);

    wsA = (await createEmployerWorkspace({ userId: owner, name: `Workspace A ${suffix}` })).id;
    wsB = (await createEmployerWorkspace({ userId: outsider, name: `Workspace B ${suffix}` })).id;

    const inv = await createEmployerMembershipInvitation({
      actorId: owner,
      workspaceId: wsA,
      recipientEmail: uRec.email,
    });
    await acceptEmployerMembershipInvitation({ userId: recruiter, token: inv.plaintextToken });

    await publishCandidate(candidate, `cand-${suffix}`, admin);
  });

  afterAll(async () => {
    await db.hiringCandidateNote.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.hiringCandidateListEntry.deleteMany({});
    await db.hiringCandidateList.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.hiringSavedSearch.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.jobListingRevision.deleteMany({});
    await db.jobListing.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.employerMembershipInvitation.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.employerWorkspaceMember.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.employerWorkspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.memberBlock.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await db.messageRequest.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } });
    await db.capabilityGrant.deleteMany({ where: { userId: { in: ids } } });
    await db.profile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("workspace creation without public profile", async () => {
    expect(wsA).toBeTruthy();
  });

  it("forged workspace access denied", async () => {
    await expect(
      requireWorkspaceMember({ userId: outsider, workspaceId: wsA }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("recruiter removal revokes access", async () => {
    await removeWorkspaceMember({ actorId: owner, workspaceId: wsA, targetUserId: recruiter });
    await expect(
      requireWorkspaceMember({ userId: recruiter, workspaceId: wsA }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Re-invite for later tests
    const inv = await createEmployerMembershipInvitation({
      actorId: owner,
      workspaceId: wsA,
      recipientEmail: recruiterEmail,
    });
    await acceptEmployerMembershipInvitation({ userId: recruiter, token: inv.plaintextToken });
  });

  it("publishes job and hides drafts", async () => {
    const draft = await createJobDraft({
      userId: owner,
      workspaceId: wsA,
      input: {
        title: "Pilot ilan",
        description: "Açıklama metni",
        applicationMethod: "EXTERNAL_URL",
        applicationUrl: "https://example.com/apply",
      },
    });
    expect(draft.status).toBe("DRAFT");
    expect(await getPublicJobBySlug(draft.slug)).toBeNull();

    const pub = await submitJobForPublication({
      userId: owner,
      workspaceId: wsA,
      jobId: draft.id,
    });
    expect(pub.status).toBe("PUBLISHED");
    const publicJob = await getPublicJobBySlug(draft.slug);
    expect(publicJob?.title).toBe("Pilot ilan");
  });

  it("enforces active job slot under concurrency", async () => {
    const drafts = await Promise.all(
      Array.from({ length: HIRING_ACTIVE_JOBS_PER_WORKSPACE + 2 }).map((_, i) =>
        createJobDraft({
          userId: outsider,
          workspaceId: wsB,
          input: {
            title: `Slot test ${i}`,
            description: "Deneme",
            applicationMethod: "EXTERNAL_URL",
            applicationUrl: "https://example.com/j",
          },
        }),
      ),
    );
    const results = await Promise.allSettled(
      drafts.map((d) =>
        submitJobForPublication({ userId: outsider, workspaceId: wsB, jobId: d.id }),
      ),
    );
    const published = results.filter(
      (r) => r.status === "fulfilled" && (r.value as { status: string }).status === "PUBLISHED",
    );
    const limited = results.filter(
      (r) => r.status === "rejected" && (r.reason as { code?: string }).code === "ACTIVE_JOB_LIMIT",
    );
    expect(published.length).toBe(HIRING_ACTIVE_JOBS_PER_WORKSPACE);
    expect(limited.length).toBeGreaterThan(0);
  });

  it("closing job removes from public apply", async () => {
    const draft = await createJobDraft({
      userId: owner,
      workspaceId: wsA,
      input: {
        title: "Kapanacak ilan",
        description: "Deneme",
        applicationMethod: "EXTERNAL_URL",
        applicationUrl: "https://example.com/close",
      },
    });
    await db.jobListing.updateMany({
      where: { workspaceId: wsA, status: "PUBLISHED" },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    await submitJobForPublication({ userId: owner, workspaceId: wsA, jobId: draft.id });
    const slug = draft.slug;
    expect(await getPublicJobBySlug(slug)).toBeTruthy();
    await closeJob({ userId: owner, workspaceId: wsA, jobId: draft.id });
    expect(await getPublicJobBySlug(slug)).toBeNull();
  });

  it("candidate search returns public fields only", async () => {
    const result = await searchHiringCandidates({
      actorId: owner,
      workspaceId: wsA,
      filters: { skill: "typescript", openToWork: true },
    });
    expect(result.items.some((i) => i.userId === candidate)).toBe(true);
    const row = result.items.find((i) => i.userId === candidate)!;
    expect(row.view.displayName).toBeTruthy();
    expect((row.view as { email?: string }).email).toBeUndefined();
  });

  it("notes are workspace scoped", async () => {
    const list = await createCandidateList({
      userId: owner,
      workspaceId: wsA,
      name: "Liste",
    });
    await addCandidateToList({
      userId: owner,
      workspaceId: wsA,
      listId: list.id,
      subjectUserId: candidate,
    });
    await upsertCandidateNote({
      userId: owner,
      workspaceId: wsA,
      subjectUserId: candidate,
      body: "Özel not",
    });
    const entries = await listCandidateListEntries({
      userId: owner,
      workspaceId: wsA,
      listId: list.id,
    });
    expect(entries.entries[0]?.status).toBe("available");

    await expect(
      listCandidateListEntries({ userId: outsider, workspaceId: wsA, listId: list.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("unpublished profiles omit details from candidate lists", async () => {
    const list = await createCandidateList({
      userId: owner,
      workspaceId: wsA,
      name: `Liste-unpub-${suffix}`,
    });
    await addCandidateToList({
      userId: owner,
      workspaceId: wsA,
      listId: list.id,
      subjectUserId: candidate,
    });
    await db.profile.update({
      where: { userId: candidate },
      data: { published: false, discoverable: false },
    });
    const entries = await listCandidateListEntries({
      userId: owner,
      workspaceId: wsA,
      listId: list.id,
    });
    expect(entries.entries[0]?.status).toBe("unavailable");
    expect((entries.entries[0] as { view?: unknown }).view).toBeUndefined();

    const search = await searchHiringCandidates({
      actorId: owner,
      workspaceId: wsA,
      filters: { skill: "typescript" },
    });
    expect(search.items.some((i) => i.userId === candidate)).toBe(false);

    await db.profile.update({
      where: { userId: candidate },
      data: { published: true, discoverable: true },
    });
  });

  it("blocked outreach fails", async () => {
    await blockMember({ blockerId: candidate, blockedId: owner });
    await expect(
      contactCandidateFromWorkspace({
        recruiterId: owner,
        workspaceId: wsA,
        subjectUserId: candidate,
        message: "Merhaba",
        idempotencyKey: `blk-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
  });

  it("revoked capability denies without deleting workspace", async () => {
    await db.capabilityGrant.updateMany({
      where: { userId: owner, capabilityKey: "hiring.job.publish" },
      data: { revokedAt: new Date() },
    });
    const cap = await evaluateUserCapability(owner, "hiring.job.publish");
    expect(cap.allowed).toBe(false);
    const ws = await db.employerWorkspace.findUnique({ where: { id: wsA } });
    expect(ws).toBeTruthy();
  });
});
