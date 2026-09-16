/**
 * Community content classifier (M3.2).
 * Reuses the same rule-based heuristic as messaging — not an AI moderation product.
 */
import {
  classifyMessagingContent,
  MESSAGING_MODERATION_ADAPTER,
  type ContentClass,
} from "@/lib/messaging/content-moderation";
import {
  COMMUNITY_MODERATION_ADAPTER,
  COMMUNITY_MODERATION_POLICY_VERSION,
} from "@/lib/community/constants";

export type { ContentClass };

export const COMMUNITY_CONTENT_MODERATION_ADAPTER = COMMUNITY_MODERATION_ADAPTER;
export const COMMUNITY_CONTENT_POLICY_VERSION = COMMUNITY_MODERATION_POLICY_VERSION;

/** Honest label for UI / admin surfaces. */
export function communityModerationLabel() {
  return {
    adapter: COMMUNITY_CONTENT_MODERATION_ADAPTER,
    policyVersion: COMMUNITY_CONTENT_POLICY_VERSION,
    description:
      "Kural tabanlı sezgisel denetim (yapay zeka moderasyon ürünü değildir). Belirsiz içerik bekletilir; kullanılamayan sınıflandırma yayımlamaz.",
    messagingAdapterAlias: MESSAGING_MODERATION_ADAPTER,
  };
}

export function classifyCommunityContent(text: string): ContentClass {
  return classifyMessagingContent(text);
}
