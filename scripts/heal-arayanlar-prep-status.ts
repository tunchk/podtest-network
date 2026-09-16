import { loadAppEnvironment } from "../src/lib/env/load-app-env";

loadAppEnvironment();

async function main() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const {
    reconcileArayanlarPrepStatusFromJob,
    getGuestBriefForMember,
  } = await import("../src/lib/arayanlar/service");

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const email = process.argv[2] ?? "tunc@catchylabs.tech";
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const before = await db.arayanlarApplication.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      prepStatus: true,
      submittedRevision: true,
      prepareJobId: true,
    },
  });

  const healed = await reconcileArayanlarPrepStatusFromJob(user.id);
  const brief = await getGuestBriefForMember(user.id);
  const readyNotifs = before
    ? await db.inAppNotification.findMany({
        where: {
          userId: user.id,
          kind: "arayanlar_prep_ready",
          dedupeKey: `arayanlar_prep_ready:${before.id}:r${before.submittedRevision}`,
        },
        select: { dedupeKey: true, title: true },
      })
    : [];

  console.log(
    JSON.stringify(
      {
        before,
        afterPrepStatus: healed?.prepStatus ?? null,
        notesAccessible: Boolean(brief),
        readyNotifs,
      },
      null,
      2,
    ),
  );

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
