export default function NotFound() {
  return (
    <div className="panel mx-auto max-w-lg text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Sayfa bulunamadı</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Bu profil yayımlanmamış olabilir veya adres hatalı.
      </p>
    </div>
  );
}
