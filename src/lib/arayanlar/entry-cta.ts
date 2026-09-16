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
      note: "Kayıt öncesi notların hazır.",
    };
  }
  if (app.status === "SUBMITTED") {
    return {
      href: "#basvuru",
      label: ui.arayanlar.viewStatus,
      note:
        app.prepStatus === "FAILED"
          ? "Hazırlık tamamlanamadı. Aşağıdan ücretsiz yeniden deneyebilir veya bilgilerine dönebilirsin."
          : "Başvurun alındı; hazırlık arka planda devam ediyor.",
    };
  }
  return null;
}
