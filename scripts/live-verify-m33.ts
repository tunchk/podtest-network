/**
 * M3.3 API/integration smoke with synthetic users (no real email).
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createDefaultProfileForUser, submitProfileForReview, resolvePublicationReview, updateOwnedProfileDraft } from "../src/lib/profiles/service";
import { ensureHiringPilotGrants } from "../src/lib/hiring/pilot";
import { createEmployerWorkspace } from "../src/lib/hiring/workspace";
import { createJobDraft, submitJobForPublication, getPublicJobBySlug } from "../src/lib/hiring/jobs";
import { searchHiringCandidates } from "../src/lib/hiring/discovery";
import { saveHiringSearch } from "../src/lib/hiring/candidates";
import { addCandidateToList, createCandidateList, upsertCandidateNote } from "../src/lib/hiring/candidates";
import { contactCandidateFromWorkspace } from "../src/lib/hiring/outreach";
import { requireWorkspaceMember } from "../src/lib/hiring/access";

config({ path: ".env.local" });
config({ path: ".env" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `live33-${Date.now().toString(36)}`;

async function main() {
  const admin = await db.user.findFirst({ where: { staffRole: "ADMIN" } });
  if (!admin) throw new Error("Need ADMIN (npm run bootstrap:admin)");

  const employer = await db.user.create({
    data: {
      name: "M33 Employer",
      email: `m33-employer-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
  const outsider = await db.user.create({
    data: {
      name: "M33 Outsider",
      email: `m33-outsider-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
  const candidate = await db.user.create({
    data: {
      name: "M33 Candidate",
      email: `m33-candidate-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });

  await createDefaultProfileForUser(employer);
  await ensureHiringPilotGrants(employer.id);

  const ws = await createEmployerWorkspace({
    userId: employer.id,
    name: `Live verify ${suffix}`,
  });

  const candUser = await db.user.findUniqueOrThrow({ where: { id: candidate.id } });
  await createDefaultProfileForUser(candUser);
  await updateOwnedProfileDraft(candidate.id, {
    slug: `live-cand-${suffix}`,
    displayName: "Live Candidate",
    skills: ["typescript"],
    openToWork: true,
    headline: "Engineer",
  });
  await submitProfileForReview(candidate.id);
  const review = await db.publicationReview.findFirst({
    where: { profile: { userId: candidate.id }, status: "PENDING" },
  });
  if (!review) throw new Error("review missing");
  await resolvePublicationReview({
    reviewId: review.id,
    reviewerId: admin.id,
    decision: "APPROVED",
  });

  const job = await createJobDraft({
    userId: employer.id,
    workspaceId: ws.id,
    input: {
      title: `Live job ${suffix}`,
      description: "Integration smoke job listing.",
      applicationMethod: "EXTERNAL_URL",
      applicationUrl: "https://example.com/apply",
    },
  });
  await submitJobForPublication({
    userId: employer.id,
    workspaceId: ws.id,
    jobId: job.id,
  });
  const publicJob = await getPublicJobBySlug(job.slug);
  if (!publicJob) throw new Error("public job missing");

  const search = await searchHiringCandidates({
    actorId: employer.id,
    workspaceId: ws.id,
    filters: { skill: "typescript" },
  });
  if (!search.items.some((i) => i.userId === candidate.id)) {
    throw new Error("candidate not in search");
  }

  await saveHiringSearch({
    userId: employer.id,
    workspaceId: ws.id,
    name: "Live search",
    filters: { skill: "typescript" },
  });

  const list = await createCandidateList({
    userId: employer.id,
    workspaceId: ws.id,
    name: "Live list",
  });
  await addCandidateToList({
    userId: employer.id,
    workspaceId: ws.id,
    listId: list.id,
    subjectUserId: candidate.id,
  });
  await upsertCandidateNote({
    userId: employer.id,
    workspaceId: ws.id,
    subjectUserId: candidate.id,
    body: "Live note",
  });

  await contactCandidateFromWorkspace({
    recruiterId: employer.id,
    workspaceId: ws.id,
    subjectUserId: candidate.id,
    message: "Live outreach",
    idempotencyKey: `live33-${suffix}`,
  });

  try {
    await requireWorkspaceMember({ userId: outsider.id, workspaceId: ws.id });
    throw new Error("outsider should be forbidden");
  } catch (e) {
    if (!(e instanceof Error && "code" in e && (e as { code: string }).code === "FORBIDDEN")) {
      throw e;
    }
  }

  console.log("M3.3 live verify OK", {
    workspaceId: ws.id,
    jobSlug: job.slug,
    publicTitle: publicJob.title,
    searchTotal: search.total,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

// Fixture emails from this script are registered in scripts/cleanup-verify-fixtures.ts
// Prefer self-cleanup in finally; otherwise: npm run cleanup:fixtures
