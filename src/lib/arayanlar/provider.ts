import OpenAI from "openai";
import {
  ARAYANLAR_PREPARE_JSON_SCHEMA,
  arayanlarPrepareOutputSchema,
  FIXED_CLOSING_QUESTION,
  PREPARATION_SCHEMA_VERSION,
  type ArayanlarPrepareOutput,
  type ArayanlarPreparation,
} from "@/lib/arayanlar/artifact-schema";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";
import {
  isProductionRuntime,
  resolveProviderConfig,
  type AiProviderMode,
} from "@/lib/ai/provider";
import {
  ARAYANLAR_PREP_REASONING_EFFORT,
  resolveArayanlarPrepModel,
} from "@/lib/arayanlar/prep-model";

export type ArayanlarPrepareResult =
  | { ok: true; mode: AiProviderMode; output: ArayanlarPrepareOutput; labeledStub: boolean }
  | { ok: false; mode: AiProviderMode; code: string; message: string };

export type PrepareGroundingInput = {
  facts: SubmittedFacts;
  editorialTemplateVersion: string;
  /** Extracted CV text for evidence grounding — never returned to client as-is. */
  cvText?: string | null;
  profileHints?: {
    headline?: string | null;
    bio?: string | null;
    skills?: string[] | null;
  } | null;
};

const PREPARE_SYSTEM = `Sen PodTest Kariyer Portresi için yapımcı araştırma notları üretirsin.

Ürün tezi: "CV ne yaptığını söylüyor. Biz nasıl düşündüğünü de göstermeye çalışıyoruz."
Bu bir genel mülakat/podcast koçluğu ürünü DEĞİLDİR.

Sabit kayıt formatı (AI üretmez, yalnızca notları bu yapıya hizmet eder):
1) Sen kimsin?
2) Bana bir hikâye anlat
3) Masaya bir problem koyuyorum
4) Ben ne arıyorum?
5) Hızlı tur
6) Kapanış

YASAK çıktılar:
- cold open / soğuk açılış metni
- kayıt timeline / zaman çizelgesi
- ekipman, mikrofon, ortam, checklist tavsiyesi
- genel özgüven / koçluk tavsiyesi
- uydurma başarı, metrik, ekip büyüklüğü, terfi, etki
- düşünme senaryosuna model cevabı
- kapanış sorusuna hazır cevap metni
- iş arama tercihlerini iş geçmişinden kesin tercih diye yazmak

Kanıt kuralları:
- Yalnızca CV metni + onaylı başvuru gerçekleri + onaylı profil alanlarından doğrulananları "olgu" yaz.
- Eksik bilgiyi açıkça missing olarak yaz; bu başarıdır.
- Hipotetik içerik YALNIZCA thinkingScenario içindedir.
- Türkçe yaz. Profesyonel, spesifik, yapımcı dili.

Özgüllük testi (zorunlu):
"Bu not, küçük değişikliklerle 100 benzer QA/mühendislik profesyoneline uyuyorsa, adayın somut kanıtıyla yeniden yaz."

Kaçınılacak genel ifadeler (kanıta bağlanmadıkça):
"Deneyimlerinizi düşünün", "Başarılarınızı anlatın", "Güçlü yönlerinizi paylaşın", "Örneklerle destekleyin", "Kendinizi net ifade edin", "Ortamınızı hazırlayın".

closingPrep.fixedQuestion tam olarak şu olmalı:
${FIXED_CLOSING_QUESTION}

schemaVersion tam olarak "${PREPARATION_SCHEMA_VERSION}" olmalı.
storyCandidates en fazla 3; rapidFire 5–8 madde.
JSON şemasına sıkı uy.`;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function scrubFacts(facts: SubmittedFacts): SubmittedFacts {
  // sync import avoided — caller may already scrub; keep local soft trim
  return {
    ...facts,
    targetRole: facts.targetRole?.trim() ?? "",
    storyTopic: facts.storyTopic?.trim() ?? "",
    contribution: facts.contribution?.trim() ?? "",
    workPreferences: facts.workPreferences?.trim() ?? "",
    excludedTopics: facts.excludedTopics?.trim() ?? "",
    contactChannel: facts.contactChannel?.trim() ?? "",
  };
}

/** Coerce near-valid provider JSON without inventing biography. */
export function normalizeArayanlarOutput(
  raw: unknown,
  facts: SubmittedFacts,
): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const root = raw as Record<string, unknown>;
  const prepRaw =
    root.preparation && typeof root.preparation === "object"
      ? (root.preparation as Record<string, unknown>)
      : root;

  const identity =
    prepRaw.identityPrep && typeof prepRaw.identityPrep === "object"
      ? (prepRaw.identityPrep as Record<string, unknown>)
      : {};
  const job =
    prepRaw.jobSearchPrep && typeof prepRaw.jobSearchPrep === "object"
      ? (prepRaw.jobSearchPrep as Record<string, unknown>)
      : {};
  const thinking =
    prepRaw.thinkingScenario && typeof prepRaw.thinkingScenario === "object"
      ? (prepRaw.thinkingScenario as Record<string, unknown>)
      : {};
  const closing =
    prepRaw.closingPrep && typeof prepRaw.closingPrep === "object"
      ? (prepRaw.closingPrep as Record<string, unknown>)
      : {};

  let signals = asStringArray(identity.profileSignals);
  while (signals.length < 3) {
    const fillers = [
      facts.targetRole ? `Onaylı hedef yön: ${facts.targetRole}` : "Hedef rol onaylı metinde net değil",
      facts.storyTopic
        ? `Onaylı deneyim konusu: ${facts.storyTopic.slice(0, 120)}`
        : "Seçilmiş hikâye konusu net değil",
      facts.contribution
        ? `Onaylı katkı ifadesi: ${facts.contribution.slice(0, 120)}`
        : "Katkı ifadesi net değil",
    ];
    signals.push(fillers[signals.length]!);
  }
  signals = signals.slice(0, 6);

  let themes = asStringArray(identity.careerThemes);
  if (!themes.length) themes = ["Onaylı başvuru verilerinden tema çıkarımı sınırlı"];
  themes = themes.slice(0, 8);

  let stories = Array.isArray(prepRaw.storyCandidates) ? [...prepRaw.storyCandidates] : [];
  if (!stories.length) {
    stories = [
      {
        title: facts.storyTopic || "Onaylı deneyim konusu",
        sourceExperience: facts.storyTopic || "Başvuruda belirtilen deneyim",
        whyThisCouldBeAStory:
          "Üyenin onayladığı konu; ölçülebilir sonuç CV/başvuruda yoksa eksik olarak işaretlenmeli.",
        knownFacts: [
          facts.storyTopic || "Konu belirsiz",
          facts.contribution || "Katkı belirsiz",
        ].filter(Boolean),
        missingDetails: [
          "Ölçülebilir sonuç belirtilmemiş olabilir",
          "Karar / trade-off detayı eksik olabilir",
        ],
        guestPrepQuestions: [
          "Bu deneyimde somut olarak ne değişti ve bunu neyle kanıtlıyorsun?",
        ],
        hostQuestions: ["Bu hikâyede asıl belirsizlik neydi?"],
        followUpQuestions: ["Senin kişisel kararın neydi?"],
        sourceReferences: ["submitted_facts.storyTopic"],
      },
    ];
  }
  stories = stories.slice(0, 3).map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const known = asStringArray(row.knownFacts);
    return {
      title: asString(row.title, facts.storyTopic || "Deneyim adayı"),
      sourceExperience: asString(row.sourceExperience, "CV / onaylı başvuru"),
      whyThisCouldBeAStory: asString(
        row.whyThisCouldBeAStory,
        "Adayın kendi deneyimine bağlı potansiyel hikâye.",
      ),
      knownFacts: known.length ? known.slice(0, 12) : [facts.storyTopic || "Belirsiz"],
      missingDetails: asStringArray(row.missingDetails).slice(0, 12),
      guestPrepQuestions: (() => {
        const q = asStringArray(row.guestPrepQuestions);
        return q.length ? q.slice(0, 8) : ["Bu deneyimde eksik kalan somut detay nedir?"];
      })(),
      hostQuestions: (() => {
        const q = asStringArray(row.hostQuestions);
        return q.length ? q.slice(0, 8) : ["Bu hikâyede trade-off neydi?"];
      })(),
      followUpQuestions: asStringArray(row.followUpQuestions).slice(0, 8),
      sourceReferences: (() => {
        const s = asStringArray(row.sourceReferences);
        return s.length ? s.slice(0, 8) : ["submitted_facts"];
      })(),
    };
  });

  let rapid = Array.isArray(prepRaw.rapidFire) ? [...prepRaw.rapidFire] : [];
  const rapidDefaults = [
    {
      question: `${facts.targetRole || "Hedef rol"} bağlamında kalite sinyalini nasıl ayırırsın?`,
      whyThisQuestionFits: "Onaylı hedef role bağlı.",
    },
    {
      question: "Bir otomasyon kararında neyi bilerek yapmazsın?",
      whyThisQuestionFits: "Kalite/otomasyon trade-off’unu yoklar.",
    },
    {
      question: "Danışmanlık ile ürün ekibi temposu sende nasıl ayrışır?",
      whyThisQuestionFits: "Kariyer bağlamı sorusu; cevap uydurulmaz.",
    },
    {
      question: "Bir metrik eksikse önce hangi kanıta bakarsın?",
      whyThisQuestionFits: "Eksik ölçümü açıkça yoklar.",
    },
    {
      question: "Sahiplik belirsizken ilk netleştirdiğin şey nedir?",
      whyThisQuestionFits: "Sahiplik ve koordinasyon dinler.",
    },
  ];
  while (rapid.length < 5) rapid.push(rapidDefaults[rapid.length]!);
  rapid = rapid.slice(0, 8).map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      question: asString(row.question, "Kısa, adaya özgü bir soru"),
      whyThisQuestionFits: asString(row.whyThisQuestionFits, "Aday bağlamına bağlı"),
    };
  });

  const knownPrefs = asStringArray(job.knownPreferences);
  if (facts.workPreferences?.trim() && !knownPrefs.length) {
    knownPrefs.push(`Onaylı çalışma tercihi: ${facts.workPreferences}`);
  }

  const preparation: ArayanlarPreparation = {
    identityPrep: {
      profileSignals: signals,
      careerThemes: themes,
      careerTransitions: asStringArray(identity.careerTransitions).slice(0, 8),
      confirmedFacts: (() => {
        const c = asStringArray(identity.confirmedFacts);
        if (c.length) return c.slice(0, 12);
        return [
          facts.displayName ? `Görünen ad onaylı: ${facts.displayName}` : "Ad belirsiz",
          facts.targetRole ? `Hedef rol onaylı: ${facts.targetRole}` : "Hedef rol belirsiz",
        ].filter(Boolean);
      })(),
      missingInformation: asStringArray(identity.missingInformation).slice(0, 12),
      guestPrepQuestions: (() => {
        const q = asStringArray(identity.guestPrepQuestions);
        return q.length
          ? q.slice(0, 8)
          : ["Profesyonel kimliğini hangi 2 somut örnekle anlatırsın?"];
      })(),
      hostQuestions: (() => {
        const q = asStringArray(identity.hostQuestions);
        return q.length ? q.slice(0, 8) : ["Bugün kendini hangi rolle tanımlıyorsun ve neden?"];
      })(),
    },
    storyCandidates: stories,
    thinkingScenario: {
      scenario: asString(
        thinking.scenario,
        "Ürün alanında tekrarlayan kalite regresyonları artıyor; kök neden belirsiz, sprint baskısı var.",
      ),
      whyItFitsThisCandidate: asString(
        thinking.whyItFitsThisCandidate,
        facts.targetRole
          ? `${facts.targetRole} yönüne uygun bir kalite/öncelik belirsizliği.`
          : "Kalite ve öncelik belirsizliği senaryosu.",
      ),
      whatTheHostShouldListenFor: (() => {
        const w = asStringArray(thinking.whatTheHostShouldListenFor);
        return w.length >= 2
          ? w.slice(0, 10)
          : ["Netleştirme soruları soruyor mu", "Semptom ile nedeni ayırıyor mu"];
      })(),
      constraints: (() => {
        const c = asStringArray(thinking.constraints);
        return c.length ? c.slice(0, 8) : ["Sınırlı zaman", "Eksik metrik"];
      })(),
    },
    jobSearchPrep: {
      knownPreferences: knownPrefs.slice(0, 12),
      inferredButUnconfirmed: asStringArray(job.inferredButUnconfirmed).slice(0, 12),
      missingInformation: (() => {
        const m = asStringArray(job.missingInformation);
        return m.length
          ? m.slice(0, 12)
          : ["Hedef unvan netliği", "Remote/hybrid tercihi", "People-management isteği"];
      })(),
      guestPrepQuestions: (() => {
        const q = asStringArray(job.guestPrepQuestions);
        return q.length ? q.slice(0, 8) : ["Aradığın ekip tipini somut olarak nasıl tanımlarsın?"];
      })(),
      hostQuestions: (() => {
        const q = asStringArray(job.hostQuestions);
        return q.length ? q.slice(0, 8) : ["Ne arıyorsun — rol mü, problem alanı mı, tempo mu?"];
      })(),
    },
    rapidFire: rapid,
    closingPrep: {
      fixedQuestion: FIXED_CLOSING_QUESTION,
      guestReflectionPrompts: (() => {
        const p = asStringArray(closing.guestReflectionPrompts);
        return p.length >= 2
          ? p.slice(0, 4)
          : [
              "Seni ayıran somut bir çalışma biçimini tek cümlede düşün.",
              "Dinleyen bir hiring manager’a hangi kanıtı bırakmak istersin?",
            ];
      })(),
    },
    overallMissingInformation: asStringArray(prepRaw.overallMissingInformation).slice(0, 20),
  };

  return {
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    preparation,
  };
}

function stubOutput(facts: SubmittedFacts): ArayanlarPrepareOutput {
  const preparation: ArayanlarPreparation = {
    identityPrep: {
      profileSignals: [
        facts.targetRole
          ? `Onaylı hedef yön: ${facts.targetRole}`
          : "Hedef rol başvuru metninde net değil",
        facts.storyTopic
          ? `Onaylı deneyim odağı mevcut`
          : "Hikâye konusu başvuru metninde net değil",
        facts.contribution
          ? `Onaylı katkı ifadesi mevcut`
          : "Katkı ifadesi başvuru metninde net değil",
      ],
      careerThemes: ["[STUB] Tema çıkarımı sınırlı — canlı model CV kanıtı kullanır"],
      careerTransitions: [],
      confirmedFacts: [
        `Görünen ad: ${facts.displayName}`,
        facts.workPreferences
          ? `Onaylı çalışma tercihi: ${facts.workPreferences}`
          : "Çalışma tercihi boş",
      ],
      missingInformation: ["CV’den ölçülebilir sonuçlar stub’da işlenmez"],
      guestPrepQuestions: [
        "Kimliğini hangi iki somut deneyimle anlatırsın — sonuç iddiası uydurmadan?",
      ],
      hostQuestions: ["Bugün kendini hangi rolle tanımlıyorsun ve bunu neye dayandırıyorsun?"],
    },
    storyCandidates: [
      {
        title: facts.storyTopic || "Onaylı deneyim",
        sourceExperience: facts.storyTopic || "submitted_facts.storyTopic",
        whyThisCouldBeAStory:
          "Üyenin onayladığı konu; belirsizlik/trade-off potansiyeli sorulabilir.",
        knownFacts: [facts.storyTopic || "Konu belirsiz", facts.contribution || "Katkı belirsiz"],
        missingDetails: ["Ölçülebilir sonuç belirtilmemiş olabilir"],
        guestPrepQuestions: ["Bu deneyimde somut olarak ne değişti?"],
        hostQuestions: ["Asıl zorluk neydi?"],
        followUpQuestions: ["Senin kararın neydi?"],
        sourceReferences: ["submitted_facts.storyTopic"],
      },
    ],
    thinkingScenario: {
      scenario:
        "Bir domain’de regresyonlar artıyor; metrik eksik, sprint baskısı var. Nereden başlarsın?",
      whyItFitsThisCandidate: facts.targetRole
        ? `${facts.targetRole} yönüne uygun kalite belirsizliği.`
        : "Kalite belirsizliği senaryosu.",
      whatTheHostShouldListenFor: [
        "Netleştirme soruları",
        "Semptom/neden ayrımı",
        "Risk önceliği",
      ],
      constraints: ["Eksik metrik", "Sınırlı süre"],
    },
    jobSearchPrep: {
      knownPreferences: facts.workPreferences
        ? [`Onaylı: ${facts.workPreferences}`]
        : [],
      inferredButUnconfirmed: [],
      missingInformation: ["Hedef unvan", "Remote/hybrid", "People-management tercihi"],
      guestPrepQuestions: ["Aradığın ekip tipini somut nasıl tanımlarsın?"],
      hostQuestions: ["Ne arıyorsun — problem alanı mı, tempo mu?"],
    },
    rapidFire: [
      {
        question: "Kalite sinyalini gürültüden nasıl ayırırsın?",
        whyThisQuestionFits: "Stub hızlı tur — aday bağlamına uyum için canlı model gerekir.",
      },
      {
        question: "Otomasyonda bilerek yapmayacağın şey?",
        whyThisQuestionFits: "Trade-off yoklar.",
      },
      {
        question: "Sahiplik belirsizken ilk netleştirdiğin şey?",
        whyThisQuestionFits: "Sahiplik dinler.",
      },
      {
        question: "Metrik yoksa hangi kanıta bakarsın?",
        whyThisQuestionFits: "Eksik ölçüm.",
      },
      {
        question: "Koçluk ile hands-on işi nasıl dengelersin?",
        whyThisQuestionFits: "Kapsam dengesi.",
      },
    ],
    closingPrep: {
      fixedQuestion: FIXED_CLOSING_QUESTION,
      guestReflectionPrompts: [
        "Seni ayıran somut çalışma biçimini tek cümlede düşün.",
        "Dinleyene bırakmak istediğin kanıt nedir?",
      ],
    },
    overallMissingInformation: [
      "[YEREL DEMO STUB — canlı AI değil]",
      "CV kanıtı stub yolunda işlenmez",
    ],
  };

  return { schemaVersion: PREPARATION_SCHEMA_VERSION, preparation };
}

export async function generateArayanlarPreparation(
  input: PrepareGroundingInput,
): Promise<ArayanlarPrepareResult> {
  const { scrubSensitiveCvText } = await import("@/lib/legal/sensitive-filter");
  const scrubField = (value: string) => scrubSensitiveCvText(value).text;
  const facts = scrubFacts({
    ...input.facts,
    targetRole: scrubField(input.facts.targetRole ?? ""),
    storyTopic: scrubField(input.facts.storyTopic ?? ""),
    contribution: scrubField(input.facts.contribution ?? ""),
    workPreferences: scrubField(input.facts.workPreferences ?? ""),
    excludedTopics: scrubField(input.facts.excludedTopics ?? ""),
    contactChannel: scrubField(input.facts.contactChannel ?? ""),
    memberNotes: input.facts.memberNotes
      ? scrubField(input.facts.memberNotes)
      : input.facts.memberNotes,
  });

  const cvText = input.cvText
    ? scrubSensitiveCvText(input.cvText.slice(0, 50_000)).text
    : "";

  const resolution = resolveProviderConfig();

  if (resolution.mode === "unavailable") {
    return {
      ok: false,
      mode: "unavailable",
      code: resolution.errorCode ?? "provider_unavailable",
      message:
        resolution.errorCode === "invalid_production_provider_config"
          ? "Geçersiz üretim yapılandırması: stub yapay zekâ NODE_ENV=production iken kullanılamaz."
          : "Yapay zekâ sağlayıcısı yapılandırılmadı.",
    };
  }

  if (resolution.mode === "stub") {
    if (isProductionRuntime()) {
      return {
        ok: false,
        mode: "unavailable",
        code: "invalid_production_provider_config",
        message: "Geçersiz üretim yapılandırması: stub yasak.",
      };
    }
    return {
      ok: true,
      mode: "stub",
      labeledStub: true,
      output: stubOutput(facts),
    };
  }

  const model = resolveArayanlarPrepModel();
  // Producer-notes + medium reasoning can exceed 2 minutes; fail before the lease window.
  const OPENAI_TIMEOUT_MS = 8 * 60_000;
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: OPENAI_TIMEOUT_MS,
  });

  try {
    const response = await client.responses.create({
      model,
      reasoning: { effort: ARAYANLAR_PREP_REASONING_EFFORT },
      input: [
        { role: "system", content: PREPARE_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            editorialTemplateVersion: input.editorialTemplateVersion,
            confirmedApplicationFacts: facts,
            profileHints: input.profileHints ?? null,
            cvExtractedText: cvText || null,
            cvAvailable: Boolean(cvText),
            productRules: {
              producerResearchNotInterviewCoaching: true,
              missingInformationIsSuccess: true,
              hypotheticalOnlyInThinkingScenario: true,
              noColdOpen: true,
              noTimeline: true,
              noEquipmentChecklist: true,
              noInventedAchievements: true,
              fixedClosingQuestion: FIXED_CLOSING_QUESTION,
              specificityTest:
                "If a note could apply to 100 similar professionals, rewrite with concrete candidate evidence.",
            },
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "arayanlar_prepare",
          strict: true,
          schema: ARAYANLAR_PREPARE_JSON_SCHEMA,
        },
      },
    });

    const text = response.output_text;
    if (!text) {
      return {
        ok: false,
        mode: "openai",
        code: "empty_response",
        message: "Sağlayıcı boş yanıt döndü.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        mode: "openai",
        code: "malformed_output",
        message: "Sağlayıcı çıktısı doğrulanamadı.",
      };
    }

    const normalized = normalizeArayanlarOutput(parsed, facts);
    const validated = arayanlarPrepareOutputSchema.safeParse(normalized);
    if (!validated.success) {
      return {
        ok: false,
        mode: "openai",
        code: "schema_mismatch",
        message: `Sağlayıcı çıktısı şemaya uymadı; hazırlık tamamlanmadı. (${validated.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")})`,
      };
    }

    return {
      ok: true,
      mode: "openai",
      labeledStub: false,
      output: validated.data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const timedOut = /timeout|timed out|AbortError/i.test(message);
    return {
      ok: false,
      mode: "openai",
      code: timedOut ? "provider_timeout" : "provider_error",
      message: timedOut
        ? "Sağlayıcı zaman aşımına uğradı. Önceki cevapların korundu."
        : "Sağlayıcı hatası. Önceki cevapların korundu; kredi serbest bırakılacak.",
    };
  }
}
