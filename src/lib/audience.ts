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
export const DEFAULT_AUDIENCE: Audience = "freelancer";

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
  /** Социално доказателство. */
  socialProof: string;
}

export const AUDIENCE_COPY: Record<Audience, AudienceCopy> = {
  business: {
    label: "Фирма",
    ariaLabel: "Малък и среден бизнес",
    heroHeadline: {
      lead: "По-малко бюрокрация.",
      accent: "Повече време за Вас.",
      tail: "",
    },
    heroSub:
      "Помагаме на хората и малкия и средния бизнес да се справят с ежедневната бюрокрация.",
    priceFrame: "Еднократно за конкретен документ или абонамент за редовна работа",
    valueLine:
      "Абонаментът е за фирми, при които договорите са редовна работа — независимо дали са един човек, или екип",
    planBadge: "За малки фирми",
    ctaHeadline: "Документи за ежедневните задачи на бизнеса",
    ctaExample:
      "Разгледайте образци за услуги, наеми, служители и организация на бизнеса.",

    anchors: [
      "Един конкретен документ — еднократно плащане",
      "Редовни договори — абонамент",
      "Обща история, версии и достъп за екипа",
      "Абонамент от 12,90 €/мес.",
    ],
    socialProof: "фирми и екипи",
  },
  freelancer: {
    label: "Частно лице",
    ariaLabel: "Лични въпроси, работа и свободна практика",
    heroHeadline: {
      lead: "По-малко бюрокрация.",
      accent: "Повече време за Вас.",
      tail: "",
    },
    heroSub:
      "Помагаме на хората и малкия и средния бизнес да се справят с ежедневната бюрокрация.",
    priceFrame: "Еднократно за конкретен документ или абонамент за редовна работа",
    valueLine:
      "Плащате еднократно, когато нуждата е една; абонамент — когато документите са редовна работа",
    planBadge: "За свободна практика",
    ctaHeadline: "Документи за лични въпроси и работа",
    ctaExample:
      "Разгледайте образци за наем, работа, заявления и ежедневни лични въпроси.",
    anchors: [
      "Един конкретен документ — еднократно плащане",
      "Редовни договори — абонамент",
      "Преглед, сваляне и история на едно място",
      "Абонамент от 12,90 €/мес.",
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
