import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ArayanlarGuestFlow } from "@/components/arayanlar/guest-flow";
import { arayanlarEntryCta } from "@/lib/arayanlar/entry-cta";
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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          {ui.arayanlar.title}
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">{ui.arayanlar.lead}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {primary ? (
            <>
              <Link href={primary.href} className="btn btn-primary">
                {primary.label}
              </Link>
              {primary.note ? (
                <p className="text-sm text-[var(--muted)]">{primary.note}</p>
              ) : null}
            </>
          ) : null}
          {showCvEntry ? (
            <Link
              href="/arayanlar?kaynak=cv#basvuru"
              className={primary ? "btn btn-secondary" : "btn btn-primary"}
            >
              {ui.arayanlar.fromCv}
            </Link>
          ) : null}
        </div>
        {showCvEntry ? (
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{ui.arayanlar.fromCvNote}</p>
        ) : null}
      </div>
      <div id="basvuru">
        <ArayanlarGuestFlow startFromCv={startFromCv} />
      </div>
    </section>
  );
}
