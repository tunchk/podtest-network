import { describe, expect, it } from "vitest";
import {
  isPrepWaiting,
  mapArayanlarUserFacingState,
  resolveFlowStep,
  shouldPollPrep,
  userFacingStateLabel,
  FLOW_STEPS,
} from "@/lib/arayanlar/presentation";
import { arayanlarEntryCta } from "@/lib/arayanlar/entry-cta";
import { ui } from "@/lib/ui-copy";

describe("arayanlar presentation mapping", () => {
  it("maps draft and awaiting confirmation", () => {
    expect(mapArayanlarUserFacingState({ status: "DRAFT", prepStatus: "NOT_STARTED" })).toBe(
      "DRAFT",
    );
    expect(
      mapArayanlarUserFacingState({ status: "AWAITING_CONFIRMATION", prepStatus: "NOT_STARTED" }),
    ).toBe("AWAITING_CONFIRMATION");
    expect(userFacingStateLabel("DRAFT")).toBe("Bilgilerini tamamla");
    expect(userFacingStateLabel("SUBMITTED_ACCEPTED")).toBe("Başvurun alındı");
  });

  it("maps queued/running waiting states without exposing backend names in labels", () => {
    expect(mapArayanlarUserFacingState({ status: "SUBMITTED", prepStatus: "QUEUED" })).toBe(
      "QUEUED",
    );
    expect(mapArayanlarUserFacingState({ status: "SUBMITTED", prepStatus: "RUNNING" })).toBe(
      "RUNNING",
    );
    expect(userFacingStateLabel("QUEUED")).not.toMatch(/QUEUED|RUNNING|FAILED/);
    expect(userFacingStateLabel("RUNNING")).toBe("Hazırlığın oluşturuluyor");
    expect(isPrepWaiting("QUEUED")).toBe(true);
    expect(shouldPollPrep("RUNNING")).toBe(true);
    expect(shouldPollPrep("READY")).toBe(false);
  });

  it("maps ready and withdrawn", () => {
    expect(mapArayanlarUserFacingState({ status: "SUBMITTED", prepStatus: "READY" })).toBe(
      "READY",
    );
    expect(userFacingStateLabel("READY")).toBe("Kayıt öncesi notların hazır");
    expect(mapArayanlarUserFacingState({ status: "WITHDRAWN", prepStatus: "CANCELLED" })).toBe(
      "WITHDRAWN",
    );
    expect(userFacingStateLabel("WITHDRAWN")).toBe("Başvurun geri çekildi");
  });

  it("distinguishes retryable vs terminal failure from job attempts", () => {
    expect(
      mapArayanlarUserFacingState({
        status: "SUBMITTED",
        prepStatus: "FAILED",
        prepJob: { attemptCount: 1, maxAttempts: 3, status: "FAILED" },
      }),
    ).toBe("FAILED_RETRYABLE");
    expect(userFacingStateLabel("FAILED_RETRYABLE")).toBe("Hazırlık tamamlanamadı");
    expect(
      mapArayanlarUserFacingState({
        status: "SUBMITTED",
        prepStatus: "FAILED",
        prepJob: { attemptCount: 3, maxAttempts: 3, status: "FAILED" },
      }),
    ).toBe("FAILED_TERMINAL");
    expect(userFacingStateLabel("FAILED_TERMINAL")).toBe("Hazırlığı şu anda tamamlayamadık");
    expect(
      mapArayanlarUserFacingState({
        status: "SUBMITTED",
        prepStatus: "FAILED",
        prepJob: null,
      }),
    ).toBe("FAILED_TERMINAL");
  });

  it("resolves flow stepper without allowing invalid jumps", () => {
    expect(FLOW_STEPS.map((s) => s.label)).toEqual([
      "Tanışalım",
      "Bilgilerini kontrol et",
      "Hazırlık",
      "Kayıt",
    ]);
    expect(
      resolveFlowStep({ status: "DRAFT", prepStatus: "NOT_STARTED", confirmedCostAt: null }),
    ).toBe("tanisalim");
    expect(
      resolveFlowStep({
        status: "AWAITING_CONFIRMATION",
        prepStatus: "NOT_STARTED",
        confirmedCostAt: new Date(),
      }),
    ).toBe("kontrol");
    expect(
      resolveFlowStep({ status: "SUBMITTED", prepStatus: "RUNNING", confirmedCostAt: new Date() }),
    ).toBe("hazirlik");
    expect(
      resolveFlowStep({ status: "SUBMITTED", prepStatus: "READY", confirmedCostAt: new Date() }),
    ).toBe("kayit");
  });

  it("reload restores facing state from server fields without requiring resubmit", () => {
    // Leaving the page does not cancel prep; remount remaps the same server row.
    const restored = mapArayanlarUserFacingState({
      status: "SUBMITTED",
      prepStatus: "RUNNING",
      prepJob: { attemptCount: 1, maxAttempts: 3, status: "RUNNING" },
    });
    expect(restored).toBe("RUNNING");
    expect(shouldPollPrep(restored)).toBe(true);

    const readyOnReturn = mapArayanlarUserFacingState({
      status: "SUBMITTED",
      prepStatus: "READY",
    });
    expect(readyOnReturn).toBe("READY");
    expect(shouldPollPrep(readyOnReturn)).toBe(false);
  });

  it("polling helpers are read-only wait signals (no job creation implied)", () => {
    for (const state of ["QUEUED", "RUNNING", "SUBMITTED_ACCEPTED"] as const) {
      expect(shouldPollPrep(state)).toBe(true);
    }
    for (const state of [
      "DRAFT",
      "AWAITING_CONFIRMATION",
      "READY",
      "FAILED_RETRYABLE",
      "FAILED_TERMINAL",
      "WITHDRAWN",
    ] as const) {
      expect(shouldPollPrep(state)).toBe(false);
    }
  });
});

describe("arayanlar entry CTA copy", () => {
  it("uses explicit CTAs for each state", () => {
    expect(arayanlarEntryCta(null)?.label).toBe(ui.arayanlar.apply);
    expect(arayanlarEntryCta({ status: "DRAFT", prepStatus: null })?.label).toBe(
      ui.arayanlar.continue,
    );
    expect(arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "READY" })?.label).toBe(
      ui.arayanlar.viewPrep,
    );
    expect(arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "QUEUED" })?.label).toBe(
      ui.arayanlar.viewStatus,
    );
    expect(arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "QUEUED" })?.note).toMatch(
      /arka planda/,
    );
    expect(arayanlarEntryCta({ status: "WITHDRAWN", prepStatus: null })?.label).toBe(
      ui.arayanlar.restart,
    );
  });

  it("does not surface raw backend statuses or ledger terms in CTA labels", () => {
    for (const status of ["QUEUED", "RUNNING", "FAILED", "READY"] as const) {
      const cta = arayanlarEntryCta({ status: "SUBMITTED", prepStatus: status });
      const blob = `${cta?.label ?? ""} ${cta?.note ?? ""}`;
      expect(blob).not.toMatch(/QUEUED|RUNNING|FAILED|READY|RESERVE|SETTLE|Artifact|Job sırada/);
    }
  });
});

describe("arayanlar credit UX presentation helpers", () => {
  it("unlimited quote shape never blocks affordability", () => {
    // Mirrors quoteArayanlarPrepare UNLIMITED_INTERNAL branch — member UX hides credit warnings.
    const unlimitedQuote = {
      cost: 1,
      canAffordAfterGrant: true,
      unlimitedInternal: true as const,
    };
    expect(unlimitedQuote.canAffordAfterGrant).toBe(true);
    expect(unlimitedQuote.unlimitedInternal).toBe(true);
  });

  it("member-facing labels never include ledger vocabulary", () => {
    const labels = [
      userFacingStateLabel("QUEUED"),
      userFacingStateLabel("RUNNING"),
      userFacingStateLabel("READY"),
      userFacingStateLabel("FAILED_RETRYABLE"),
      ui.arayanlar.viewPrep,
      ui.arayanlar.viewStatus,
      "Ücretsiz yeniden dene",
      "Teknik yeniden deneme ek kredi kullanmaz.",
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/RESERVE|SETTLE|RELEASE|ledger|Preparation job|Artifact/i);
    }
  });
});
