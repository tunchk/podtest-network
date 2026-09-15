/**
 * Central capability catalog and server-side evaluator.
 * Plans grant capabilities; never scatter `plan === "PLUS"` checks in product code.
 * Unknown capability keys deny by default.
 */

export type PlanCode = "FREE" | "PLUS" | "EMPLOYER";

export type CapabilityKey =
  | "ai.profile.prepare"
  | "ai.arayanlar.prepare"
  | "network.message_request.create"
  | "hiring.search.advanced"
  | "hiring.job.publish"
  | "content.premium.access"
  | "events.member_discount"
  | "catchy.practice.access"
  | "catchy.practice_app.slots"
  | "catchy.test.create"
  | "catchy.test.solve";

export type CapabilityDefinition = {
  key: CapabilityKey;
  description: string;
  /** Plans that include this capability by default (documented for later billing). */
  plans: PlanCode[];
  /** Soft limit hints for later quotas; not enforced as a ledger in M1. */
  monthlyQuotaHint?: number;
  milestone: "M2" | "M3" | "M4" | "M5" | "M6";
};

export const CAPABILITY_CATALOG: Record<CapabilityKey, CapabilityDefinition> = {
  "ai.profile.prepare": {
    key: "ai.profile.prepare",
    description: "AI-assisted profile draft from CV or description",
    plans: ["PLUS", "EMPLOYER"],
    monthlyQuotaHint: 5,
    milestone: "M2",
  },
  "ai.arayanlar.prepare": {
    key: "ai.arayanlar.prepare",
    description: "Arayanlar guest brief / host pack preparation",
    plans: ["PLUS", "EMPLOYER"],
    monthlyQuotaHint: 1,
    milestone: "M2",
  },
  "network.message_request.create": {
    key: "network.message_request.create",
    description: "Create a new direct message request",
    plans: ["FREE", "PLUS", "EMPLOYER"],
    monthlyQuotaHint: 5,
    milestone: "M3",
  },
  "hiring.search.advanced": {
    key: "hiring.search.advanced",
    description: "Advanced hiring filters and saved searches",
    plans: ["EMPLOYER"],
    milestone: "M3",
  },
  "hiring.job.publish": {
    key: "hiring.job.publish",
    description: "Publish employer job postings",
    plans: ["EMPLOYER"],
    milestone: "M4",
  },
  "content.premium.access": {
    key: "content.premium.access",
    description: "Access paid premium content",
    plans: ["PLUS", "EMPLOYER"],
    milestone: "M4",
  },
  "events.member_discount": {
    key: "events.member_discount",
    description: "Member discount on webinars/events",
    plans: ["PLUS", "EMPLOYER"],
    milestone: "M6",
  },
  "catchy.practice.access": {
    key: "catchy.practice.access",
    description: "Access Catchylabs practice apps via linked account",
    plans: ["PLUS"],
    milestone: "M5",
  },
  "catchy.practice_app.slots": {
    key: "catchy.practice_app.slots",
    description: "Eligible Catchylabs practice app slots",
    plans: ["PLUS"],
    monthlyQuotaHint: 1,
    milestone: "M5",
  },
  "catchy.test.create": {
    key: "catchy.test.create",
    description: "Author Catchylabs tests (future package)",
    plans: [],
    milestone: "M5",
  },
  "catchy.test.solve": {
    key: "catchy.test.solve",
    description: "Solve Catchylabs tests under granted quotas",
    plans: ["PLUS"],
    milestone: "M5",
  },
};

/** FREE baseline: ordinary membership features are not capability-gated. */
export const PLAN_DEFINITIONS: Record<
  PlanCode,
  { label: string; capabilityKeys: CapabilityKey[]; status: "active" | "documented_future" }
> = {
  FREE: {
    label: "Free membership",
    capabilityKeys: (Object.keys(CAPABILITY_CATALOG) as CapabilityKey[]).filter((key) =>
      CAPABILITY_CATALOG[key].plans.includes("FREE"),
    ),
    status: "active",
  },
  PLUS: {
    label: "PodTest+ (documented for Milestone 4)",
    capabilityKeys: (Object.keys(CAPABILITY_CATALOG) as CapabilityKey[]).filter((key) =>
      CAPABILITY_CATALOG[key].plans.includes("PLUS"),
    ),
    status: "documented_future",
  },
  EMPLOYER: {
    label: "Employer (documented for Milestone 4)",
    capabilityKeys: (Object.keys(CAPABILITY_CATALOG) as CapabilityKey[]).filter((key) =>
      CAPABILITY_CATALOG[key].plans.includes("EMPLOYER"),
    ),
    status: "documented_future",
  },
};

export type CapabilityEvaluation = {
  allowed: boolean;
  reason:
    | "granted"
    | "unknown_capability"
    | "not_entitled"
    | "expired"
    | "revoked";
  capabilityKey: string;
  source?: string;
};

export type GrantRecord = {
  capabilityKey: string;
  source: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

function isActiveGrant(grant: GrantRecord, now: Date) {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Evaluate a capability for a user. Unknown keys always deny.
 * FREE plan catalog keys are included only when an active grant exists or
 * when the key is on the FREE plan and the caller passes `baselinePlan: "FREE"`.
 */
export function evaluateCapability(options: {
  capabilityKey: string;
  grants: GrantRecord[];
  baselinePlan?: PlanCode;
  now?: Date;
}): CapabilityEvaluation {
  const now = options.now ?? new Date();
  const key = options.capabilityKey;

  if (!(key in CAPABILITY_CATALOG)) {
    return {
      allowed: false,
      reason: "unknown_capability",
      capabilityKey: key,
    };
  }

  const matching = options.grants.filter((g) => g.capabilityKey === key);
  const active = matching.find((g) => isActiveGrant(g, now));
  if (active) {
    return {
      allowed: true,
      reason: "granted",
      capabilityKey: key,
      source: active.source,
    };
  }

  const expired = matching.find((g) => g.expiresAt && g.expiresAt.getTime() <= now.getTime());
  if (expired && !expired.revokedAt) {
    return {
      allowed: false,
      reason: "expired",
      capabilityKey: key,
      source: expired.source,
    };
  }

  const revoked = matching.find((g) => g.revokedAt);
  if (revoked) {
    return {
      allowed: false,
      reason: "revoked",
      capabilityKey: key,
      source: revoked.source,
    };
  }

  const definition = CAPABILITY_CATALOG[key as CapabilityKey];
  if (options.baselinePlan && definition.plans.includes(options.baselinePlan)) {
    // Documented FREE plan entitlements still require an explicit grant row in M1
    // for auditable provenance, except we allow baseline FREE checks for tests
    // via grants. Product code should call requireCapability which loads grants.
  }

  return {
    allowed: false,
    reason: "not_entitled",
    capabilityKey: key,
  };
}

export function assertKnownCapability(capabilityKey: string): capabilityKey is CapabilityKey {
  return capabilityKey in CAPABILITY_CATALOG;
}
