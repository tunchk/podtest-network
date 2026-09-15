/**
 * Catchylabs integration boundary (contract only in Milestone 1).
 * PodTest never connects to Catchy's database or invents provisioning success.
 */

export type CatchyAccessStatus =
  | "not_configured"
  | "available"
  | "pending"
  | "failed";

export type CatchyBenefitGrantRequest = {
  /** Stable linked account ID after ownership verification — never unverified email alone. */
  linkedAccountId: string;
  podtestUserId: string;
  benefitCode: "catchy.practice.access";
  /** Proposed: one eligible practice app slot until owner chooses apps/capacity. */
  practiceAppSlots: number;
  paidThroughAt: string | null;
  idempotencyKey: string;
};

export type CatchyBenefitStatus = {
  status: CatchyAccessStatus;
  linkedAccountId: string | null;
  practiceAppSlots: number | null;
  paidThroughAt: string | null;
  lastError: string | null;
  message: string;
};

export interface CatchylabsIntegration {
  getAccessStatus(podtestUserId: string): Promise<CatchyBenefitStatus>;
  requestBenefitProvision(request: CatchyBenefitGrantRequest): Promise<CatchyBenefitStatus>;
  requestBenefitRevoke(options: {
    linkedAccountId: string;
    podtestUserId: string;
    idempotencyKey: string;
  }): Promise<CatchyBenefitStatus>;
}

class UnconfiguredCatchylabsIntegration implements CatchylabsIntegration {
  async getAccessStatus(): Promise<CatchyBenefitStatus> {
    return {
      status: "not_configured",
      linkedAccountId: null,
      practiceAppSlots: null,
      paidThroughAt: null,
      lastError: null,
      message:
        "Catchylabs integration is not configured. Milestone 5 will wire authenticated account linking and server-to-server provision/revoke.",
    };
  }

  async requestBenefitProvision(): Promise<CatchyBenefitStatus> {
    return this.getAccessStatus();
  }

  async requestBenefitRevoke(): Promise<CatchyBenefitStatus> {
    return this.getAccessStatus();
  }
}

export function createCatchylabsIntegration(): CatchylabsIntegration {
  const enabled = process.env.CATCHYLABS_INTEGRATION_ENABLED === "true";
  const baseUrl = process.env.CATCHYLABS_API_BASE_URL;
  const token = process.env.CATCHYLABS_SERVICE_TOKEN;

  if (!enabled || !baseUrl || !token) {
    return new UnconfiguredCatchylabsIntegration();
  }

  // Live HTTP client is intentionally not implemented in Milestone 1.
  // Returning not_configured avoids speculative network calls.
  return new UnconfiguredCatchylabsIntegration();
}

export const catchylabsIntegration = createCatchylabsIntegration();
