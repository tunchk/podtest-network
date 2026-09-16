import { ui } from "@/lib/ui-copy";

export type ArayanlarEntryApp = {
  status: "DRAFT" | "AWAITING_CONFIRMATION" | "SUBMITTED" | "WITHDRAWN";
  prepStatus: string | null;
} | null;

export type ArayanlarEntryCta = {
  href: string;
  label: string;
  note?: string;
};

/** State-aware primary CTA for the Arayanlar landing page. */
export function arayanlarEntryCta(app: ArayanlarEntryApp): ArayanlarEntryCta | null {
  if (!app || app.status === "WITHDRAWN") {
    return {
      href: "#basvuru",
      label: app?.status === "WITHDRAWN" ? ui.arayanlar.restart : ui.arayanlar.apply,
      note: app?.status === "WITHDRAWN" ? "Önceki başvurunu geri çekmiştin." : undefined,
    };
  }
  if (app.status === "DRAFT" || app.status === "AWAITING_CONFIRMATION") {
    return {
      href: "#basvuru",
      label: ui.arayanlar.continue,
    };
  }
  if (app.status === "SUBMITTED" && app.prepStatus === "READY") {
    return {
      href: "/arayanlar/hazirligim",
      label: ui.arayanlar.viewPrep,
      note: "Hazırlığın hazır.",
    };
  }
  if (app.status === "SUBMITTED") {
    return {
      href: "#basvuru",
      label: ui.arayanlar.viewStatus,
      note:
        app.prepStatus === "FAILED"
          ? "Hazırlık tamamlanamadı. Aşağıdan durumu kontrol edebilir veya mevcut kurtarma adımlarını kullanabilirsin."
          : "Başvurun alındı; hazırlık sürüyor.",
    };
  }
  return null;
}
