export function PodTestPlusSoon({ className }: { className?: string }) {
  return (
    <p
      className={
        className ??
        "rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]"
      }
    >
      <span className="font-medium text-[var(--ink)]">PodTest+ yakında.</span> Ek üyelik
      özellikleri hazırlanıyor; şu an ödeme, abonelik veya kredi satışı yok. İşveren pilot
      yetkileri ayrı bir promosyon kaydıdır — ücretli abonelik değildir.
    </p>
  );
}
