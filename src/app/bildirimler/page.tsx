import { requireSession } from "@/lib/session";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { ui } from "@/lib/ui-copy";

export default async function BildirimlerPage() {
  await requireSession();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.nav.notifications}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Hesabına gelen bildirimler. Sayfa birkaç saniyede bir yenilenir; e-posta veya anlık bildirim
          gönderilmez.
        </p>
      </div>
      <NotificationsInbox />
    </section>
  );
}
