/**
 * Data-minimization helpers: strip or refuse unrelated sensitive content
 * from CV-derived preparation. Heuristic only — not a compliance guarantee.
 */

const SENSITIVE_PATTERNS: Array<{ code: string; re: RegExp }> = [
  { code: "health", re: /\b(kanser|diyabet|epilepsi|hiv|hastal(?:ık|iğ)|tedavi|ilaç|engelli)\b/i },
  { code: "politics", re: /\b(parti|seçim|siyasi|politik)\b/i },
  { code: "religion", re: /\b(din|mezhep|ibadet|cami|kilise|sinagog)\b/i },
  { code: "union", re: /\b(sendika|grev)\b/i },
  { code: "family_private", re: /\b(eşimin|çocuğum|boşanma|evlat)\b/i },
];

export function findSensitiveHits(text: string): string[] {
  const hits: string[] = [];
  for (const { code, re } of SENSITIVE_PATTERNS) {
    if (re.test(text)) hits.push(code);
  }
  return [...new Set(hits)];
}

/** Remove lines that look like unrelated sensitive disclosures. */
export function scrubSensitiveCvText(text: string): { text: string; removedLines: number } {
  const lines = text.split(/\r?\n/);
  let removedLines = 0;
  const kept = lines.filter((line) => {
    if (!line.trim()) return true;
    if (findSensitiveHits(line).length) {
      removedLines += 1;
      return false;
    }
    return true;
  });
  return { text: kept.join("\n"), removedLines };
}

export const SENSITIVE_DATA_PROMPT_RULE = `
Hassas / özel nitelikli veya konu dışı kişisel verileri (sağlık, siyasi görüş, din, sendika, ailevi mahremiyet vb.) hazırlık çıktısına KOYMA.
Yalnızca mesleki deneyim, beceriler, rol ve çalışma tercihleriyle ilgili bilgileri kullan.
Eksik bilgi için uydurma veya çıkarım yapma; belirsizse needs clarification olarak bırak.
`.trim();
