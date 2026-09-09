/**
 * Единственият източник на истина за еднократните продукти (presentation слой).
 *
 * Тук НЯМА плащане, checkout, quota или кредити — само типизирана,
 * immutable конфигурация за продуктовата витрина (/produkti + началната
 * страница) и детерминистичното персона → план съответствие.
 *
 * Цените са с включен ДДС и се форматират единствено през `fmtEur`, за да
 * няма разпръснати литерали в UI.
 */
import { fmtEur } from "@/lib/pricing";

export type OneTimeProductId =
  | "contract_check"
  | "contract_improve"
  | "business_contract_map";

export type ProductDemoKind = "scan" | "diff" | "map";

export interface OneTimeProduct {
  readonly id: OneTimeProductId;
  readonly name: string;
  /** Кратко име — използва се САМО в мобилния превключвател. */
  readonly shortName: string;
  /** Цена в EUR с включен ДДС. */
  readonly priceEur: number;
  readonly badge?: string;
  /** Едно изречение — какъв е резултатът, не как е направен. */
  readonly promise: string;
  /** Конкретни резултати, водени от изхода, не от технологията. */
  readonly outcomes: readonly string[];
  readonly ctaLabel: string;
  readonly ctaHref: string;
  readonly demo: ProductDemoKind;
}

/** Задължителният ред за прозрачност — показва се на всяка карта. */
export const ONE_TIME_TERMS =
  "Еднократно · с включен ДДС · без автоматичен абонамент";

export const ONE_TIME_PRODUCTS: readonly OneTimeProduct[] = Object.freeze([
  Object.freeze({
    id: "contract_check",
    name: "Проверка преди подпис",
    shortName: "Проверка",
    priceEur: 2.99,
    promise:
      "Паспорт на договора: какво поемате, докога и какво липсва — на един екран.",
    outcomes: Object.freeze([
      "Трите най-важни риска в договора",
      "Срокове, неустойки и лихви — извадени поименно",
      "Условия за прекратяване и предизвестие",
      "Липсващи защити, които обичайно се уговарят",
      "Кратко резюме, готово за сваляне в PDF",
    ]),
    ctaLabel: "Провери договора",
    ctaHref: "/analiz?product=contract_check",
    demo: "scan",
  }),
  Object.freeze({
    id: "contract_improve",
    name: "Подобри договора ми",
    shortName: "Подобри",
    priceEur: 3.99,
    badge: "Най-предпочитан",
    promise:
      "Не само какво е сбъркано, а точните три поправки — с текст преди и след.",
    outcomes: Object.freeze([
      "Най-важните проблеми, подредени по тежест",
      "Три конкретни поправки с точен текст",
      "Сравнение „преди / след“ за всяка поправка",
      "Приемате или отказвате поправка поотделно",
      "Сваляне на коригирания документ",
    ]),
    ctaLabel: "Подобри договора",
    ctaHref: "/analiz?product=contract_improve",
    demo: "diff",
  }),
  Object.freeze({
    id: "business_contract_map",
    name: "Бизнес договорна карта",
    shortName: "Бизнес карта",
    priceEur: 6.99,
    badge: "За бизнес",
    promise:
      "Кои договори са ви нужни, в какъв ред и какво да свършите през следващите 30 дни.",
    outcomes: Object.freeze([
      "Кратък профил на дейността — няколко въпроса",
      "Оценка на договорната ви организация",
      "Нужните договори, подредени по приоритет",
      "Трите най-големи празноти в момента",
      "План за 30 дни и първи препоръчан документ",
      "Подготвено работно място с документите",
    ]),
    ctaLabel: "Създай моята бизнес карта",
    ctaHref: "/produkti/biznes-karta",
    demo: "map",
  }),
]);

const BY_ID: Readonly<Record<OneTimeProductId, OneTimeProduct>> = Object.freeze(
  Object.fromEntries(ONE_TIME_PRODUCTS.map((p) => [p.id, p])) as Record<
    OneTimeProductId,
    OneTimeProduct
  >,
);

export function isOneTimeProductId(value: unknown): value is OneTimeProductId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BY_ID, value)
  );
}

export function getProduct(id: OneTimeProductId): OneTimeProduct {
  return BY_ID[id];
}

/** Allowlist парсване на ?product= — непознати стойности падат до null. */
export function parseProductParam(
  raw: string | null | undefined,
): OneTimeProductId | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return isOneTimeProductId(value) ? value : null;
}

export function productPriceLabel(id: OneTimeProductId): string {
  return fmtEur(BY_ID[id].priceEur);
}

/** Честна входна котва („от …") — винаги най-ниската реална цена. */
export function lowestOneTimePriceLabel(): string {
  return fmtEur(Math.min(...ONE_TIME_PRODUCTS.map((p) => p.priceEur)));
}

/** Продуктът с контролирано подчертано представяне на десктоп. */
export const FEATURED_PRODUCT_ID: OneTimeProductId = "contract_improve";

export function isFeaturedProduct(id: OneTimeProductId): boolean {
  return id === FEATURED_PRODUCT_ID;
}

/* ------------------------- Бизнес персона ------------------------- */

export type BusinessPersona = "own_business" | "client_work";

export interface PersonaRecommendation {
  readonly persona: BusinessPersona;
  readonly choiceLabel: string;
  readonly plan: "entrepreneur" | "professional";
  readonly planName: string;
  /** Едно изречение защо точно този план. */
  readonly reason: string;
}

export const PERSONA_RECOMMENDATIONS: Readonly<
  Record<BusinessPersona, PersonaRecommendation>
> = Object.freeze({
  own_business: Object.freeze({
    persona: "own_business",
    choiceLabel: "Моя бизнес",
    plan: "entrepreneur",
    planName: "Предприемач",
    reason:
      "Договорите на един бизнес се повтарят и се променят често, затова ви трябва по-широк месечен обем за собствените документи.",
  }),
  client_work: Object.freeze({
    persona: "client_work",
    choiceLabel: "Мои клиенти",
    plan: "professional",
    planName: "Професионалист",
    reason:
      "Когато работите по договори за различни клиенти, всеки случай е отделен документ, а не постоянен поток — Професионалист покрива този ритъм.",
  }),
});

export function isBusinessPersona(value: unknown): value is BusinessPersona {
  return value === "own_business" || value === "client_work";
}

export function recommendForPersona(
  persona: BusinessPersona,
): PersonaRecommendation {
  return PERSONA_RECOMMENDATIONS[persona];
}

/** Само избраната опция — нищо чувствително не се съхранява. */
export const PERSONA_STORAGE_KEY = "product_business_persona_v1";

export function saveBusinessPersona(persona: BusinessPersona): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PERSONA_STORAGE_KEY, persona);
  } catch {
    /* quota / private mode — игнорира се */
  }
}

export function loadBusinessPersona(): BusinessPersona | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PERSONA_STORAGE_KEY);
    return isBusinessPersona(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Следващата стъпка е семантично подготвена за платежния етап (носи
 * продукта и персоната), но НЕ е checkout и не твърди покупка.
 */
export function personaNextStepHref(persona: BusinessPersona): string {
  return `/plans?product=business_contract_map&persona=${persona}`;
}

/* ------------------------- Funnel събития ------------------------- */

export const PRODUCT_EVENTS = Object.freeze({
  sectionViewed: "product_section_viewed",
  productSelected: "product_selected",
  personaSelected: "business_persona_selected",
  nextStepClicked: "product_next_step_clicked",
  detailsOpened: "product_details_opened",
} as const);
