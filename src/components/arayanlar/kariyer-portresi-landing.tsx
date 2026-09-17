import Link from "next/link";
import type { ReactNode } from "react";
import { kariyerPortresiLanding as copy } from "@/lib/arayanlar/landing-copy";

type Cta = {
  href: string;
  label: string;
  note?: string;
};

type Props = {
  primary: Cta | null;
  secondaryCv?: Cta | null;
  showApplicationAnchor?: boolean;
};

function Section({
  id,
  title,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 space-y-4 ${className}`}>
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] md:text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Public-facing Kariyer Portresi explanation.
 * Informational only — application mutations live in the guest flow below.
 */
export function KariyerPortresiLanding({
  primary,
  secondaryCv = null,
  showApplicationAnchor = true,
}: Props) {
  const applyHref = primary?.href ?? "#basvuru";
  const applyLabel = primary?.label ?? copy.hero.primaryCta;

  return (
    <div className="space-y-16 md:space-y-20">
      <header className="max-w-3xl space-y-6">
        <p className="text-sm font-medium tracking-wide text-[var(--accent-strong)]">
          {copy.brand}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--ink)] sm:text-4xl md:text-5xl">
          <span className="block">{copy.hero.line1}</span>
          <span className="mt-2 block text-[var(--accent-strong)]">{copy.hero.line2}</span>
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg">
          {copy.hero.support}
        </p>
        <p className="text-sm font-medium text-[var(--ink)]">{copy.hero.reassurance}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href={applyHref} className="btn btn-primary">
            {applyLabel}
          </Link>
          <a href={`#${copy.process.id}`} className="btn btn-ghost">
            {copy.hero.secondaryCta}
          </a>
          {secondaryCv ? (
            <Link href={secondaryCv.href} className="btn btn-secondary">
              {secondaryCv.label}
            </Link>
          ) : null}
        </div>
        {primary?.note ? (
          <p className="text-sm text-[var(--muted)]">{primary.note}</p>
        ) : null}
      </header>

      <Section id={copy.contrast.id} title={copy.contrast.title}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <h3 className="font-[family-name:var(--font-display)] text-lg">
              {copy.contrast.cvTitle}
            </h3>
            <ul className="mt-4 space-y-2 text-[var(--muted)]">
              {copy.contrast.cvItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--line)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--accent-soft)] bg-[var(--accent-soft)]/40 p-5">
            <h3 className="font-[family-name:var(--font-display)] text-lg">
              {copy.contrast.usTitle}
            </h3>
            <ul className="mt-4 space-y-2 text-[var(--ink)]">
              {copy.contrast.usItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id={copy.process.id} title={copy.process.title}>
        <p className="text-sm text-[var(--muted)]">{copy.process.durationNote}</p>
        <ol className="mt-2 space-y-4">
          {copy.process.steps.map((step, index) => (
            <li
              key={step.title}
              className="grid gap-2 border-t border-[var(--line)] pt-4 sm:grid-cols-[auto_1fr] sm:gap-5"
            >
              <span className="font-[family-name:var(--font-display)] text-sm text-[var(--accent-strong)]">
                {index + 1}.
              </span>
              <div className="min-w-0">
                <p className="font-medium text-[var(--ink)]">{step.title}</p>
                <p className="mt-1 break-words text-[var(--muted)]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-[var(--muted)]">{copy.process.coldOpenNote}</p>
      </Section>

      <Section id={copy.whyCv.id} title={copy.whyCv.title}>
        <ul className="space-y-2 text-[var(--muted)]">
          {copy.whyCv.points.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 text-[var(--ink)]">
          <p className="font-medium">{copy.whyCv.noInvent}</p>
          <p className="text-[var(--muted)]">{copy.whyCv.missingMark}</p>
          <p className="text-sm text-[var(--muted)]">{copy.whyCv.aiNote}</p>
        </div>
      </Section>

      <Section id={copy.prepPreview.id} title={copy.prepPreview.title}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {copy.prepPreview.items.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)]"
            >
              {item}
            </li>
          ))}
        </ul>
        <p className="font-medium text-[var(--ink)]">{copy.prepPreview.notScript}</p>
        <p className="text-[var(--muted)]">{copy.prepPreview.purpose}</p>
      </Section>

      <Section id={copy.notInterview.id} title={copy.notInterview.title}>
        <div className="max-w-2xl space-y-3 text-lg leading-relaxed text-[var(--muted)]">
          <p>{copy.notInterview.body1}</p>
          <p>{copy.notInterview.body2}</p>
        </div>
      </Section>

      <Section id={copy.whoFor.id} title={copy.whoFor.title}>
        <p className="text-[var(--muted)]">{copy.whoFor.lead}</p>
        <ul className="mt-2 space-y-2 text-[var(--ink)]">
          {copy.whoFor.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id={copy.privacy.id} title={copy.privacy.title}>
        <ul className="max-w-2xl space-y-2 text-[var(--muted)]">
          {copy.privacy.points.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--line)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[var(--muted)]">
          {copy.privacy.legalLinksLabel}:{" "}
          <Link href="/yasal/cv_ai_processing_notice" className="text-[var(--accent)] underline">
            CV ve AI bilgilendirmesi
          </Link>
          {" · "}
          <Link href="/yasal/host_prep_sharing_notice" className="text-[var(--accent)] underline">
            Sunucu hazırlık paylaşımı
          </Link>
          {" · "}
          <Link href="/yasal/privacy_notice" className="text-[var(--accent)] underline">
            Gizlilik bildirimi
          </Link>
        </p>
      </Section>

      <section
        id={copy.finalCta.id}
        className="scroll-mt-24 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-5 py-8 md:px-8"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] md:text-3xl">
          {copy.finalCta.title}
        </h2>
        <p className="mt-3 text-[var(--muted)]">{copy.finalCta.support}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{copy.finalCta.flowNote}</p>
        <div className="mt-6">
          <Link href={applyHref} className="btn btn-primary">
            {copy.finalCta.cta}
          </Link>
        </div>
      </section>

      {showApplicationAnchor ? (
        <div id="basvuru" className="scroll-mt-24 border-t border-[var(--line)] pt-10">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Başvuru
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Aşağıdan Kariyer Portresi başvurusuna başlayabilir veya kaldığın yerden devam edebilirsin.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Compact header when the member already has an active application. */
export function KariyerPortresiApplicationHeader({
  primary,
  secondaryCv = null,
}: {
  primary: Cta | null;
  secondaryCv?: Cta | null;
}) {
  return (
    <header className="space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          {copy.brand}
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Başvurun devam ediyor. Kayıt formatı ve hazırlık süreci hakkında bilgi için{" "}
          <a href={`#${copy.process.id}`} className="text-[var(--accent)] underline">
            nasıl çalıştığını
          </a>{" "}
          okuyabilirsin.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
        {secondaryCv ? (
          <Link href={secondaryCv.href} className="btn btn-secondary">
            {secondaryCv.label}
          </Link>
        ) : null}
      </div>
      {/* Keep process anchor reachable without re-showing the full marketing page */}
      <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <summary className="cursor-pointer font-medium text-[var(--ink)]">
          Kayıt formatı (6 adım)
        </summary>
        <ol id={copy.process.id} className="mt-4 scroll-mt-24 space-y-3 text-sm">
          {copy.process.steps.map((step, index) => (
            <li key={step.title}>
              <span className="font-medium">
                {index + 1}. {step.title}
              </span>
              <p className="mt-1 text-[var(--muted)]">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-[var(--muted)]">{copy.process.durationNote}</p>
        <p className="mt-4 text-sm">
          <a href={`#${copy.notInterview.id}`} className="text-[var(--accent)] underline">
            {copy.notInterview.title}
          </a>
        </p>
        <p id={copy.notInterview.id} className="mt-3 scroll-mt-24 text-sm text-[var(--muted)]">
          {copy.notInterview.body1} {copy.notInterview.body2}
        </p>
      </details>
    </header>
  );
}
