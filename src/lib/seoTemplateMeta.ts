/**
 * „Organic 2" — точни title/description overrides САМО за трите
 * high-intent slug-а от `seo_intent_v1`.
 *
 * Обхват: единствено presentation метаданни (`<title>` / meta description).
 * НЕ променя H1, slug, canonical, маршрути, `doc` параметъра, права или уизарда.
 * Копието е честно: без „безплатно изтегляне", без времево обещание.
 */

import { SEO_INTENT_SLUGS } from "@/lib/seoTemplateIntent";
import { TEMPLATE_META_MAX } from "@/lib/resolveTemplatePresentation";

export interface SeoTemplateMetaOverride {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

const OVERRIDES: readonly SeoTemplateMetaOverride[] = [
  {
    slug: "priemo-predavatelen-protokol",
    title: "Приемно-предавателен протокол — Word/PDF образец",
    description:
      "Приемно-предавателен протокол — онлайн образец на български. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.",
  },
  {
    slug: "dogovor-za-naem-na-parkomyasto-garazh",
    title: "Договор за наем на паркомясто/гараж — Word/PDF образец",
    description:
      "Договор за наем на паркомясто или гараж — онлайн образец. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.",
  },
  {
    slug: "molba-za-napuskane-chl-326-al-1-kt",
    title: "Молба за напускане по чл. 326 — Word/PDF образец",
    description:
      "Молба за напускане по чл. 326, ал. 1 КТ — онлайн образец. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.",
  },
] as const;

const BY_SLUG: ReadonlyMap<string, SeoTemplateMetaOverride> = new Map(
  OVERRIDES.map((o) => [o.slug, o] as const),
);

/** Точният allowlist (идентичен на `seo_intent_v1`) — за тестове и одит. */
export const SEO_TEMPLATE_META_SLUGS: readonly string[] = OVERRIDES.map((o) => o.slug);

/** Гарантира, че двата allowlist-а не се разминават. */
export const SEO_TEMPLATE_META_MATCHES_INTENT: boolean =
  SEO_TEMPLATE_META_SLUGS.length === SEO_INTENT_SLUGS.length &&
  SEO_TEMPLATE_META_SLUGS.every((s) => SEO_INTENT_SLUGS.includes(s));

export const SEO_TEMPLATE_META_LIMIT = TEMPLATE_META_MAX;

export function getSeoTemplateMeta(slug: string | undefined): SeoTemplateMetaOverride | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}
