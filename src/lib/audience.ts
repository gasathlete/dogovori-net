/**
 * Audience segmentation — "Фирма" vs "Фрийлансър".
 *
 * Цената сама по себе си изглежда висока; стойността става очевидна само
 * когато е формулирана на езика на конкретния сегмент. Този модул държи
 * copy-то за двата сегмента и персистира избора в localStorage.
 *
 * Няма DB зависимости — само frontend copy switching + analytics property.
 */

export type Audience = "business" | "freelancer";

export const AUDIENCE_STORAGE_KEY = "dogovori_audience_v1";
export const AUDIENCE_EVENT = "dogovori:audience-changed";
export const DEFAULT_AUDIENCE: Audience = "business";

export interface AudienceCopy {
  /** Кратък етикет за toggle бутона. */
  label: string;
  /** Дълъг етикет за a11y. */
  ariaLabel: string;
  /** Hero H1 — три части, за да можем да стилизираме средната. */
  heroHeadline: { lead: string; accent: string; tail: string };
  heroSub: string;
  /** Рамка около цената ("по-малко от един обяд"). */
  priceFrame: string;
  /** Основен ROI аргумент, показван до цената. */
  valueLine: string;
  /** Badge на highlight плана в /plans. */
  planBadge: string;
  /** CTABand headline + конкретен пример. */
  ctaHeadline: string;
  ctaExample: string;
  /** Anchoring редове в /plans. */
  anchors: string[];
  /** ROI калкулатор пресети. */
  roiPresets: { label: string; docs: number; fee: number }[];
  /** Социално доказателство. */
  socialProof: string;
}

export const AUDIENCE_COPY: Record<Audience, AudienceCopy> = {
  business: {
    label: "Фирма",
    ariaLabel: "Малка фирма (2–10 човека)",
    heroHeadline: {
      lead: "Договори, които защитават",
      accent: "фирмата",
      tail: " ти — без адвокат за всеки документ",
    },
    heroSub:
      "От 12.90 €/мес. — по-малко от един обяд, повече спокойствие за целия екип.",
    priceFrame: "По-малко от един обяд на месец",
    valueLine: "Спестяваш 200–380 € на документ · връща се за 1 договор",
    planBadge: "За малки фирми",
    ctaHeadline: "Спести на фирмата си хиляди евро годишно от адвокатски такси",
    ctaExample:
      "3 договора/месец × 150 € = 5 400 €/година. С Dogovori.net: 154.80 €/година.",
    anchors: [
      "1 договор при адвокат = ~290 €",
      "1 адвокатски преглед = 80–150 €",
      "1 пропусната клауза = хиляди евро",
      "Dogovori.net = 12.90 €/мес.",
    ],
    roiPresets: [
      { label: "2–5 договора/месец", docs: 4, fee: 145 },
      { label: "10 договора/година", docs: 1, fee: 145 },
      { label: "1 екип, 3 човека", docs: 9, fee: 145 },
    ],
    socialProof: "фирми и екипи",
  },
  freelancer: {
    label: "Фрийлансър",
    ariaLabel: "Фрийлансър или самонает",
    heroHeadline: {
      lead: "Не започвай проект без",
      accent: "договор",
      tail: ". Готов документ за 2 минути",
    },
    heroSub:
      "От 12.90 €/мес. — защита на аванса и професионален вид пред всеки клиент.",
    priceFrame: "По-малко от един обяд на месец",
    valueLine:
      "Един неплатен аванс струва повече от цяла година абонамент",
    planBadge: "За на свободна практика",
    ctaHeadline: "Никога повече проект без договор",
    ctaExample:
      "Един неплатен аванс = 800 €. Годишен абонамент = 154.80 €.",
    anchors: [
      "1 договор при адвокат = ~290 €",
      "1 неплатен аванс = 500–1 500 €",
      "Проект без договор = нула защита",
      "Dogovori.net = 12.90 €/мес.",
    ],
    roiPresets: [
      { label: "1–2 договора/месец", docs: 2, fee: 145 },
      { label: "Нов клиент на квартал", docs: 1, fee: 200 },
      { label: "1 неплатен аванс годишно", docs: 1, fee: 800 },
    ],
    socialProof: "специалисти на свободна практика",
  },
};

export function isAudience(v: unknown): v is Audience {
  return v === "business" || v === "freelancer";
}

export function readAudience(): Audience {
  if (typeof window === "undefined") return DEFAULT_AUDIENCE;
  try {
    const raw = localStorage.getItem(AUDIENCE_STORAGE_KEY);
    return isAudience(raw) ? raw : DEFAULT_AUDIENCE;
  } catch {
    return DEFAULT_AUDIENCE;
  }
}

export function writeAudience(value: Audience): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUDIENCE_STORAGE_KEY, value);
  } catch {
    /* private mode — просто пропускаме персистенцията */
  }
  window.dispatchEvent(new CustomEvent(AUDIENCE_EVENT, { detail: value }));
}

/** Дали потребителят е избирал роля (за да не показваме грешен copy агресивно). */
export function hasChosenAudience(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isAudience(localStorage.getItem(AUDIENCE_STORAGE_KEY));
  } catch {
    return false;
  }
}
