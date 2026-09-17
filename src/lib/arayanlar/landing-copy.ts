import {
  FIXED_CLOSING_QUESTION,
  RECORDING_FORMAT_STEPS,
} from "@/lib/arayanlar/artifact-schema";

/** User-facing Kariyer Portresi landing copy (Turkish). */

export const kariyerPortresiLanding = {
  brand: "Kariyer Portresi",
  hero: {
    line1: "CV ne yaptığını söylüyor.",
    line2: "Biz biraz da nasıl düşündüğünü göstermek istiyoruz.",
    support:
      "Kariyer Portresi, 15–20 dakikalık kısa bir profesyonel kayıt. CV'nde görünen deneyimlerin arkasındaki kararları, hikâyeleri ve çalışma biçimini konuşuyoruz.",
    reassurance: "Bu bir iş görüşmesi değil.",
    primaryCta: "Kariyer Portresi'ne başvur",
    secondaryCta: "Nasıl çalışıyor?",
  },
  contrast: {
    id: "cvde-gorunmeyen",
    title: "CV'de görünmeyen ne var?",
    cvTitle: "CV genellikle şunu gösterir",
    cvItems: [
      "Nerede çalıştın?",
      "Hangi rollerde bulundun?",
      "Hangi araçları ve teknolojileri kullandın?",
      "Hangi sorumlulukları aldın?",
    ],
    usTitle: "Biz biraz da şunları konuşuyoruz",
    usItems: [
      "Bir problemi nasıl ele alıyorsun?",
      "Bir karar verirken neye bakıyorsun?",
      "Yaşadığın bir deneyimi nasıl anlatıyorsun?",
      "Bir ekipte nasıl çalışıyorsun?",
      "Bundan sonra ne arıyorsun?",
    ],
  },
  process: {
    id: "kayit-nasil",
    title: "Kayıt nasıl ilerliyor?",
    durationNote: "Kayıt yaklaşık 15–20 dakika sürer.",
    coldOpenNote:
      "Kısa açılış bölümü kayıt sonrasında gerçek konuşmadan seçilir.",
    steps: [
      {
        title: RECORDING_FORMAT_STEPS[0],
        body: "CV'deki unvanlardan biraz uzaklaşıp seni ve çalışma biçimini tanıyoruz.",
      },
      {
        title: RECORDING_FORMAT_STEPS[1],
        body: "Gerçek bir deneyimini konuşuyoruz: ne oldu, sen ne yaptın, ne öğrendin?",
      },
      {
        title: RECORDING_FORMAT_STEPS[2],
        body: "Kısa bir senaryo üzerinden sonuca değil, nasıl düşündüğüne bakıyoruz.",
      },
      {
        title: RECORDING_FORMAT_STEPS[3],
        body: "Bir sonraki adımında hangi rolü, ortamı ve çalışma biçimini aradığını senden duyuyoruz.",
      },
      {
        title: RECORDING_FORMAT_STEPS[4],
        body: "Sana özel birkaç kısa soruyla düşünme biçimine farklı açılardan bakıyoruz.",
      },
      {
        title: RECORDING_FORMAT_STEPS[5],
        body: FIXED_CLOSING_QUESTION,
      },
    ],
  },
  whyCv: {
    id: "cv-neden",
    title: "CV'ni tekrar okumak için değil, daha iyi hazırlanmak için kullanıyoruz.",
    points: [
      "Kayıt öncesinde CV'ni inceliyoruz.",
      "Güçlü hikâye adaylarını belirliyoruz.",
      "Onaylı bilgileri eksik detaylardan ayırıyoruz.",
      "Olası takip sorularını hazırlıyoruz.",
      "Sana özel bir düşünme senaryosu hazırlıyoruz.",
      "Onaylanmamış iş arama tercihlerini gerçek gibi sunmuyoruz.",
    ],
    noInvent: "CV'de olmayan bir bilgiyi uydurmuyoruz.",
    missingMark:
      "Eksik bir bilgi varsa bunu “eksik” olarak işaretliyoruz ve kayıt öncesinde düşünmen için sana gösteriyoruz.",
    aiNote:
      "Kayıt öncesi notlar hazırlanırken yapay zekâdan destek alınabilir.",
  },
  prepPreview: {
    id: "kayit-oncesi",
    title: "Kayıt öncesinde ne görüyorsun?",
    items: [
      "Öne çıkan kariyer temaları",
      "Konuşulabilecek gerçek hikâyeler",
      "Eksik kalan detaylar",
      "Kayıt öncesi düşünmek isteyebileceğin sorular",
      "Ne aradığını netleştirmen için hazırlık notları",
      "Sana özel hızlı tur soruları",
    ],
    notScript: "Bunlar ezberlemen gereken cevaplar değil.",
    purpose:
      "Amaç seni prova ettirmek değil; kayda daha hazırlıklı ve daha net gelmeni sağlamak.",
  },
  notInterview: {
    id: "is-gorusmesi-degil",
    title: "Bu bir iş görüşmesi değil.",
    body1:
      "Seni elemek, puanlamak veya “doğru cevabı” bulmak için yapılmıyor.",
    body2:
      "Ama seni dinleyen biri, CV'nin arkasındaki insanı; nasıl düşündüğünü, nasıl karar verdiğini ve nasıl bir ortam aradığını daha iyi anlayabiliyor.",
  },
  whoFor: {
    id: "kimler-icin",
    title: "Kimler için?",
    lead: "Kariyer Portresi özellikle şu kişiler için anlamlı olabilir:",
    items: [
      "yeni bir rol arayanlar",
      "CV'sinin yaptığı işi tam anlatmadığını düşünenler",
      "teknik deneyimin yanında liderlik, danışmanlık, eğitim veya ürün düşüncesini de göstermek isteyenler",
      "kariyerinde bir sonraki adımı daha net anlatmak isteyenler",
    ],
  },
  privacy: {
    id: "gizlilik",
    title: "Ne paylaşılacağı senin kontrolünde.",
    points: [
      "CV'n varsayılan olarak herkese açık gösterilmez.",
      "Ham CV, atanan sunucuyla varsayılan olarak paylaşılmaz; türetilmiş hazırlık notları ve onaylı gerçekler kullanılır.",
      "Hazırlık notları paylaştığın bilgilerden türetilir.",
      "Kayıt ve yayın onayları ayrıdır; yayın mevcut onay akışından sonra olur.",
    ],
    legalLinksLabel: "İlgili yasal metinler",
  },
  finalCta: {
    id: "basvur",
    title: "CV'nin arkasındaki hikâyeyi biraz daha görünür hale getirelim.",
    cta: "Kariyer Portresi'ne başvur",
    support: "Yaklaşık 15–20 dakikalık bir kayıt.",
    flowNote: "Önce bilgilerini paylaşırsın, sonra kayıt öncesi notların hazırlanır.",
  },
} as const;

export function hasActiveArayanlarApplication(
  app: {
    status: "DRAFT" | "AWAITING_CONFIRMATION" | "SUBMITTED" | "WITHDRAWN";
  } | null,
) {
  if (!app) return false;
  return (
    app.status === "DRAFT" ||
    app.status === "AWAITING_CONFIRMATION" ||
    app.status === "SUBMITTED"
  );
}
