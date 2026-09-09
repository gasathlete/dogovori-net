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

/** Каноничният ASCII slug на продукта — единственото място, което го дефинира. */
export type OneTimeProductSlug =
  | "proverka-predi-podpis"
  | "popravi-dokument"
  | "biznes-karta-dokumenti";

export interface ProductFaqItem {
  readonly q: string;
  readonly a: string;
}

/** Съдържанието на самостоятелната продуктова страница (еднакво на телефон и десктоп). */
export interface ProductPageContent {
  /** <title> — уникален за страницата. */
  readonly title: string;
  readonly metaDescription: string;
  /** Единственият H1 — на прост човешки език. */
  readonly h1: string;
  readonly intro: string;
  /** Какво дава човекът. */
  readonly youProvide: readonly string[];
  /** Какво получава — конкретно. */
  readonly youReceive: readonly string[];
  /** Точно три кратки стъпки. */
  readonly steps: readonly string[];
  readonly faq: readonly ProductFaqItem[];
}

export interface OneTimeProduct {
  readonly id: OneTimeProductId;
  readonly slug: OneTimeProductSlug;
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
  readonly page: ProductPageContent;
}

/** Задължителният ред за прозрачност — показва се на всяка карта. */
export const ONE_TIME_TERMS =
  "Еднократно · с включен ДДС · без автоматичен абонамент";

export const ONE_TIME_PRODUCTS: readonly OneTimeProduct[] = Object.freeze([
  Object.freeze({
    id: "contract_check",
    slug: "proverka-predi-podpis",
    name: "Проверка преди подпис",
    shortName: "Проверка",
    priceEur: 2.99,
    promise:
      "Виждате какво поемате, докога и какво липсва в документа — на един екран.",
    outcomes: Object.freeze([
      "Трите най-важни риска за Вас",
      "Срокове, неустойки и лихви — извадени поименно",
      "Условия за прекратяване и предизвестие",
      "Липсващи клаузи, които обичайно се уговарят",
      "Кратко резюме за сваляне в PDF",
    ]),
    ctaLabel: "Проверете документ",
    ctaHref: "/analiz?product=contract_check",
    demo: "scan",
    page: Object.freeze({
      title: "Проверка на документ преди подпис — 2,99 € еднократно",
      metaDescription:
        "Качвате документ и виждате какво поемате, какви са сроковете и неустойките и какво липсва. Плащате 2,99 € еднократно, без абонамент.",
      h1: "Проверка на документ преди подпис",
      intro:
        "Качвате документа, който Ви изпратиха, и получавате кратък разбор: какво поемате, докога и кои клаузи липсват.",
      youProvide: Object.freeze([
        "Документа във файл (PDF, DOCX или снимка на текста)",
        "Вашата роля по документа — например наемател или изпълнител",
      ]),
      youReceive: Object.freeze([
        "Трите най-важни риска за Вас, обяснени с думи",
        "Срокове, неустойки и лихви — извадени поименно",
        "Условията за прекратяване и предизвестие",
        "Кои обичайни клаузи липсват",
        "Кратко резюме за сваляне в PDF",
      ]),
      steps: Object.freeze([
        "Качвате документа",
        "Посочвате коя страна сте",
        "Получавате разбора и го свалятe в PDF",
      ]),
      faq: Object.freeze([
        {
          q: "Заменя ли това консултация с адвокат?",
          a: "Не. Получавате разбор на текста и списък с въпроси, които да зададете. Не е правен съвет за конкретния Ви случай.",
        },
        {
          q: "Какви файлове мога да качвам?",
          a: "PDF и DOCX, както и снимка или сканиран текст, ако буквите се четат.",
        },
        {
          q: "Плащам ли повторно, ако проверя друг документ?",
          a: "Да. Цената е за един документ, без абонамент. За редовна работа с документи вижте плановете.",
        },
      ]),
    }),
  }),
  Object.freeze({
    id: "contract_improve",
    slug: "popravi-dokument",
    name: "Поправи документа ми",
    shortName: "Поправи",
    priceEur: 3.99,
    badge: "Най-предпочитан",
    promise:
      "Не само какво е сбъркано, а точните поправки — с текст преди и след.",
    outcomes: Object.freeze([
      "Проблемите, подредени по тежест",
      "Три конкретни поправки с точен текст",
      "Сравнение „преди / след“ за всяка поправка",
      "Приемате или отказвате поправка поотделно",
      "Сваляне на поправения документ",
    ]),
    ctaLabel: "Поправете документ",
    ctaHref: "/analiz?product=contract_improve",
    demo: "diff",
    page: Object.freeze({
      title: "Поправка на документ — 3,99 € еднократно",
      metaDescription:
        "Качвате документ и получавате конкретни поправки с текст преди и след. Приемате всяка поправка поотделно и свалятe готовия файл. 3,99 € еднократно.",
      h1: "Поправка на Вашия документ",
      intro:
        "Качвате документа и виждате не само проблемите, а и готовия текст, с който да ги замените. Решавате поправка по поправка.",
      youProvide: Object.freeze([
        "Документа във файл (PDF или DOCX)",
        "Вашата роля и какво искате да постигнете",
      ]),
      youReceive: Object.freeze([
        "Проблемите, подредени по тежест",
        "Готов текст за всяка поправка",
        "Сравнение „преди / след“ ред по ред",
        "Възможност да приемете или откажете всяка поправка",
        "Поправения документ за сваляне",
      ]),
      steps: Object.freeze([
        "Качвате документа",
        "Преглеждате предложените поправки",
        "Приемате избраните и свалятe файла",
      ]),
      faq: Object.freeze([
        {
          q: "Мога ли да откажа част от поправките?",
          a: "Да. Всяка поправка се приема или отказва поотделно и виждате текста преди и след.",
        },
        {
          q: "В какъв формат получавам документа?",
          a: "Свалятe го като DOCX и PDF, с приетите от Вас поправки.",
        },
        {
          q: "Проверява ли адвокат резултата?",
          a: "Не. Резултатът не е правен съвет и не заменя консултация за конкретния Ви случай.",
        },
      ]),
    }),
  }),
  Object.freeze({
    id: "business_contract_map",
    slug: "biznes-karta-dokumenti",
    name: "Бизнес карта на документите",
    shortName: "Бизнес карта",
    priceEur: 6.99,
    badge: "За бизнес",
    promise:
      "Кои документи са Ви нужни, в какъв ред и какво да свършите през следващите 30 дни.",
    outcomes: Object.freeze([
      "Кратък профил на дейността — няколко въпроса",
      "Нужните документи, подредени по приоритет",
      "Трите най-големи празноти в момента",
      "План за 30 дни и първи препоръчан документ",
      "Подготвено работно място с документите",
    ]),
    ctaLabel: "Направете бизнес карта",
    ctaHref: "/produkti/biznes-karta",
    demo: "map",
    page: Object.freeze({
      title: "Бизнес карта на документите — 6,99 € еднократно",
      metaDescription:
        "Отговаряте на няколко въпроса за дейността си и получавате списък с нужните документи по приоритет, трите празноти и план за 30 дни. 6,99 € еднократно.",
      h1: "Бизнес карта на документите",
      intro:
        "Отговаряте на няколко въпроса за дейността си и виждате кои документи Ви трябват, в какъв ред и с какво да започнете.",
      youProvide: Object.freeze([
        "Няколко отговора за дейността и хората около Вас",
        "С кого работите — клиенти, доставчици, наети лица",
      ]),
      youReceive: Object.freeze([
        "Списък с нужните документи по приоритет",
        "Трите най-големи празноти в момента",
        "План за следващите 30 дни",
        "Първия препоръчан документ, готов за изготвяне",
        "Подготвено работно място с документите",
      ]),
      steps: Object.freeze([
        "Отговаряте на въпросите за дейността",
        "Получавате картата и приоритетите",
        "Започвате от първия документ",
      ]),
      faq: Object.freeze([
        {
          q: "За кого е подходяща картата?",
          a: "За малка фирма или свободна практика, където документите се повтарят и досега не са подредени.",
        },
        {
          q: "Включва ли изготвяне на документите?",
          a: "Картата подрежда приоритетите и подготвя работното място. Изготвянето на всеки документ става после, от шаблон или по Ваш файл.",
        },
        {
          q: "Нужен ли ми е абонамент?",
          a: "Не. Плащате 6,99 € еднократно. Абонамент има смисъл само ако работите с документи редовно.",
        },
      ]),
    }),
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

/* ------------------ Канонични самостоятелни страници ------------------ */

const BY_SLUG: Readonly<Record<string, OneTimeProduct>> = Object.freeze(
  Object.fromEntries(ONE_TIME_PRODUCTS.map((p) => [p.slug, p])),
);

/** Каноничният път на продуктовата страница — единствената дефиниция. */
export function productPath(product: OneTimeProduct): string {
  return `/produkti/${product.slug}`;
}

export function productPathById(id: OneTimeProductId): string {
  return productPath(BY_ID[id]);
}

/** Allowlist търсене по slug — непознат slug връща null. */
export function getProductBySlug(
  slug: string | undefined,
): OneTimeProduct | null {
  if (typeof slug !== "string") return null;
  return BY_SLUG[slug] ?? null;
}

/** Всички продуктови пътища — за sitemap и вътрешни връзки. */
export const ONE_TIME_PRODUCT_PATHS: readonly string[] = Object.freeze(
  ONE_TIME_PRODUCTS.map((p) => productPath(p)),
);

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
