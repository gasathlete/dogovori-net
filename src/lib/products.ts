/**
 * Единственият източник на истина за еднократните продукти (presentation слой).
 *
 * Тук НЯМА плащане, checkout, quota или кредити — само типизирана,
 * immutable конфигурация за продуктовата витрина (/produkti + началната
 * страница) и каноничните адреси на страниците.
 *
 * Цените са с включен ДДС и се форматират единствено през `fmtEur`, за да
 * няма разпръснати литерали в UI.
 */
import { fmtEur } from "@/lib/pricing";
import { isFeatureAvailable } from "@/lib/prelaunch";

export const PRODUCTS_SEO = Object.freeze({
  title: "Проверка на договор, поправка и подготовка за преговори",
  description: "Проверка на документ преди подпис, поправка на текста или пакет за преговори. Еднократно плащане за един документ, без абонамент.",
});

export type OneTimeProductId =
  | "contract_check"
  | "contract_improve"
  | "negotiation_package";

export type ProductDemoKind = "scan" | "diff" | "package";

/** Каноничният ASCII slug на продукта — единственото място, което го дефинира. */
export type OneTimeProductSlug =
  | "proverka-predi-podpis"
  | "popravi-dokument"
  | "palen-paket-pregovori";

export interface ProductFaqItem {
  readonly q: string;
  readonly a: string;
}

/** Раздел от реалния резултат — какво точно съдържа доставеното. */
export interface ProductResultSection {
  readonly heading: string;
  readonly items: readonly string[];
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
  /** Какво получава — кратко, 3–5 реда. */
  readonly youReceive: readonly string[];
  /** Подробният състав на резултата — по раздели, без стена от текст. */
  readonly resultSections: readonly ProductResultSection[];
  /** Точно три кратки стъпки. */
  readonly steps: readonly string[];
  readonly faq: readonly ProductFaqItem[];
}

export interface OneTimeProduct {
  readonly id: OneTimeProductId;
  readonly slug: OneTimeProductSlug;
  readonly name: string;
  /** Кратко име — за тесни места в интерфейса. */
  readonly shortName: string;
  /** Цена в EUR с включен ДДС. */
  readonly priceEur: number;
  /**
   * Предишната редовна цена в EUR — подадена от собственика. Показва се
   * задраскана до текущата и е единствената база за процента отстъпка.
   */
  readonly previousPriceEur: number;
  /** Един кратък ред за резултата — за тесни места (hero ред, карта). */
  readonly shortOutcome: string;
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

/** Кратък обхват — за заглавия и резюмета. Едно изречение, без натиск. */
export const ONE_TIME_SCOPE_NOTE = "За един документ. Без абонамент.";

/**
 * Prepared release UI; new LIVE checkout still requires the private server launch row.
 * Publishing and enabling that row remain separate owner-controlled actions.
 */
export const ONE_TIME_PURCHASES_AVAILABLE = isFeatureAvailable("one_time_product");

/** Истинното публично състояние преди официалното пускане. */
export const ONE_TIME_PRELAUNCH_MESSAGE =
  "Покупките за еднократните продукти още не са отворени. Можете да разгледате обхвата и примерния резултат.";

/**
 * Етикетът на текущата цена. Не е промоция с краен срок — затова няма брояч,
 * дата и изкуствен недостиг.
 */
export const PRICE_INTRO_LABEL = "Въвеждаща цена";

export const ONE_TIME_PRODUCTS: readonly OneTimeProduct[] = Object.freeze([
  Object.freeze({
    id: "contract_check",
    slug: "proverka-predi-podpis",
    name: "Подробна проверка преди подпис",
    shortName: "Проверка",
    priceEur: 2.99,
    previousPriceEur: 3.99,
    shortOutcome: "Разбор клауза по клауза с точно място в текста.",
    promise:
      "Виждате какво поемате, докога и какво липсва — клауза по клауза, с точно място в документа.",
    outcomes: Object.freeze([
      "Паспорт на документа — вид, страни, предмет, обем",
      "Всички установени съществени въпроси, подредени по тежест",
      "Всяка находка с точно място в текста и извадка",
      "Задължения, пари, срокове, неустойки и лихви по страни",
      "Прекратяване, спорове, противоречия и липсващи защити",
      "Въпроси, които да зададете, и разбор за сваляне в PDF",
    ]),
    ctaLabel: "Проверете документ",
    ctaHref: "/produkti/proverka-predi-podpis/start",
    demo: "scan",
    page: Object.freeze({
      title: "Подробна проверка на документ — 2,99 € еднократно",
      metaDescription:
        "Подробна проверка преди подпис: задължения, срокове, неустойки, прекратяване и липсващи защити. Всяка находка сочи място в текста. 2,99 € еднократно.",
      h1: "Подробна проверка на документ преди подпис",
      intro:
        "Поставяте текста на документа, който Ви изпратиха, и получавате подробен разбор: какво поемате, докога, кои клаузи си противоречат и какво липсва. Всяка находка сочи точното място в текста.",
      youProvide: Object.freeze([
        "Пълния текст на документа без лични идентификатори",
        "Вашата роля по документа — например наемател или изпълнител",
      ]),
      youReceive: Object.freeze([
        "Паспорт на документа и кратко резюме на разбираем език",
        "Всички установени съществени въпроси с тежест и последица",
        "Всяка находка с точно място в текста и извадка",
        "Пари, срокове, прекратяване, спорове и липсващи защити",
        "Разбор, готов за печат и сваляне в PDF",
      ]),
      resultSections: Object.freeze([
        Object.freeze({
          heading: "Паспорт на документа",
          items: Object.freeze([
            "Вид на документа и предмет",
            "Страните и ролите им, когато се разчитат от текста",
            "Език на документа и обем — раздели и страници, когато се измерват",
          ]),
        }),
        Object.freeze({
          heading: "Находки клауза по клауза",
          items: Object.freeze([
            "Всички установени съществени въпроси — без изкуствен минимален брой",
            "Всяка находка с точна страница, раздел, абзац и извадка от текста",
            "Тежест (висока, средна, ниска), последица за Вас и конкретна следваща стъпка",
            "Противоречия и двусмислия между клаузите",
          ]),
        }),
        Object.freeze({
          heading: "Пари, срокове и изход",
          items: Object.freeze([
            "Задължения по страни — кой какво дължи",
            "Суми, дати, крайни срокове, подновяване и предизвестие",
            "Неустойки и лихви — извадени поименно",
            "Прекратяване и решаване на спорове",
            "Липсващи защити, които обичайно се уговарят при такъв документ",
          ]),
        }),
      ]),
      steps: Object.freeze([
        "Поставяте текста на документа",
        "Посочвате коя страна сте",
        "Получавате разбора и го сваляте в PDF",
      ]),
      faq: Object.freeze([
        {
          q: "Заменя ли това консултация с адвокат?",
          a: "Не. Получавате разбор на текста и списък с въпроси, които да зададете. Не е правен съвет за конкретния Ви случай.",
        },
        {
          q: "Какъв текст мога да поставя?",
          a: "Поставен текст до 60 000 знака. Заменете личните идентификатори с [ЕГН] или [IBAN]. PDF и Word (.docx) файлове се четат в браузъра Ви, без да се качват; сканирани документи не се разпознават.",
        },
        {
          q: "Колко находки ще видя?",
          a: "Толкова, колкото документът съдържа. Показваме всички установени съществени въпроси и не добавяме измислени рискове, за да изглежда списъкът по-дълъг.",
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
    name: "Подробна поправка на документа",
    shortName: "Поправка",
    priceEur: 3.99,
    previousPriceEur: 4.99,
    shortOutcome: "Готов текст за проблемните клаузи в три варианта.",
    badge: "Най-предпочитан",
    promise:
      "Включва подробната проверка и добавя готов текст за всяка клауза, която има нужда от поправка — в три варианта.",
    outcomes: Object.freeze([
      "Цялата подробна проверка",
      "Поправка за всяка клауза, която има нужда от нея",
      "Три варианта на текст: Консервативен, Балансиран, По-настъпателен",
      "Всяка поправка с точно място в текста, проблем и обосновка",
      "Приемате или отказвате поправка поотделно, с изглед преди и след",
      "Поправен документ в DOCX и PDF плюс отчет за промените",
    ]),
    ctaLabel: "Поправете документ",
    ctaHref: "/produkti/popravi-dokument/start",
    demo: "diff",
    page: Object.freeze({
      title: "Подробна поправка на документ — 3,99 € еднократно",
      metaDescription:
        "Готов текст за всяка клауза, която има нужда от поправка, в три варианта. Приемате поправките поотделно и сваляте готовия файл. 3,99 € еднократно.",
      h1: "Подробна поправка на Вашия документ",
      intro:
        "Поставяте текста на документа и получавате целия разбор плюс готовия текст, с който да замените проблемните клаузи. Всяка поправка идва в три варианта и решавате клауза по клауза.",
      youProvide: Object.freeze([
        "Пълния текст на документа без лични идентификатори",
        "Вашата роля и какво искате да постигнете",
        "Начален вариант, от който да тръгнем — по желание",
      ]),
      youReceive: Object.freeze([
        "Цялата подробна проверка на документа",
        "Поправка за всяка клауза, която има нужда от нея",
        "Три варианта на текст за всяка поправка",
        "Изглед преди и след, с приемане или отказ поотделно",
        "Поправен документ в DOCX и PDF и отчет за промените",
      ]),
      resultSections: Object.freeze([
        Object.freeze({
          heading: "Обхват на поправките",
          items: Object.freeze([
            "Всяка клауза, която основателно има нужда от поправка — без ограничение „до три“",
            "Оригиналният текст, точното място в документа и извадката",
            "Какъв е проблемът и защо предложената промяна го решава",
          ]),
        }),
        Object.freeze({
          heading: "Три готови варианта за всяка клауза",
          items: Object.freeze([
            "Консервативен — минимална промяна, запазва структурата и се приема лесно",
            "Балансиран — справедлива защита и за двете страни",
            "По-настъпателен — по-силна защита, с ясно посочен компромис",
            "Избирате общ начален вариант и след това променяте по клауза",
          ]),
        }),
        Object.freeze({
          heading: "Готови файлове и проследимост",
          items: Object.freeze([
            "Чист поправен документ в DOCX и PDF",
            "Отчет за промените — какво е прието, какво е отказано",
            "Поправките са обвързани с точната версия на поставения текст",
            "Ако промените текста, стари поправки не се прилагат безшумно",
          ]),
        }),
      ]),
      steps: Object.freeze([
        "Поставяте текста на документа",
        "Избирате вариант за всяка поправка",
        "Приемате избраните и сваляте файла",
      ]),
      faq: Object.freeze([
        {
          q: "Мога ли да откажа част от поправките?",
          a: "Да. Всяка поправка се приема или отказва поотделно и виждате текста преди и след.",
        },
        {
          q: "Какво значат трите варианта?",
          a: "Консервативният променя минимално, балансираният търси равновесие между страните, по-настъпателният засилва Вашата позиция и посочва какъв компромис поемате.",
        },
        {
          q: "В какъв формат получавам документа?",
          a: "Сваляте го като DOCX и PDF, с приетите от Вас поправки, заедно с отчет за промените.",
        },
        {
          q: "Проверява ли адвокат резултата?",
          a: "Не. Резултатът не е правен съвет и не заменя консултация за конкретния Ви случай.",
        },
      ]),
    }),
  }),
  Object.freeze({
    id: "negotiation_package",
    slug: "palen-paket-pregovori",
    name: "Пълен пакет за преговори",
    shortName: "Пълен пакет",
    priceEur: 7.99,
    previousPriceEur: 9.99,
    shortOutcome: "Проверка, поправки и подготовка за разговора.",
    badge: "Пълен пакет",
    promise:
      "Проверката, поправките и всичко, с което да седнете на масата: цели, червени линии, таблица със срокове и две готови писма.",
    outcomes: Object.freeze([
      "Цялата подробна проверка и цялата подробна поправка",
      "И трите варианта на текст за всяка клауза",
      "Записка за преговори: цели, червени линии, отстъпки, резервни позиции",
      "Таблица със задължения, срокове и отговорни действия",
      "Две кратки писма до другата страна — неутрално и твърдо",
      "Чист финален документ в DOCX и PDF плюс отчет за промените",
      "Едно допълнително прецизиране на избраната версия",
    ]),
    ctaLabel: "Подгответе документа за преговори",
    ctaHref: "/produkti/palen-paket-pregovori/start",
    demo: "package",
    page: Object.freeze({
      title: "Пълен пакет за преговори — 7,99 € еднократно",
      metaDescription:
        "Проверка, поправки в три варианта, записка за преговори, таблица със срокове, две готови писма и чист финален документ. 7,99 € еднократно.",
      h1: "Пълен пакет за преговори по Вашия документ",
      intro:
        "За предприемачи и професионалисти, които имат документ за преглед и предстоящ разговор. Получавате целия разбор, поправките в три варианта и подготовката, с която да водите преговора.",
      youProvide: Object.freeze([
        "Пълния текст на документа без лични идентификатори",
        "Вашата роля и какво искате да постигнете",
        "Кратко за отношенията с другата страна",
        "Предпочитана начална позиция",
      ]),
      youReceive: Object.freeze([
        "Подробната проверка и подробната поправка в три варианта",
        "Записка за преговори с цели, червени линии и отстъпки",
        "Таблица със задължения, срокове и действия",
        "Две готови кратки писма до другата страна",
        "Чист финален документ, отчет за промените и едно прецизиране",
      ]),
      resultSections: Object.freeze([
        Object.freeze({
          heading: "Всичко от първите два продукта",
          items: Object.freeze([
            "Цялата подробна проверка с находки, места в текста и тежест",
            "Цялата подробна поправка за всяка клауза, която има нужда",
            "И трите варианта: Консервативен, Балансиран, По-настъпателен",
          ]),
        }),
        Object.freeze({
          heading: "Подготовка за разговора",
          items: Object.freeze([
            "Записка за преговори: цели, червени линии, приемливи отстъпки, резервни позиции",
            "Въпросите, които да зададете на другата страна",
            "Таблица със задължения, срокове и кой какво прави",
            "Две кратки писма до другата страна — неутрално и твърдо",
          ]),
        }),
        Object.freeze({
          heading: "Финален резултат",
          items: Object.freeze([
            "Чист финален документ в DOCX и PDF",
            "Отчет за промените спрямо получения текст",
            "Едно допълнително прецизиране на избраната версия",
            "Резултатът е обвързан с точната версия на поставения текст",
          ]),
        }),
      ]),
      steps: Object.freeze([
        "Поставяте текста на документа и отговаряте на няколко въпроса",
        "Избирате варианта за всяка клауза",
        "Сваляте финалния документ и подготовката за преговора",
      ]),
      faq: Object.freeze([
        {
          q: "За кого е пакетът?",
          a: "За предприемачи и професионалисти, които имат конкретен документ за преглед и предстоящ разговор с другата страна.",
        },
        {
          q: "Какво включва „едно прецизиране“?",
          a: "След като изберете версия, можете веднъж да поискате допълнително прецизиране на същия документ, без нова покупка.",
        },
        {
          q: "Нужен ли ми е абонамент?",
          a: "Не. Плащате 7,99 € еднократно и получавате целия пакет. Абонамент има смисъл само ако работите с документи всеки месец.",
        },
        {
          q: "Води ли преговора човек от Ваша страна?",
          a: "Не. Получавате подготовката и текстовете; разговорът остава Ваш. Резултатът не е правен съвет.",
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

/** Задрасканата предишна цена — същото форматиране като текущата. */
export function productPreviousPriceLabel(id: OneTimeProductId): string {
  return fmtEur(BY_ID[id].previousPriceEur);
}

/**
 * Точният закръглен процент отстъпка спрямо предишната цена. Едно място за
 * сметката — никъде в интерфейса не се пише процент на ръка.
 */
export function productDiscountPercent(id: OneTimeProductId): number {
  const { priceEur, previousPriceEur } = BY_ID[id];
  if (previousPriceEur <= priceEur) return 0;
  return Math.round(((previousPriceEur - priceEur) / previousPriceEur) * 100);
}

/** Готовият етикет за значката — например „−25%". Празен низ без отстъпка. */
export function productDiscountLabel(id: OneTimeProductId): string {
  const pct = productDiscountPercent(id);
  return pct > 0 ? `−${pct}%` : "";
}

/** Честна входна котва („от …") — винаги най-ниската реална цена. */
export function lowestOneTimePriceLabel(): string {
  return fmtEur(Math.min(...ONE_TIME_PRODUCTS.map((p) => p.priceEur)));
}

/** Продуктът с контролирано подчертано представяне на десктоп. */
export const FEATURED_PRODUCT_ID: OneTimeProductId = "contract_improve";

/** Пакетът за професионалисти — по-плътно, но спокойно премиум представяне. */
export const PREMIUM_PRODUCT_ID: OneTimeProductId = "negotiation_package";

export function isPremiumProduct(id: OneTimeProductId): boolean {
  return id === PREMIUM_PRODUCT_ID;
}

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

/** Пътят на самата покупка — текстът на документа се подава там, преди плащане. */
export function productStartPath(product: OneTimeProduct): string {
  return `${productPath(product)}/start`;
}

export function productStartPathById(id: OneTimeProductId): string {
  return productStartPath(BY_ID[id]);
}

/** Каноничният път на резултата след платена покупка. */
export const PRODUCT_RESULT_PATH = "/produkti/rezultat";

/** Всички продуктови пътища — за sitemap и вътрешни връзки. */
export const ONE_TIME_PRODUCT_PATHS: readonly string[] = Object.freeze(
  ONE_TIME_PRODUCTS.map((p) => productPath(p)),
);

/**
 * Изтеглени стари адреси → каноничната страница на пълния пакет. Старата
 * „Бизнес карта на документите“ никога не е била продавана, затова не пазим
 * нейни цени или метаданни — само пренасочваме, за да няма счупени връзки.
 */
export const LEGACY_PRODUCT_SLUG_REDIRECTS: Readonly<Record<string, string>> =
  Object.freeze({
    "biznes-karta-dokumenti": "palen-paket-pregovori",
    "biznes-karta": "palen-paket-pregovori",
  });

/** Каноничният път, към който води изтеглен slug — иначе null. */
export function legacyProductRedirect(slug: string | undefined): string | null {
  if (typeof slug !== "string") return null;
  const target = Object.prototype.hasOwnProperty.call(
    LEGACY_PRODUCT_SLUG_REDIRECTS,
    slug,
  )
    ? LEGACY_PRODUCT_SLUG_REDIRECTS[slug]
    : undefined;
  return target ? `/produkti/${target}` : null;
}

/* ------------------------- Funnel събития ------------------------- */

export const PRODUCT_EVENTS = Object.freeze({
  sectionViewed: "product_section_viewed",
  productSelected: "product_selected",
  nextStepClicked: "product_next_step_clicked",
  detailsOpened: "product_details_opened",
} as const);
