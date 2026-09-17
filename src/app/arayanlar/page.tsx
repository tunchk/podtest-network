import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ArayanlarGuestFlow } from "@/components/arayanlar/guest-flow";
import {
  KariyerPortresiApplicationHeader,
  KariyerPortresiLanding,
} from "@/components/arayanlar/kariyer-portresi-landing";
import { arayanlarEntryCta } from "@/lib/arayanlar/entry-cta";
import { hasActiveArayanlarApplication } from "@/lib/arayanlar/landing-copy";
import { ui } from "@/lib/ui-copy";

type SearchParams = Promise<{ kaynak?: string }>;

export default async function ArayanlarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const startFromCv = sp.kaynak === "cv";

  const app = await prisma.arayanlarApplication.findUnique({
    where: { userId: session.user.id },
    select: {
      status: true,
      prepStatus: true,
      confirmedCostAt: true,
      withdrawnAt: true,
    },
  });

  const readyCvCount = await prisma.cvDocument.count({
    where: {
      userId: session.user.id,
      deletedAt: null,
      extractionStatus: "OK",
    },
  });

  const primary = arayanlarEntryCta(app);
  const showCvEntry =
    readyCvCount > 0 &&
    (!app ||
      app.status === "DRAFT" ||
      app.status === "AWAITING_CONFIRMATION" ||
      app.status === "WITHDRAWN");

  const secondaryCv = showCvEntry
    ? {
        href: "/arayanlar?kaynak=cv#basvuru",
        label: ui.arayanlar.fromCv,
      }
    : null;

  const activeApplication = hasActiveArayanlarApplication(app);

  return (
    <section className="space-y-8">
      {activeApplication ? (
        <KariyerPortresiApplicationHeader primary={primary} secondaryCv={secondaryCv} />
      ) : (
        <>
          <KariyerPortresiLanding primary={primary} secondaryCv={secondaryCv} />
          {showCvEntry ? (
            <p className="max-w-2xl text-sm text-[var(--muted)]">{ui.arayanlar.fromCvNote}</p>
          ) : null}
        </>
      )}
      <div id={activeApplication ? "basvuru" : undefined} className={activeApplication ? "scroll-mt-24" : undefined}>
        <ArayanlarGuestFlow startFromCv={startFromCv} />
      </div>
    </section>
  );
}
