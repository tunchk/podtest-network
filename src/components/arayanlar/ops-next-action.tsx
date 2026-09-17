"use client";

import Link from "next/link";
import type { OpsNextAction } from "@/lib/arayanlar/operations";
import { StaffHostHandoffButton } from "@/components/arayanlar/staff-host-handoff-button";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OpsNextActionCard({
  applicationId,
  notesPath,
  nextAction,
}: {
  applicationId: string;
  notesPath: string;
  nextAction: OpsNextAction;
}) {
  return (
    <article className="panel space-y-3 border-[var(--accent)]/40 bg-[color-mix(in_oklab,var(--accent)_8%,var(--panel))]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        Sıradaki işlem
      </p>
      <h2 className="font-[family-name:var(--font-display)] text-2xl">{nextAction.label}</h2>
      {"detail" in nextAction && nextAction.detail ? (
        <p className="text-sm text-[var(--muted)]">{nextAction.detail}</p>
      ) : null}

      {nextAction.kind === "action" && nextAction.action === "host_handoff" ? (
        <StaffHostHandoffButton applicationId={applicationId} mode="send" />
      ) : null}

      {nextAction.kind === "action" && nextAction.action === "schedule" ? (
        <button type="button" className="btn btn-primary" onClick={() => scrollToId("kayit-plani")}>
          Kayıt zamanını belirle
        </button>
      ) : null}

      {nextAction.kind === "action" &&
      (nextAction.action === "send_publication_review" ||
        nextAction.action === "review_change_request" ||
        nextAction.action === "publish") ? (
        <button type="button" className="btn btn-primary" onClick={() => scrollToId("yayin-onayi")}>
          {nextAction.label}
        </button>
      ) : null}

      {nextAction.kind === "action" && nextAction.action === "open_notes" ? (
        <Link href={notesPath} className="btn btn-secondary">
          Host notlarını aç
        </Link>
      ) : null}

      {nextAction.kind === "done" && nextAction.href ? (
        <Link href={nextAction.href} className="btn btn-primary">
          Bölümü aç
        </Link>
      ) : null}
    </article>
  );
}
