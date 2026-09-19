/**
 * Member-facing Arayanlar presentation mapping.
 * Backend enums stay unchanged; this layer only shapes UX copy/CTAs.
 */

export type ArayanlarUserFacingState =
  | "DRAFT"
  | "AWAITING_CONFIRMATION"
  | "SUBMITTED_ACCEPTED"
  | "QUEUED"
  | "RUNNING"
  | "READY"
  | "FAILED_RETRYABLE"
  | "FAILED_TERMINAL"
  | "WITHDRAWN";

export type FlowStepId = "tanisalim" | "kontrol" | "hazirlik";

export type PrepJobMeta = {
  attemptCount: number;
  maxAttempts: number;
  status: string;
} | null;

export function mapArayanlarUserFacingState(options: {
  status: string;
  prepStatus: string | null | undefined;
  prepJob?: PrepJobMeta;
}): ArayanlarUserFacingState {
  const { status, prepStatus } = options;
  if (status === "WITHDRAWN") return "WITHDRAWN";
  if (status === "DRAFT") return "DRAFT";
  if (status === "AWAITING_CONFIRMATION") return "AWAITING_CONFIRMATION";

  if (status === "SUBMITTED") {
    if (prepStatus === "READY") return "READY";
    if (prepStatus === "QUEUED") return "QUEUED";
    if (prepStatus === "RUNNING") return "RUNNING";
    if (prepStatus === "FAILED" || prepStatus === "CANCELLED") {
      const job = options.prepJob;
      if (
        job &&
        job.status === "FAILED" &&
        job.attemptCount < job.maxAttempts
      ) {
        return "FAILED_RETRYABLE";
      }
      return "FAILED_TERMINAL";
    }
    // SUBMITTED but prep not started yet — treat as accepted / about to queue
    return "SUBMITTED_ACCEPTED";
  }

  return "DRAFT";
}

export function userFacingStateLabel(state: ArayanlarUserFacingState): string {
  switch (state) {
    case "DRAFT":
      return "Bilgilerini tamamla";
    case "AWAITING_CONFIRMATION":
      return "Bilgilerini kontrol et";
    case "SUBMITTED_ACCEPTED":
      return "Başvurun alındı";
    case "QUEUED":
      return "Hazırlığın sıraya alındı";
    case "RUNNING":
      return "Hazırlığın oluşturuluyor";
    case "READY":
      return "Kayıt öncesi notların hazır";
    case "FAILED_RETRYABLE":
      return "Hazırlık tamamlanamadı";
    case "FAILED_TERMINAL":
      return "Hazırlığı şu anda tamamlayamadık";
    case "WITHDRAWN":
      return "Başvurun geri çekildi";
  }
}

/**
 * Application/preparation stepper only (Tanışalım → Kontrol → Hazırlık).
 * Recording schedule and publication live on /arayanlar/basvurum — not here.
 */
export function resolveFlowStep(options: {
  status: string;
  prepStatus: string | null | undefined;
  confirmedCostAt: string | Date | null | undefined;
}): FlowStepId {
  const { status } = options;
  if (status === "WITHDRAWN") return "tanisalim";
  if (status === "SUBMITTED") {
    // READY stays on Hazırlık — CTA opens notes; no fake Kayıt step.
    return "hazirlik";
  }
  if (status === "AWAITING_CONFIRMATION") return "kontrol";
  return "tanisalim";
}

export function flowStepStatus(
  step: FlowStepId,
  current: FlowStepId,
): "complete" | "current" | "upcoming" {
  const order: FlowStepId[] = ["tanisalim", "kontrol", "hazirlik"];
  const si = order.indexOf(step);
  const ci = order.indexOf(current);
  if (si < ci) return "complete";
  if (si === ci) return "current";
  return "upcoming";
}

export const FLOW_STEPS: Array<{ id: FlowStepId; label: string }> = [
  { id: "tanisalim", label: "Tanışalım" },
  { id: "kontrol", label: "Bilgilerini kontrol et" },
  { id: "hazirlik", label: "Hazırlık" },
];

export function isPrepWaiting(state: ArayanlarUserFacingState) {
  return state === "QUEUED" || state === "RUNNING" || state === "SUBMITTED_ACCEPTED";
}

export function shouldPollPrep(state: ArayanlarUserFacingState) {
  return isPrepWaiting(state);
}
