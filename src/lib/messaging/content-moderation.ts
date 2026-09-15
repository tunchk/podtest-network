/**
 * Rule-based messaging content classifier (M3.1).
 * Honest label: not an AI moderation product.
 * Ordinary professional criticism and informal language are allowed.
 */

export type ContentClass =
  | { outcome: "clear" }
  | { outcome: "reject"; reasonCode: string; safeMessage: string }
  | { outcome: "hold"; reasonCode: string; safeMessage: string }
  | { outcome: "unavailable"; safeMessage: string };

const CLEAR_VIOLATIONS: Array<{ code: string; re: RegExp }> = [
  { code: "threat", re: /(öldüreceğim|öldür|threaten to kill|bombayı yerleştir)/i },
  { code: "doxxing", re: /(tc kimlik|sosyal güvenlik no|credit card\s*\d{4})/i },
  { code: "scam", re: /(crypto airdrop|whatsapp\s*\+?\d{10,}|iban[:\s]*tr\d{20,})/i },
];

const AMBIGUOUS: Array<{ code: string; re: RegExp }> = [
  { code: "targeted_harassment", re: /(seni mahvedeceğim|adresine geleceğim|ailene zarar)/i },
];

export const MESSAGING_MODERATION_ADAPTER = "rule-based-heuristic";
export const MESSAGING_MODERATION_POLICY_VERSION = "m3.1-messaging-rule-v1";

export function classifyMessagingContent(text: string): ContentClass {
  try {
    for (const rule of CLEAR_VIOLATIONS) {
      if (rule.re.test(text)) {
        return {
          outcome: "reject",
          reasonCode: rule.code,
          safeMessage: "Bu içerik platform kurallarına uymuyor ve gönderilemedi.",
        };
      }
    }
    for (const rule of AMBIGUOUS) {
      if (rule.re.test(text)) {
        return {
          outcome: "hold",
          reasonCode: rule.code,
          safeMessage: "İçerik inceleme için bekletildi.",
        };
      }
    }
    return { outcome: "clear" };
  } catch {
    return {
      outcome: "unavailable",
      safeMessage: "İçerik denetimi şu an kullanılamıyor; mesaj inceleme için bekletildi.",
    };
  }
}
