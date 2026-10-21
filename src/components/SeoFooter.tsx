import { Link } from "react-router-dom";
import { BrandLockup } from "./BrandLockup";
import { ONE_TIME_PRODUCTS, productPath } from "@/lib/products";
import { CATALOG_DOCUMENT_COUNT } from "@/lib/catalogStats";
import { CATALOG_REVIEW_STATUS } from "@/lib/templateReviewStatus";
import FOOTER_ANCHOR_SLUGS from "@/data/footerAnchors.generated.json";


// Top 8 categories inlined to avoid pulling the full CATALOG (166KB) into the
// initial bundle on every page that renders the footer (Index, Catalog, ...).
const FOOTER_CATEGORIES: { id: string; title: string }[] = [
  { id: "digital", title: "Дигитални услуги и ИТ" },
  { id: "ip", title: "Интелектуална собственост и Конфиденциалност" },
  { id: "naem", title: "Наемни отношения" },
  { id: "imoti-prodazhba", title: "Сделки с имоти и брокерски услуги" },
  { id: "kupopr", title: "Покупко-продажба и облигационни" },
  { id: "uslugi", title: "Услуги и граждански договори" },
  { id: "trudovi", title: "Трудови правоотношения и кадри" },
  { id: "korp", title: "Корпоративно управление" },
];

// SEO footer — designed to inject ~30+ long descriptive Bulgarian anchors
// pointing at the top templates from EVERY page on the site. Anchor text is
// one of the strongest internal ranking signals; long phrases beat short
// names ("Изтегли образец на трудов договор 2026" >> "Трудов договор").

interface AnchorBlock {
  title: string;
  links: { anchor: string; docName: string }[];
}

const ANCHOR_BLOCKS: AnchorBlock[] = [
  {
    title: "Трудови и граждански",
    links: [
      { anchor: "Трудов договор по чл. 67 КТ — образец 2026", docName: "Трудов договор (чл. 67 КТ)" },
      { anchor: "Граждански договор за услуги — попълни онлайн", docName: "Граждански договор / Договор за услуги" },
    ],
  },
  {
    title: "Имоти и наем",
    links: [
      { anchor: "Безплатен договор за наем на апартамент", docName: "Договор за наем на жилище" },
      { anchor: "Договор за наем на офис помещение", docName: "Договор за наем на офис" },
      { anchor: "Договор за краткосрочен наем (Airbnb тип)", docName: "Договор за краткосрочен наем (Airbnb тип)" },
      { anchor: "Приемно-предавателен протокол при наем", docName: "Приемно-предавателен протокол" },
      { anchor: "Предизвестие за прекратяване на наем", docName: "Предизвестие за прекратяване на наем" },
      { anchor: "Двуезичен договор за наем (BG/EN) за чужденци", docName: "Двуезичен договор за наем (BG/EN) за чужденци" },
    ],
  },
  {
    title: "IT, бизнес и IP",
    links: [
      { anchor: "NDA — споразумение за поверителност", docName: "NDA – Договор за конфиденциалност" },
      { anchor: "Договор за изработка на уебсайт или приложение", docName: "Договор за изработка на уебсайт / мобилно приложение" },
      { anchor: "SaaS абонаментен договор на български", docName: "SaaS абонаментен договор" },
      { anchor: "SLA договор за поддръжка на софтуер", docName: "Договор за поддръжка на софтуер/хардуер (SLA)" },
      { anchor: "Декларация за съгласие по GDPR", docName: "Декларация за съгласие по GDPR" },
      { anchor: "Лицензионен договор за софтуер (EULA)", docName: "Лицензионен договор за софтуер (EULA)" },
    ],
  },
];

export function SeoFooter() {
  // Адресите на връзките се готвят при сглобяване (scripts/generate-footer-anchors.ts),
  // затова футърът не зарежда целия каталог (~160 KB) при всяко отваряне на страница.
  const resolveBlock = (block: AnchorBlock) =>
    block.links
      .map((l) => ({
        anchor: l.anchor,
        slug: (FOOTER_ANCHOR_SLUGS as Record<string, string>)[l.docName],
      }))
      .filter((l): l is { anchor: string; slug: string } => Boolean(l.slug));


  return (
    <footer className="brand-footer border-t border-border bg-background pt-12 pb-16 lg:pb-0">
      <div className="container">
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" aria-label="Договори.нет — начало" className="inline-flex min-h-11 items-center"><BrandLockup /></Link>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Помощ в ежедневната бюрокрация за хората и малкия и средния бизнес. {CATALOG_DOCUMENT_COUNT} образеца за лични въпроси, работа и бизнес.
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
              {CATALOG_REVIEW_STATUS.notice}
            </p>
            <a
              href="https://im-development.imot.bg"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-gold"
            >
              От <span className="whitespace-nowrap font-semibold text-gold/90">IM Development</span>
            </a>
          </div>

          {ANCHOR_BLOCKS.map((block) => {
            const links = resolveBlock(block);
            if (links.length === 0) return null;
            return (
              <div key={block.title}>
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {block.title}
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {links.map((l) => (
                    <li key={l.slug}>
                      <Link to={`/shablon/${l.slug}`} className="inline-flex min-h-11 items-center leading-relaxed hover:underline underline-offset-4">
                        {l.anchor}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Продукти</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {ONE_TIME_PRODUCTS.map((p) => (
                <li key={p.id}>
                  <Link to={productPath(p)} className="inline-flex min-h-11 items-center leading-relaxed hover:underline underline-offset-4">
                    {p.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/paketi" className="inline-flex min-h-11 items-center leading-relaxed hover:underline underline-offset-4">
                  Пакети по сектор
                </Link>
              </li>
              <li>
                <Link to="/komplekti" className="inline-flex min-h-11 items-center leading-relaxed hover:underline underline-offset-4">
                  Комплекти по ситуация
                </Link>
              </li>
              <li>
                <Link to="/produkti" className="inline-flex min-h-11 items-center leading-relaxed hover:underline underline-offset-4">
                  Всички продукти
                </Link>
              </li>
              <li>
                <Link to="/plans" className="inline-flex min-h-11 items-center leading-relaxed hover:underline underline-offset-4">
                  Планове
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Категории</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {FOOTER_CATEGORIES.map((cat) => (
                <li key={cat.id}>
                  <Link to={`/kategoria/${cat.id}`} className="inline-flex min-h-11 items-center leading-relaxed hover:underline underline-offset-4">
                    {cat.title}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/karta" className="font-medium text-gold/90 transition-colors hover:text-gold">
                  Карта на сайта →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border/40 py-6 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Dogovori.net · Изготвените договори не заместват консултация с адвокат.</div>
          <nav aria-label="Правна информация" className="flex flex-wrap gap-x-4">
            <Link to="/terms" className="inline-flex min-h-11 items-center hover:text-gold">Общи условия</Link>
            <Link to="/privacy" className="inline-flex min-h-11 items-center hover:text-gold">Поверителност</Link>
            <Link to="/cookies" className="inline-flex min-h-11 items-center hover:text-gold">Бисквитки</Link>
            <Link to="/refund" className="inline-flex min-h-11 items-center hover:text-gold">Възстановяване</Link>
            <Link to="/blog" className="inline-flex min-h-11 items-center hover:text-gold">Блог</Link>
            <Link to="/contacts" className="inline-flex min-h-11 items-center hover:text-gold">Контакти</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
