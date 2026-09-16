/**
 * Safe cleanup of local verification fixtures only.
 *
 * Default: dry-run (report only). Use --apply to delete.
 * Refuses non-local DATABASE_URL / NODE_ENV=production.
 *
 * Fixture identity is provenance-based (emails registered below from
 * scripts/live-verify-*.ts and diagnostic uploads), not display names
 * or broad “test” patterns.
 *
 * Future verify scripts should register their email patterns here and
 * ideally self-clean in a finally block.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

/** Exact email regexes for known verify / diagnostic scripts. */
const FIXTURE_EMAIL_PATTERNS: RegExp[] = [
  /^live-verify-[a-z0-9]+@example\.invalid$/i,
  /^live-guest-[a-z0-9.-]+@example\.com$/i,
  /^live-host-[a-z0-9.-]+@example\.com$/i,
  /^live-admin-[a-z0-9.-]+@example\.com$/i,
  /^live-diag2?-\d+@example\.invalid$/i,
  /^browser-guest-[a-z0-9.-]+@example\.com$/i,
  /^m31[ab]-\d+@example\.com$/i,
  /^m32-asker-[a-z0-9.-]+@example\.com$/i,
  /^m32-answerer-[a-z0-9.-]+@example\.com$/i,
  /^m32-speaker-[a-z0-9.-]+@example\.com$/i,
  /^m33-employer-[a-z0-9.-]+@example\.com$/i,
  /^m33-outsider-[a-z0-9.-]+@example\.com$/i,
  /^m33-candidate-[a-z0-9.-]+@example\.com$/i,
  /^cv-diag2?-[a-z0-9]+@example\.invalid$/i,
  /^cv-ok-[a-z0-9]+@example\.invalid$/i,
  /^cv-fix-[a-z0-9]+@example\.com$/i,
];

/** MANUAL episodes created by live-verify scripts (title + sourceKind provenance). */
const FIXTURE_EPISODE_TITLE_PATTERNS: RegExp[] = [
  /^Doğrulama bölümü live32-/i,
];

function assertLocalDev() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run fixture cleanup with NODE_ENV=production");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL missing");
  const lower = url.toLowerCase();
  const looksLocal =
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("@localhost:") ||
    lower.includes("host.docker.internal");
  if (!looksLocal) {
    throw new Error(
      "Refusing fixture cleanup: DATABASE_URL does not look like a local development database",
    );
  }
}

function isFixtureEmail(email: string) {
  return FIXTURE_EMAIL_PATTERNS.some((re) => re.test(email));
}

async function main() {
  assertLocalDev();
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      staffRole: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const fixtureUsers = users.filter((u) => isFixtureEmail(u.email));
  const report: Array<Record<string, unknown>> = [];
  const ambiguous: Array<Record<string, unknown>> = [];

  for (const user of fixtureUsers) {
    const userId = user.id;
    const [
      messageRequestsSent,
      messageRequestsReceived,
      workspacesOwned,
      memberships,
      jobsCreated,
      cvDocs,
      aiJobs,
      arayanlarApps,
    ] = await Promise.all([
      db.messageRequest.count({ where: { senderId: userId } }),
      db.messageRequest.count({ where: { recipientId: userId } }),
      db.employerWorkspace.count({ where: { ownerId: userId } }),
      db.employerWorkspaceMember.count({ where: { userId } }),
      db.jobListing.count({ where: { createdById: userId } }),
      db.cvDocument.count({ where: { userId } }),
      db.aiJob.count({ where: { userId } }),
      db.arayanlarApplication.count({ where: { userId } }),
    ]);

    const foreignMsgPartners = await db.messageRequest.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      select: { senderId: true, recipientId: true },
      take: 100,
    });
    const partnerIds = new Set<string>();
    for (const row of foreignMsgPartners) {
      partnerIds.add(row.senderId);
      partnerIds.add(row.recipientId);
    }
    partnerIds.delete(userId);
    const partners = partnerIds.size
      ? await db.user.findMany({
          where: { id: { in: [...partnerIds] } },
          select: { id: true, email: true },
        })
      : [];
    const hasRealPartner = partners.some((p) => !isFixtureEmail(p.email));

    const entry = {
      userId,
      email: user.email,
      staffRole: user.staffRole,
      counts: {
        messageRequestsSent,
        messageRequestsReceived,
        workspacesOwned,
        memberships,
        jobsCreated,
        cvDocs,
        aiJobs,
        arayanlarApps,
      },
      hasRealPartner,
    };

    if (hasRealPartner) {
      ambiguous.push({
        ...entry,
        reason: "Has message-request interaction with a non-fixture account — left untouched",
      });
    } else {
      report.push(entry);
    }
  }

  const episodeCandidates = await db.podcastEpisode.findMany({
    where: { sourceKind: "MANUAL" },
    select: {
      id: true,
      title: true,
      slug: true,
      publicationState: true,
      sourceKind: true,
    },
  });
  const fixtureEpisodes = episodeCandidates.filter((e) =>
    FIXTURE_EPISODE_TITLE_PATTERNS.some((re) => re.test(e.title)),
  );

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        fixtureUserCount: fixtureUsers.length,
        deletable: report.length,
        ambiguous: ambiguous.length,
        deletableUsers: report,
        ambiguousUsers: ambiguous,
        fixtureEpisodes,
        note: "Private CV text and message bodies are not dumped. RSS episodes and real accounts are never targeted. MANUAL verification episodes are unpublished (REMOVED) on --apply.",
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to delete deletable fixture users and dependents.");
    await db.$disconnect();
    return;
  }

  if (fixtureEpisodes.length) {
    await db.podcastEpisode.updateMany({
      where: { id: { in: fixtureEpisodes.map((e) => e.id) } },
      data: { publicationState: "REMOVED" },
    });
  }

  let deletedUsers = 0;
  for (const row of report) {
    const userId = row.userId as string;
    await db.$transaction(async (tx) => {
      const workspaces = await tx.employerWorkspace.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });
      const wsIds = workspaces.map((w) => w.id);
      if (wsIds.length) {
        const jobs = await tx.jobListing.findMany({
          where: { workspaceId: { in: wsIds } },
          select: { id: true },
        });
        const jobIds = jobs.map((j) => j.id);
        if (jobIds.length) {
          await tx.jobListingRevision.deleteMany({ where: { jobId: { in: jobIds } } });
          await tx.jobListing.deleteMany({ where: { id: { in: jobIds } } });
        }
        await tx.hiringCandidateNote.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await tx.hiringCandidateListEntry.deleteMany({
          where: { list: { workspaceId: { in: wsIds } } },
        });
        await tx.hiringCandidateList.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await tx.hiringSavedSearch.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await tx.employerMembershipInvitation.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await tx.employerWorkspaceMember.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await tx.employerWorkspace.deleteMany({ where: { id: { in: wsIds } } });
      }

      await tx.employerWorkspaceMember.deleteMany({ where: { userId } });
      await tx.inAppNotification.deleteMany({ where: { userId } });
      await tx.aiJob.deleteMany({ where: { userId } });
      await tx.creditLedgerEntry.deleteMany({ where: { userId } });
      await tx.creditLot.deleteMany({ where: { userId } });
      await tx.cvDocument.deleteMany({ where: { userId } });
      await tx.arayanlarArtifact.deleteMany({ where: { application: { userId } } });
      await tx.arayanlarApplication.deleteMany({ where: { userId } });
      await tx.capabilityGrant.deleteMany({ where: { userId } });
      await tx.automatedContentReview.deleteMany({ where: { profile: { userId } } });
      await tx.publicationReview.deleteMany({ where: { profile: { userId } } });
      await tx.hostAuthorization.deleteMany({ where: { userId } });
      await tx.messageRequest.deleteMany({
        where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      });
      await tx.profile.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
    deletedUsers += 1;
  }

  console.log(
    JSON.stringify({
      applied: true,
      deletedUsers,
      preservedAmbiguous: ambiguous.length,
    }),
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
