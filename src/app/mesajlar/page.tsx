import { requireSession } from "@/lib/session";
import { MessagingHub } from "@/components/messaging/messaging-hub";

export default async function MesajlarPage() {
  await requireSession();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">Mesajlar</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Mesaj istekleri kabul edildikten sonra özel konuşma başlar. Anket yok; sayfa periyodik olarak yenilenir.
        </p>
      </div>
      <MessagingHub />
    </section>
  );
}
