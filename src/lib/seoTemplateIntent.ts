/**
 * „SEO template intent v1" — тесен, измерим конверсионен експеримент САМО за
 * три канонични SEO шаблона с висок трафик и много ниско достигане до уизарда.
 *
 * Обхват (умишлено минимален):
 *  - конкретен primary label в hero,
 *  - компактен intent панел с три конкретни доказателствени точки и един CTA,
 *  - „preview-first" линк вместо незабавното сваляне на празна бланка.
 *
 * Инварианти: НЕ променя slug, canonical, резолюция на уизарда, `doc`
 * параметъра или анонимното създаване. Само frontend презентация + метрики.
 *
 * Копието е честно: без правни гаранции, без „проверено от юрист", без
 * изкуствен дефицит, без отзиви и без цени.
 */

/** Версия на експеримента — влиза в метриките като low-cardinality вариант. */
export const SEO_INTENT_VERSION = "seo_intent_v1";

/** Вариант за страници без експеримента. */
export const SEO_INTENT_BASELINE = "baseline";

/** Обща честна подкрепяща линия — без обещание за време. */
export const SEO_INTENT_SUPPORT_LINE = "Старт и работен преглед без регистрация.";

/** Линк към редактора вместо незабавно сваляне на празна бланка. */
export const SEO_INTENT_BLANK_LINK_LABEL = "Търсите празна бланка? Отворете редактора";

export interface SeoTemplateIntent {
  /** Каноничен slug на шаблона (непроменен). */
  readonly slug: string;
  /** Етикет на основния (златен) CTA. */
  readonly primaryLabel: string;
  /** Точно три конкретни доказателствени точки. */
  readonly proofPoints: readonly [string, string, string];
}

const CONFIG: readonly SeoTemplateIntent[] = [
  {
    slug: "priemo-predavatelen-protokol",
    primaryLabel: "Попълни протокола",
    proofPoints: [
      "Състояние, ключове, вещи и показания",
      "Място за забележки и подписи",
      "Редактирате преди сваляне",
    ],
  },
  {
    slug: "dogovor-za-naem-na-parkomyasto-garazh",
    primaryLabel: "Изготви договора",
    proofPoints: [
      "Наем, депозит и срок",
      "Достъп, предназначение и правила",
      "Редактирате преди сваляне",
    ],
  },
  {
    slug: "molba-za-napuskane-chl-326-al-1-kt",
    primaryLabel: "Подготви предизвестието",
    proofPoints: [
      "Дата на получаване и срок на предизвестието",
      "Данни за работодателя и длъжността",
      "Редактирате преди сваляне",
    ],
  },
] as const;

const BY_SLUG: ReadonlyMap<string, SeoTemplateIntent> = new Map(
  CONFIG.map((c) => [c.slug, c] as const),
);

/** Точният allowlist от три slug-а (за тестове и одит). */
export const SEO_INTENT_SLUGS: readonly string[] = CONFIG.map((c) => c.slug);

export function getSeoTemplateIntent(slug: string | undefined): SeoTemplateIntent | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

export function isSeoIntentSlug(slug: string | undefined): boolean {
  return Boolean(slug && BY_SLUG.has(slug));
}

/** Low-cardinality вариант за събитията на шаблонната страница. */
export function seoIntentVariant(slug: string | undefined): string {
  return isSeoIntentSlug(slug) ? SEO_INTENT_VERSION : SEO_INTENT_BASELINE;
}
