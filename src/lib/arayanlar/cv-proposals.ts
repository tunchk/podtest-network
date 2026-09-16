import { assertOwnedCv, readCvExtractedText } from "@/lib/cv/service";
import { prisma } from "@/lib/db";
import type { DraftAnswers } from "@/lib/arayanlar/constants";
import { scrubSensitiveCvText } from "@/lib/legal/sensitive-filter";

export type CvFactProposal = {
  answers: DraftAnswers;
  hints: string[];
  notes: string[];
  cvDocumentId: string;
  originalFilename: string;
};

function firstMatchingLine(lines: string[], pattern: RegExp): string | undefined {
  return lines.find((line) => pattern.test(line));
}

function stripLabel(line: string): string {
  return line.replace(/^[^:]{0,40}:\s*/u, "").trim();
}

/**
 * Ground editable Arayanlar fact proposals from private CV text + profile soft fields.
 * Does not invent polished stories; leaves contact empty for member confirmation.
 * Never logs CV text.
 */
export function groundDraftAnswersFromCvText(
  text: string,
  profile: {
    headline: string | null;
    workPreferences: string | null;
    skills: string[];
  } | null,
): Omit<CvFactProposal, "cvDocumentId" | "originalFilename"> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200);

  const answers: DraftAnswers = {};
  const hints: string[] = [];
  const notes: string[] = [
    "Öneriler mevcut CV metninden türetildi; onaylamadan önce düzenleyebilirsin. Ham CV sunucuya gönderilmez.",
  ];

  if (profile?.headline?.trim()) {
    answers.targetRole = profile.headline.trim();
    hints.push("profile.headline→targetRole");
  } else {
    const titleLike = lines.find(
      (line, index) =>
        index > 0 &&
        index < 8 &&
        line.length >= 8 &&
        line.length <= 90 &&
        !/@/.test(line) &&
        !/^https?:/i.test(line) &&
        !/beceri|skills?|deneyim|experience|eğitim|education|özet|summary/i.test(line),
    );
    if (titleLike) {
      answers.targetRole = titleLike;
      hints.push("cv→targetRole");
    }
  }

  if (profile?.workPreferences?.trim()) {
    answers.workPreferences = profile.workPreferences.trim();
    hints.push("profile.workPreferences");
  } else {
    const prefLine = firstMatchingLine(
      lines,
      /çalışma|remote|hibrit|hybrid|ofis|tercih|work\s*pref/i,
    );
    if (prefLine) {
      answers.workPreferences = stripLabel(prefLine).slice(0, 280);
      hints.push("cv→workPreferences");
    }
  }

  if (profile?.skills?.length) {
    answers.contribution = `Öne çıkan beceriler: ${profile.skills.slice(0, 8).join(", ")}. Bölümde kendi katkını netleştir.`;
    hints.push("profile.skills→contribution");
  } else {
    const skillLine = firstMatchingLine(lines, /beceri|skills?|yetenek/i);
    if (skillLine) {
      const skills = stripLabel(skillLine).slice(0, 280);
      if (skills) {
        answers.contribution = `Öne çıkan beceriler: ${skills}. Bölümde kendi katkını netleştir.`;
        hints.push("cv→contribution");
      }
    }
  }

  const experienceHeader = lines.findIndex((line) =>
    /deneyim|experience|iş\s*geçmişi|professional\s*experience/i.test(line),
  );
  if (experienceHeader >= 0) {
    const snippet = lines
      .slice(experienceHeader + 1, experienceHeader + 4)
      .filter((line) => line.length > 12 && !/^https?:/i.test(line))
      .join(" · ")
      .slice(0, 320);
    if (snippet) {
      answers.storyTopic = snippet;
      hints.push("cv→storyTopic");
      notes.push(
        "Hikâye konusu CV deneyim satırlarından kısaltıldı; uydurma hikâye değildir, yine de kendi sözlerinle onayla.",
      );
    }
  }

  // Contact and exclusions stay empty — member must confirm explicitly.
  answers.excludedTopics = answers.excludedTopics ?? "";
  answers.contactChannel = answers.contactChannel ?? "";
  answers.sourceHints = hints;

  return { answers, hints, notes };
}

export async function proposeArayanlarFactsFromOwnedCv(
  userId: string,
  cvDocumentId: string,
): Promise<CvFactProposal> {
  const doc = await assertOwnedCv(cvDocumentId, userId);
  if (doc.extractionStatus !== "OK") {
    throw new Error("CV_NOT_READY");
  }
  const textRaw = await readCvExtractedText(cvDocumentId, userId);
  if (!textRaw?.trim()) {
    throw new Error("CV_TEXT_MISSING");
  }
  const { text } = scrubSensitiveCvText(textRaw);

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { headline: true, workPreferences: true, skills: true },
  });

  const grounded = groundDraftAnswersFromCvText(text, profile);
  return {
    ...grounded,
    cvDocumentId: doc.id,
    originalFilename: doc.originalFilename,
  };
}
