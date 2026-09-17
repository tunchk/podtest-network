import Link from "next/link";
import { ui } from "@/lib/ui-copy";
import type { EpisodeCardData } from "@/components/podcast/episode-card";
import { EpisodeCard } from "@/components/podcast/episode-card";

const { landing } = ui;

function HeroWhatMark({ label }: { label: string }) {
  return (
    <span
      className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent-strong)]"
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

/**
 * Public homepage — visual/UX presentation only.
 * Copy from ui.landing; no auth or product mutations.
 */
export function HomeLanding({ episodes }: { episodes: EpisodeCardData[] }) {
  const heroItems = [
    { key: "community", mark: "1", ...landing.heroWhat.community },
    { key: "episodes", mark: "2", ...landing.heroWhat.episodes },
    { key: "kariyer", mark: "3", ...landing.heroWhat.kariyer },
  ] as const;

  const whatItems = [
    landing.what.community,
    landing.what.episodes,
    landing.what.kariyer,
  ] as const;

  return (
    <div className="space-y-16 md:space-y-20 lg:space-y-24">
      <section className="home-hero relative -mx-4 overflow-hidden px-4 py-8 sm:py-10 md:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 8% 12%, color-mix(in oklab, var(--accent-soft) 70%, transparent) 0%, transparent 58%), radial-gradient(ellipse 40% 35% at 92% 18%, color-mix(in oklab, #e7eef5 80%, transparent) 0%, transparent 55%)",
          }}
        />
        {/* Soft conversation motif — decorative only */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 top-8 hidden h-36 w-36 text-[var(--accent)] opacity-[0.07] lg:block"
          viewBox="0 0 120 120"
          fill="none"
        >
          <circle cx="42" cy="48" r="28" stroke="currentColor" strokeWidth="2" />
          <circle cx="78" cy="62" r="22" stroke="currentColor" strokeWidth="2" />
          <path
            d="M28 68c6 10 18 16 28 14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <div className="home-hero-copy grid items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:gap-12">
          <div className="max-w-xl space-y-5 md:max-w-[34rem]">
            <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.08em] text-[var(--accent-strong)] uppercase">
              {landing.brand}
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-[2rem] leading-[1.12] text-[var(--ink)] sm:text-4xl md:text-[2.75rem]">
              {landing.title}
            </h1>
            <p className="text-base leading-relaxed text-[var(--muted)] sm:text-lg">
              {landing.lead}
            </p>

            <div className="home-reassurance max-w-md space-y-1 rounded-lg border border-[var(--accent-soft)] bg-[var(--accent-soft)]/45 px-3.5 py-3">
              <p className="text-sm font-semibold text-[var(--ink)] sm:text-[0.95rem]">
                {landing.reassuranceLead}
              </p>
              <p className="text-sm text-[var(--muted)]">{landing.reassuranceFollow}</p>
            </div>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/kayit"
                className="btn btn-primary home-cta-primary w-full justify-center sm:w-auto sm:min-w-[11rem]"
              >
                {landing.ctaJoin}
              </Link>
              <Link
                href="/bolumler"
                className="btn btn-ghost w-full justify-center sm:w-auto"
              >
                {landing.ctaEpisodes}
              </Link>
              <Link
                href="/arayanlar"
                className="home-cta-tertiary inline-flex min-h-11 items-center justify-center px-1 text-sm font-medium text-[var(--accent-strong)] underline-offset-4 hover:underline sm:justify-start"
              >
                {landing.ctaArayanlar}
              </Link>
            </div>
          </div>

          <aside
            className="home-hero-what rounded-xl border border-[var(--line)] bg-[var(--panel)]/90 px-4 py-4 sm:px-5 sm:py-5"
            aria-labelledby="hero-what-heading"
          >
            <h2
              id="hero-what-heading"
              className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]"
            >
              {landing.whatTitle}
            </h2>
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {heroItems.map((item) => (
                <li key={item.key} className="flex gap-3 py-3 first:pt-1 last:pb-1">
                  <HeroWhatMark label={item.mark} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-snug text-[var(--muted)]">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="home-section max-w-2xl space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] md:text-[1.75rem]">
          {landing.openTitle}
        </h2>
        <p className="text-base leading-relaxed text-[var(--muted)]">{landing.openBody}</p>
      </section>

      <section className="home-section space-y-8" aria-labelledby="what-heading">
        <h2
          id="what-heading"
          className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] md:text-[1.75rem]"
        >
          {landing.whatTitle}
        </h2>
        <div className="grid gap-8 md:grid-cols-3 md:gap-10">
          {whatItems.map((item) => (
            <div key={item.title} className="space-y-2 border-t border-[var(--line)] pt-4">
              <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
                {item.title}
              </h3>
              <p className="text-[var(--muted)] leading-relaxed">{item.body}</p>
              <Link
                href={item.href}
                className="inline-flex min-h-10 items-center text-sm font-medium text-[var(--accent-strong)] underline-offset-4 hover:underline"
              >
                {item.linkLabel}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section
        className="home-section space-y-5 border-t border-[var(--line)] pt-10 md:pt-12"
        aria-labelledby="latest-episodes-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="latest-episodes-heading"
            className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)] md:text-2xl"
          >
            {landing.latestEpisodes}
          </h2>
          <Link
            href="/bolumler"
            className="inline-flex min-h-10 items-center text-sm text-[var(--accent-strong)] underline-offset-4 hover:underline"
          >
            {landing.allEpisodes}
          </Link>
        </div>
        {episodes.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{landing.noEpisodes}</p>
        ) : (
          <ul className="space-y-4">
            {episodes.map((ep) => (
              <li key={ep.slug}>
                <EpisodeCard episode={ep} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
