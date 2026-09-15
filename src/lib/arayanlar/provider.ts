import OpenAI from "openai";
import {
  ARAYANLAR_PREPARE_JSON_SCHEMA,
  arayanlarPrepareOutputSchema,
  type ArayanlarPrepareOutput,
  type GuestBrief,
  type HostPack,
} from "@/lib/arayanlar/artifact-schema";
import { EDITORIAL_TIMELINE } from "@/lib/arayanlar/constants";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";
import {
  isProductionRuntime,
  resolveProviderConfig,
  type AiProviderMode,
} from "@/lib/ai/provider";

export type ArayanlarPrepareResult =
  | { ok: true; mode: AiProviderMode; output: ArayanlarPrepareOutput; labeledStub: boolean }
  | { ok: false; mode: AiProviderMode; code: string; message: string };

const PREPARE_SYSTEM = `Sen PodTest Arayanlar için hazırlık paketleri üretirsin.
Kurallar:
- Yalnızca üyenin onayladığı gerçekleri kullan; CV ham metni veya özel sohbet geçmişi yok.
- İdeal yanıtlar, ezberlenecek senaryolar veya rol-özel vaka prova metni üretme (konuk için).
- Sunucu paketi kişiselleştirilmiş sorular ve TEK kısa vaka içerebilir; vakayı konuğa ezberletecek şekilde yazma.
- Soğuk açılış için uydurma alıntı YASAK; yalnızca sonra seçilecek gerçek bir an notu.
- Tarih, seçim kararı, tavsiye, işe alım garantisi veya yayınlanmış bölüm iddiası uydurma.
- Başvuru davet veya kesin kayıt tarihi değildir — bunu disclaimer'da belirt.
- Türkçe yaz. Sıcak, sohbet tarzı, profesyonel. Puanlama/aşağılamaya yer yok.
- JSON şemasına sıkı uy.
- hostPack.mainQuestions en az 3 soru içermeli (her birinde followUps dizisi).
- hostPack.case.supportingFacts tam 2 madde; rapidRound.questions tam 5; alternatives tam 2.
- timingAndTransitions editorial timeline segmentlerini kapsamalı.`;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").trim()).filter(Boolean);
}

/** Coerce near-valid provider JSON into schema shape without inventing biography. */
export function normalizeArayanlarOutput(
  raw: unknown,
  facts: SubmittedFacts,
): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const root = raw as Record<string, unknown>;
  const guest = (root.guestBrief && typeof root.guestBrief === "object"
    ? root.guestBrief
    : {}) as Record<string, unknown>;
  const host = (root.hostPack && typeof root.hostPack === "object"
    ? root.hostPack
    : {}) as Record<string, unknown>;

  const intro =
    host.factualIntroduction && typeof host.factualIntroduction === "object"
      ? (host.factualIntroduction as Record<string, unknown>)
      : {};

  let mainQuestions = Array.isArray(host.mainQuestions) ? [...host.mainQuestions] : [];
  const ensureQuestion = (q: string) => ({ question: q, followUps: [] as string[] });
  while (mainQuestions.length < 3) {
    const defaults = [
      ensureQuestion(`Hedef rolün (${facts.targetRole || "belirsiz"}) için seni ne motive ediyor?`),
      ensureQuestion(`Anlattığın deneyimde (${facts.storyTopic || "konu"}) asıl zorluk neydi?`),
      ensureQuestion("İstediğin çalışma ortamını nasıl tanımlarsın?"),
    ];
    mainQuestions.push(defaults[mainQuestions.length]!);
  }
  mainQuestions = mainQuestions.slice(0, 8).map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      question: asString(row.question, "Kısa bir takip sorusu"),
      followUps: asStringArray(row.followUps).slice(0, 3),
    };
  });

  const caseObj =
    host.case && typeof host.case === "object" ? (host.case as Record<string, unknown>) : {};
  let supportingFacts = asStringArray(caseObj.supportingFacts);
  while (supportingFacts.length < 2) {
    supportingFacts.push(
      supportingFacts.length === 0
        ? facts.storyTopic || "Üye hikâyesi (onaylı)"
        : facts.contribution || "Üye katkısı (onaylı)",
    );
  }
  supportingFacts = supportingFacts.slice(0, 2);

  const rapid =
    host.rapidRound && typeof host.rapidRound === "object"
      ? (host.rapidRound as Record<string, unknown>)
      : {};
  let questions = asStringArray(rapid.questions);
  const rapidDefaults = [
    "Sabah ilk baktığın araç?",
    "Bir cümlelik tempo tercihin?",
    "En iyi geri bildirim biçimin?",
    "Kaçınmayı tercih ettiğin toplantı?",
    "Öğrenmek istediğin konu?",
  ];
  while (questions.length < 5) questions.push(rapidDefaults[questions.length]!);
  questions = questions.slice(0, 5);
  let alternatives = asStringArray(rapid.alternatives);
  while (alternatives.length < 2) {
    alternatives.push(alternatives.length === 0 ? "Son öğrendiğin küçük ipucu?" : "İyi ekip özelliği?");
  }
  alternatives = alternatives.slice(0, 2);

  let timing = Array.isArray(host.timingAndTransitions) ? host.timingAndTransitions : [];
  if (timing.length < EDITORIAL_TIMELINE.length) {
    timing = EDITORIAL_TIMELINE.map((s) => ({
      ...s,
      hostNote: "Geçişleri yumuşak tut; puanlama yok.",
    }));
  }

  return {
    guestBrief: {
      recordingWhatToExpect: asString(
        guest.recordingWhatToExpect,
        "Yaklaşık 18 dakikalık, tek konuklu sohbet temposunda bir kayıt.",
      ),
      selectedStoryTopic: asString(guest.selectedStoryTopic, facts.storyTopic || "Belirtilmedi"),
      preparationGuidance: (() => {
        const g = asStringArray(guest.preparationGuidance);
        return g.length ? g.slice(0, 8) : ["Kendi cümlelerinle, kısa ve dürüst anlat."];
      })(),
      confirmedTargetRole: asString(guest.confirmedTargetRole, facts.targetRole || "Belirtilmedi"),
      contactPreferences: asString(guest.contactPreferences, facts.contactChannel || "Belirtilmedi"),
      recordingChecklist: (() => {
        const c = asStringArray(guest.recordingChecklist);
        return c.length ? c.slice(0, 12) : ["Sakin ortam", "Stabil bağlantı"];
      })(),
      coldOpenNote: asString(
        guest.coldOpenNote,
        "Kayıt gününde seçilecek gerçek bir ana dair not; uydurma alıntı yok.",
      ),
      timelineOverview: asString(
        guest.timelineOverview,
        EDITORIAL_TIMELINE.map((s) => `${s.start}–${s.end} ${s.label}`).join(" · "),
      ),
      disclaimer: asString(
        guest.disclaimer,
        "Bu başvuru davet veya kesin kayıt tarihi değildir; tarih, seçim veya işe alım garantisi yoktur.",
      ),
    },
    hostPack: {
      factualIntroduction: {
        text: asString(
          intro.text,
          `${facts.displayName}; hedef: ${facts.targetRole || "belirsiz"}.`,
        ),
        sourceLabels: asStringArray(intro.sourceLabels).length
          ? asStringArray(intro.sourceLabels)
          : ["member_confirmed"],
        uncertaintyLabels: asStringArray(intro.uncertaintyLabels),
      },
      mainQuestions,
      case: {
        title: asString(caseObj.title, "Rol-uyumlu kısa senaryo"),
        setup: asString(caseObj.setup, "Belirsiz bir öncelik çatışması."),
        supportingFacts,
        newFact: asString(caseObj.newFact, "Beklenmedik bir kısıt ekleniyor."),
      },
      rapidRound: { questions, alternatives },
      timingAndTransitions: timing,
      unresolvedDetails: asStringArray(host.unresolvedDetails),
      excludedTopics: asStringArray(host.excludedTopics).length
        ? asStringArray(host.excludedTopics)
        : facts.excludedTopics
          ? facts.excludedTopics.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
          : [],
      approvedContactChannel: asString(
        host.approvedContactChannel,
        facts.contactChannel || "Belirtilmedi",
      ),
      coldOpenProductionNote: asString(
        host.coldOpenProductionNote,
        "Kayıt öncesi gerçek bir andan kısa soğuk açılış seç; alıntı uydurma.",
      ),
      editorialNotes: asStringArray(host.editorialNotes).length
        ? asStringArray(host.editorialNotes)
        : ["Tek konuk, tek hikâye, tek vaka."],
    },
  };
}

function stubOutput(facts: SubmittedFacts): ArayanlarPrepareOutput {
  const guestBrief: GuestBrief = {
    recordingWhatToExpect:
      "Yaklaşık 18 dakikalık, tek konuklu, sohbet temposunda bir kayıt. Mülakat performansı ölçülmez.",
    selectedStoryTopic: facts.storyTopic || "Üye henüz net bir hikâye seçmedi",
    preparationGuidance: [
      "Kendi cümlelerinle, kısa ve dürüst anlat.",
      "Ezberlenecek ideal cevap üretme; bilmediğin detayı uydurma.",
      "Sunucunun soracağı vaka içeriğini önceden ezberlemen beklenmez.",
    ],
    confirmedTargetRole: facts.targetRole || "Belirtilmedi",
    contactPreferences: facts.contactChannel || "Belirtilmedi",
    recordingChecklist: [
      "Sakin bir ortam ve stabil bağlantı",
      "Hedef rolünü kendi dilinle hatırla",
      "Seçtiğin gerçek deneyimin ana noktaları",
      "Konuşulmasını istemediğin sınırlar",
    ],
    coldOpenNote:
      "Kayıt gününde seçilecek gerçek bir ana dair not tutulacak; önceden uydurma alıntı yok.",
    timelineOverview: EDITORIAL_TIMELINE.map((s) => `${s.start}–${s.end} ${s.label}`).join(" · "),
    disclaimer:
      "[YEREL DEMO STUB — canlı AI değil] Bu başvuru davet veya kesin kayıt tarihi değildir; tarih, seçim veya işe alım garantisi yoktur.",
  };

  const hostPack: HostPack = {
    factualIntroduction: {
      text: `${facts.displayName}; hedef: ${facts.targetRole || "belirsiz"}. Hikâye: ${facts.storyTopic || "belirsiz"}.`,
      sourceLabels: ["member_confirmed"],
      uncertaintyLabels: facts.targetRole ? [] : ["targetRole unresolved"],
    },
    mainQuestions: [
      {
        question: "Hedef rolünü kendi sözlerinle nasıl tanımlarsın?",
        followUps: ["Bu rolde en çok neyi merak ediyorsun?"],
      },
      {
        question: "Anlattığın deneyimde asıl zorluk neydi?",
        followUps: ["Senin somut katkın ne oldu?"],
      },
      {
        question: "İstediğin çalışma ortamı nasıl görünüyor?",
        followUps: [],
      },
    ],
    case: {
      title: "Rol-uyumlu kısa senaryo (demo stub)",
      setup: "Küçük bir ekipte belirsiz bir öncelik çatışması var.",
      supportingFacts: [
        facts.storyTopic || "Üye hikâyesi belirsiz",
        facts.contribution || "Katkı belirsiz",
      ],
      newFact: "Paydaşlardan biri beklenmedik bir kısıt ekliyor.",
    },
    rapidRound: {
      questions: [
        "Sabah ilk baktığın araç?",
        "Bir cümlelik çalışma temposu?",
        "En sevdiğin geri bildirim biçimi?",
        "Kaçınmayı tercih ettiğin toplantı türü?",
        "Öğrenmek istediğin bir konu?",
      ],
      alternatives: ["En son öğrendiğin küçük ipucu?", "Birlikte iyi çalıştığın ekip özelliği?"],
    },
    timingAndTransitions: EDITORIAL_TIMELINE.map((s) => ({
      ...s,
      hostNote: "Geçişleri yumuşak tut; puanlama yok.",
    })),
    unresolvedDetails: [
      !facts.targetRole ? "Hedef rol net değil" : "",
      !facts.storyTopic ? "Hikâye konusu net değil" : "",
    ].filter(Boolean),
    excludedTopics: facts.excludedTopics
      ? facts.excludedTopics.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [],
    approvedContactChannel: facts.contactChannel || "Belirtilmedi",
    coldOpenProductionNote:
      "Kayıt öncesi gerçek bir andan kısa soğuk açılış seç; alıntı uydurma.",
    editorialNotes: [
      "Tek konuk, tek hikâye, tek vaka.",
      "Konuğa vaka detayını önceden ezberletme.",
      "[YEREL DEMO STUB — canlı AI değil]",
    ],
  };

  return { guestBrief, hostPack };
}

export async function generateArayanlarPreparation(input: {
  facts: SubmittedFacts;
  editorialTemplateVersion: string;
}): Promise<ArayanlarPrepareResult> {
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
      output: stubOutput(input.facts),
    };
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model,
      input: [
        { role: "system", content: PREPARE_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            editorialTemplateVersion: input.editorialTemplateVersion,
            timeline: EDITORIAL_TIMELINE,
            confirmedFacts: input.facts,
            requirements: {
              guestAndHostSeparate: true,
              noFabricatedColdOpenQuote: true,
              noInventedDatesOrGuarantees: true,
              oneGuestOneStoryOneCase: true,
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

    const normalized = normalizeArayanlarOutput(parsed, input.facts);
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
  } catch {
    return {
      ok: false,
      mode: "openai",
      code: "provider_error",
      message: "Sağlayıcı hatası. Önceki cevapların korundu; kredi serbest bırakılacak.",
    };
  }
}
