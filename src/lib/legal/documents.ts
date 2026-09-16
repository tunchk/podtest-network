import type { LegalAcceptanceType, LegalDocumentType } from "@/generated/prisma/client";

/** Controller placeholders — replace with real entity details after counsel review. */
export const LEGAL_CONTROLLER_PLACEHOLDERS = {
  legalName: "[VERİ SORUMLUSU UNVANI]",
  address: "[ADRES]",
  privacyEmail: "[İLETİŞİM E-POSTASI]",
  jurisdictionNote:
    "Uygulanacak hukuk (ör. KVKK / GDPR) ve yetkili otorite, nihai hukuki değerlendirmeye tabidir.",
} as const;

export type LegalDocDefinition = {
  type: LegalDocumentType;
  acceptanceType: LegalAcceptanceType;
  version: string;
  locale: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  requiresReacceptance: boolean;
};

export function documentKey(type: LegalDocumentType, version: string, locale = "tr") {
  return `${type}:${version}:${locale}`;
}

/**
 * Current document versions. Bump `version` and set requiresReacceptance when
 * a mandatory change ships. Draft wording — counsel review required before production.
 */
export const CURRENT_LEGAL_DOCUMENTS: LegalDocDefinition[] = [
  {
    type: "TERMS_OF_SERVICE",
    acceptanceType: "TERMS",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "Kullanım Koşulları",
    summary: "PodTest Network üyelik ve hizmet kullanım koşulları (taslak).",
    requiresReacceptance: true,
    bodyMarkdown: `# PodTest Network Kullanım Koşulları

**Durum:** Ürün/hukuk taslağı — üretim yayını öncesi danışman incelemesi gerekir.

**Veri sorumlusu / hizmet sağlayıcı:** ${LEGAL_CONTROLLER_PLACEHOLDERS.legalName}  
**Adres:** ${LEGAL_CONTROLLER_PLACEHOLDERS.address}  
**İletişim:** ${LEGAL_CONTROLLER_PLACEHOLDERS.privacyEmail}

## 1. Hizmet
PodTest Network; yazılım, kalite, kariyer ve podcast topluluğu için isteğe bağlı üyelik, profil, topluluk, işveren keşfi ve Arayanlar hazırlığı sunar. Üyelik başvurusu veya ücret zorunlu değildir.

## 2. Hesap
Hesabınızdan sorumlusunuz. Yanlış kimlik veya kötüye kullanım hesap kısıtlamasına yol açabilir.

## 3. İçerik ve yayın
Taslak içerik kamuya açılmaz. Yayın ve moderasyon kuralları ürün içinde ayrıca uygulanır. Podcast kaydı ve yayın onayı ayrı hukuki adımlardır.

## 4. Yasaklar
Yasadışı içerik, taciz, başkalarının verilerini izinsiz paylaşma ve sisteme yetkisiz erişim yasaktır.

## 5. Sorumluluk sınırı
Hizmet “olduğu gibi” sunulur; işe alım veya yayın garantisi verilmez.

## 6. Değişiklikler
Zorunlu koşul değişikliklerinde ilgili sürüm için yeniden kabul istenebilir.

${LEGAL_CONTROLLER_PLACEHOLDERS.jurisdictionNote}
`,
  },
  {
    type: "PRIVACY_NOTICE",
    acceptanceType: "PRIVACY_NOTICE",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "Aydınlatma Metni (Gizlilik)",
    summary: "Kişisel verilerin işlenmesine ilişkin bilgilendirme (KVKK/GDPR uyumlu yapı taslağı).",
    requiresReacceptance: true,
    bodyMarkdown: `# Aydınlatma Metni

**Durum:** Taslak — danışman incelemesi gerekir.  
**Veri sorumlusu:** ${LEGAL_CONTROLLER_PLACEHOLDERS.legalName}  
**Adres:** ${LEGAL_CONTROLLER_PLACEHOLDERS.address}  
**İletişim:** ${LEGAL_CONTROLLER_PLACEHOLDERS.privacyEmail}

## 1. İşlenen veri kategorileri
- Hesap ve iletişim (ad, e-posta, oturum)
- Profil alanları (taslak / onaylı herkese açık anlık görüntü ayrıdır)
- CV dosyası ve çıkarılmış metin (özel depolama)
- AI işleri ve türetilmiş hazırlık çıktıları
- Arayanlar başvuru/onaylı gerçekler; konuk brifi; atanan sunucuya özel paket
- İşveren alanı ve ilan etkileşimleri (yetki dahilinde)
- Podcast bölüm meta verisi, görünümler, kayıt/yayın onay kayıtları
- Bildirimler; pazarlama yalnızca ayrı rıza ile

## 2. Amaçlar
Hizmet sunumu, güvenlik, profil önerileri, Arayanlar hazırlığı, moderasyon, yayın operasyonu, yasal yükümlülükler.

## 3. Hukuki sebepler
Sözleşmenin ifası, meşru menfaat (güvenlik/kötüye kullanım), yasal yükümlülük ve gerektiğinde açık rıza (ör. AI destekli CV analizi, pazarlama). Nihai dayanak matrisi danışman tarafından onaylanmalıdır.

## 4. Alıcılar / işleyenler
Yalnızca hizmet için gerekli işleyenler (barındırma, kimlik doğrulama, AI sağlayıcı). Güncel alt işleyen listesi yapılandırmada tutulur. Sırlar paylaşılmaz.

## 5. Uluslararası aktarım
AI veya barındırma yurtdışındaysa aktarım araçları (SCC vb.) değerlendirilir — yapılandırma ve danışman onayı gerekir.

## 6. Saklama
Hesap süresince ve yasal saklama süreleri boyunca. CV silme ham dosya/çıkarımı etkiler; yayımlanmış podcast’i otomatik silmez.

## 7. Haklarınız
Erişim, düzeltme, silme, kısıtlama, itiraz, rızayı geri alma (rıza dayanaklı işlemlerde, ileriye etkili), şikâyet. İletişim: ${LEGAL_CONTROLLER_PLACEHOLDERS.privacyEmail}

## 8. Pazarlama
Pazarlama ile hizmet/operasyon iletileri ayrıdır. Pazarlama için ayrı isteğe bağlı rıza gerekir.

${LEGAL_CONTROLLER_PLACEHOLDERS.jurisdictionNote}
`,
  },
  {
    type: "CV_AI_PROCESSING_NOTICE",
    acceptanceType: "CV_AI_PROCESSING",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "CV ve Yapay Zekâ İşleme Aydınlatması",
    summary: "CV yükleme, ayrıştırma ve AI destekli hazırlık hakkında özel bilgilendirme.",
    requiresReacceptance: true,
    bodyMarkdown: `# CV ve Yapay Zekâ İşleme Aydınlatması

CV’ni yalnızca başvurunu, profil önerilerini ve kayıt hazırlığını oluşturmak için kullanıyoruz. CV’nden çıkardığımız bilgilerle sana ve ilgili kayıt ekibine hazırlık notları oluşturabiliriz.

## Ne olur?
1. Dosya özel depolamaya alınır; metin çıkarılır.
2. İsteğe bağlı olarak AI, profil önerileri veya Arayanlar hazırlık taslakları üretebilir.
3. Ham CV kamuya açılmaz; profil yayınından ayrıdır.
4. Atanan sunucu normalde ham CV değil, türetilmiş hazırlık ve onaylı gerçekleri görür.

Genel kurallar Aydınlatma Metni’ndedir. Bu metin CV’ye özgüdür.
`,
  },
  {
    type: "CV_AI_CONSENT",
    acceptanceType: "CV_AI_CONSENT",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "CV Yapay Zekâ Analizi Açık Rızası",
    summary: "AI destekli CV analizi için ayrı, isteğe bağlı olmayan (özellik kullanımı için gerekli) açık rıza metni — hukuki dayanak danışman onayı bekler.",
    requiresReacceptance: true,
    bodyMarkdown: `# CV Yapay Zekâ Analizi Açık Rızası

CV içeriğimin kayıt hazırlığı ve kişiselleştirilmiş öneriler oluşturmak amacıyla yapay zekâ destekli sistemler tarafından analiz edilmesine ve işlenmesine açık rıza veriyorum.

Rızamı geri alabilirim; geri alma ileriye etkilidir. Daha önce yasal dayanakla yapılmış işlemleri veya yayımlanmış içerikleri kendiliğinden geçersiz kılmaz.
`,
  },
  {
    type: "PROFILE_VISIBILITY_NOTICE",
    acceptanceType: "PROFILE_VISIBILITY",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "Profil Görünürlüğü Bilgilendirmesi",
    summary: "Taslak, üye/işveren görünürlüğü ve herkese açık profil ayrımı.",
    requiresReacceptance: false,
    bodyMarkdown: `# Profil Görünürlüğü

- **Özel taslak:** Düzenlemelerin yalnızca sana aittir; inceleme/onay olmadan dizinde veya herkese açık sayfada görünmez.
- **İncelemede:** Bekleyen sürüm kamuya sızmaz.
- **Onaylı + yayımlı + keşfedilebilir:** Üye dizini ve (ayarlara göre) işveren keşfi allowlist alanlarını görebilir.
- **Ham CV:** Profil görünürlüğünden bağımsızdır; asla herkese açık profil alanına düşmez.
`,
  },
  {
    type: "HOST_PREP_SHARING_NOTICE",
    acceptanceType: "HOST_PREP_SHARING",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "Sunucu Hazırlık Paylaşımı",
    summary: "Atanan sunucuya türetilmiş hazırlık paketinin gösterilmesi.",
    requiresReacceptance: true,
    bodyMarkdown: `# Sunucu Hazırlık Paylaşımı

Onayladığın gerçekler ve türetilmiş sunucu hazırlık paketi, atanan yetkili sunucuyla paylaşılabilir. Bu, ham CV dosyasının sunucuya açılması anlamına gelmez.
`,
  },
  {
    type: "RECORDING_CONSENT",
    acceptanceType: "RECORDING",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "Kayıt İzni",
    summary: "Ses/görüntü kaydı izni — yayın izni değildir.",
    requiresReacceptance: true,
    bodyMarkdown: `# Kayıt İzni

PodTest görüşmesinin sesli ve/veya görüntülü olarak kayıt altına alınacağını biliyorum ve kayıt yapılmasını onaylıyorum.

Kayıt; bölüm üretimi için kesme, sıralama ve teknik işleme tabi tutulabilir. **Kayıt izni, yayın izni değildir.** Yayın için ayrı onay gerekir.
Üçüncü kişilere ait gizli bilgileri paylaşmamaya özen gösterin.
`,
  },
  {
    type: "PUBLICATION_APPROVAL",
    acceptanceType: "PUBLICATION",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "Yayın Onayı",
    summary: "Belirli bir bölüm/sürüm için yayın onayı.",
    requiresReacceptance: true,
    bodyMarkdown: `# Yayın Onayı

Bölümün yayınlanmasını onaylıyorum.

Onay verdiğim sürüm; PodTest sitesi, podcast platformları, sosyal medya ve diğer PodTest dijital kanallarında dağıtılabilir. PodTest başlık, açıklama, süre, tanıtım kesitleri ve yayın zamanı konusunda editoryal karar alabilir; yanıltıcı kurgu veya söylemediğim sözlerin atfedilmesi kabul edilemez.

Önemli içerik değişikliğinde yeni onay gerekir.
`,
  },
  {
    type: "MARKETING_CONSENT",
    acceptanceType: "MARKETING",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "Pazarlama İletişimi Rızası",
    summary: "İsteğe bağlı bülten/tanıtım — hizmet e-postalarından ayrı.",
    requiresReacceptance: false,
    bodyMarkdown: `# Pazarlama İletişimi

PodTest’ten bülten ve tanıtım iletileri almak istiyorum. Bu rıza isteğe bağlıdır; hesap güvenliği, başvuru durumu ve yayın onayı gibi operasyonel iletiler bundan bağımsızdır. İstediğim zaman geri alabilirim.
`,
  },
  {
    type: "RECORDING_AND_PUBLICATION_NOTICE",
    acceptanceType: "RECORDING",
    version: "2026-09-16.v1",
    locale: "tr",
    title: "PodTest Kayıt ve Yayın İzni",
    summary: "Kayıt ile yayın ayrımını açıklayan birleşik bilgilendirme taslağı.",
    requiresReacceptance: false,
    bodyMarkdown: `# PodTest Kayıt ve Yayın İzni

**Durum:** Taslak — danışman incelemesi gerekir.  
**Veri sorumlusu:** ${LEGAL_CONTROLLER_PLACEHOLDERS.legalName}  
**Adres:** ${LEGAL_CONTROLLER_PLACEHOLDERS.address}  
**İletişim:** ${LEGAL_CONTROLLER_PLACEHOLDERS.privacyEmail}

## 1. Kayıt
Görüşme sesli/görüntülü kaydedilebilir. Amaç: bölüm üretimi. Kayıt izni ayrıdır.

## 2. Yayın öncesi onay
Kayıt tek başına yayın yetkisi vermez. Yayın için belirli sürümün açık onayı gerekir.

## 3. Yayın kapsamı
Onay sonrası dağıtım: PodTest sitesi, podcast platformları, sosyal medya ve diğer PodTest kanalları.

## 4. Editoryal kontrol
PodTest başlık, açıklama, süre, kesit ve yayın zamanında karar verebilir; yanıltıcı kurgu ve uydurma alıntı yasaktır.

## 5. Yayından kaldırma talepleri
Yayımlanmış bir bölümün yalnızca kişisel tercih değişikliği nedeniyle kaldırılması otomatik olarak garanti edilmez. PodTest kaldırma taleplerini editoryal, teknik ve hukuki koşulları dikkate alarak değerlendirir. Bu hüküm, yürürlükteki mevzuattan doğan silme, itiraz, rızayı geri alma veya diğer emredici hakları sınırlamaz. Üçüncü taraf platformlarda daha önce dağıtılmış/önbelleklenmiş kopyalar her zaman teknik olarak geri alınamayabilir.

## 6. Gerçeğe uygunluk ve üçüncü kişilerin hakları
Konuk; üçüncü kişilere ait gizli veya kısıtlı bilgileri paylaşmamalıdır.

## 7. Kişisel veriler
Aydınlatma Metni geçerlidir. Ham CV yayın malzemesi değildir.

## 8. Yayın onayı
“Bölümün yayınlanmasını onaylıyorum.” ifadesi, onay anındaki sürüm kimliğine bağlıdır.
`,
  },
];

/** Subprocessors / processing parties for legal notices — not a tech inventory. */
export type SubprocessorClassification =
  | "external_processor"
  | "self_hosted_or_internal"
  | "client_or_library_only"
  | "unknown_until_deployment";

export type SubprocessorEntry = {
  key: string;
  purpose: string;
  dataCategories: string[];
  classification: SubprocessorClassification;
  /**
   * For external processors: env vars that indicate the vendor integration may be active.
   * For unknowns: env vars that only prove a dependency exists, not who hosts it.
   */
  configuredHintEnv: string[];
  /** Shown when vendor/host is not known from this repo. */
  deploymentPlaceholder?: string;
};

/**
 * Only entries that matter for “who receives/stores personal data”.
 * Frameworks/libraries are not listed as subprocessors.
 */
export const SUBPROCESSOR_CATALOG: SubprocessorEntry[] = [
  {
    key: "openai",
    purpose:
      "AI-assisted CV/profile and Arayanlar preparation when the live OpenAI provider is configured",
    dataCategories: [
      "CV extracted text",
      "confirmed preparation facts",
      "profile draft fields sent to the model",
    ],
    classification: "external_processor",
    configuredHintEnv: ["OPENAI_API_KEY"],
  },
  {
    key: "application-database-host",
    purpose: "Primary application data store (accounts, profiles, CV metadata, jobs, acceptances)",
    dataCategories: ["account", "profile", "CV metadata", "jobs", "acceptances"],
    // PostgreSQL is the engine; the legal subprocessor is whoever hosts the DB in deployment.
    classification: "unknown_until_deployment",
    configuredHintEnv: ["DATABASE_URL"],
    deploymentPlaceholder:
      "[VERİTABANI BARINDIRMA SAĞLAYICISI — örn. yönetilen Postgres satıcısı veya self-host]",
  },
  {
    key: "application-runtime-host",
    purpose: "Runs the Next.js app, private CV file storage on disk, and session cookies",
    dataCategories: ["account/session", "uploaded CV files under private storage", "app logs if enabled"],
    classification: "unknown_until_deployment",
    configuredHintEnv: ["BETTER_AUTH_URL"],
    deploymentPlaceholder:
      "[UYGULAMA BARINDIRMA SAĞLAYICISI — örn. Vercel/Fly/self-host; CV dosyaları şu an uygulama diskinde]",
  },
];

/** Not a subprocessor: Better Auth is an in-process auth library; data stays in the app DB/host. */
export const NON_SUBPROCESSOR_NOTES = [
  {
    key: "better-auth",
    classification: "client_or_library_only" as const,
    note: "Authentication library embedded in the app; not an external data recipient by itself.",
  },
  {
    key: "postgresql-engine",
    classification: "self_hosted_or_internal" as const,
    note: "Database technology/engine. The subprocessor (if any) is the deployment host of DATABASE_URL, not “PostgreSQL” generically.",
  },
] as const;
