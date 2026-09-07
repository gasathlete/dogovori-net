import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "./Logo";


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
  // Lazy-load the catalog index (~166KB) off the critical path. The footer
  // sits below the fold on every page; resolving anchors after first paint
  // keeps initial JS small without hurting SEO (Googlebot executes JS).
  const [byName, setByName] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    import("@/lib/templateIndex").then((m) => {
      if (cancelled) return;
      setByName(new Map(m.allTemplates().map((t) => [t.doc.name, t.slug])));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const resolveBlock = (block: AnchorBlock) =>
    block.links
      .map((l) => ({ anchor: l.anchor, slug: byName.get(l.docName) }))
      .filter((l): l is { anchor: string; slug: string } => Boolean(l.slug));


  return (
    <footer className="border-t border-border/60 bg-navy-light/40 pt-12">
      <div className="container">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Документи, договори, бланки и шаблони онлайн на български език. Над 600 готови шаблона по ЗЗД, ТЗ и КТ — попълнете с AI асистент.
            </p>
            <a
              href="https://im-development.imot.bg"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold py-[40px] my-0"
            >
              Powered by <span className="font-semibold text-gold/90">IM Development</span>
            </a>
          </div>

          {ANCHOR_BLOCKS.map((block) => {
            const links = resolveBlock(block);
            if (links.length === 0) return null;
            return (
              <div key={block.title}>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-gold">
                  {block.title}
                </h3>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {links.map((l) => (
                    <li key={l.slug}>
                      <Link to={`/shablon/${l.slug}`} className="transition-colors hover:text-gold">
                        {l.anchor}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-gold">Категории</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {FOOTER_CATEGORIES.map((cat) => (
                <li key={cat.id}>
                  <Link to={`/kategoria/${cat.id}`} className="transition-colors hover:text-gold">
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
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/terms" className="hover:text-gold">Общи условия</Link>
            <Link to="/privacy" className="hover:text-gold">Поверителност</Link>
            <Link to="/cookies" className="hover:text-gold">Бисквитки</Link>
            <Link to="/refund" className="hover:text-gold">Възстановяване</Link>
            <Link to="/blog" className="hover:text-gold">Блог</Link>
            <Link to="/contacts" className="hover:text-gold">Контакти</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
