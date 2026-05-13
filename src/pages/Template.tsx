import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, CheckCircle2, AlertTriangle, FileText, ChevronRight, Download } from "lucide-react";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { getRelatedTemplates, getTemplateBySlug } from "@/lib/templateIndex";
import { TEMPLATE_CONTENT_META } from "@/data/templateContentMeta";
import { loadTemplateContent } from "@/data/templateContent";
import type { TemplateContent } from "@/data/templateContentTypes";
import { trackEvent } from "@/lib/analytics";

export default function TemplatePage() {
  const { slug } = useParams<{ slug: string }>();
  const entry = useMemo(() => (slug ? getTemplateBySlug(slug) : undefined), [slug]);

  // Async-load the heavy AI content for this template only.
  const [aiContent, setAiContent] = useState<TemplateContent | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (!entry) return;
    const p = loadTemplateContent(entry.slug);
    if (!p) return;
    p.then((c) => alive && setAiContent(c)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [entry?.slug]);

  useEffect(() => {
    if (entry) trackEvent("template_view", { slug: entry.slug, name: entry.doc.name, category: entry.category.title });
  }, [entry]);

  if (!entry) return <Navigate to="/catalog" replace />;

  const { doc, category } = entry;
  const related = getRelatedTemplates(entry, 3);

  // Sync meta (used for <meta description> + JSON-LD) — keeps SEO unchanged.
  const meta = TEMPLATE_CONTENT_META[entry.slug];

  const wizardHref = `/wizard/${category.sectorId}?doc=${encodeURIComponent(doc.name)}`;
  const canonical = `/shablon/${entry.slug}`;
  const pageTitle = `${doc.name} — образец и бланка на български | PDF, DOCX`;
  const pageDesc = meta?.introExcerpt
    ? `${meta.introExcerpt.slice(0, 110)} Безплатен образец на ${doc.name.toLowerCase()} – PDF/DOCX, по ЗЗД и ТЗ.`.slice(0, 160)
    : `Безплатен образец на ${doc.name.toLowerCase()} на български – готов шаблон по ЗЗД, ТЗ и КТ. Попълни и изтегли PDF или DOCX за 2 минути.`.slice(0, 160);

  // Use AI-generated rich content when loaded; show generic fallback meanwhile (zero CLS — same DOM).
  const intro = aiContent?.intro ?? meta?.introExcerpt;

  const usageCases = aiContent?.usageCases ?? [
    `Когато страните по ${doc.name.toLowerCase()} желаят писмено уреждане на отношенията си.`,
    `При необходимост от доказване пред съд, НАП или други институции.`,
    `Преди започване на работа, доставка или предоставяне на услуга.`,
  ];

  const requirements = aiContent?.requirements ?? [
    "Пълни данни на страните (име/фирма, ЕГН/ЕИК, адрес, представител).",
    "Ясен предмет и обхват на договора.",
    "Цена, срок и начин на плащане.",
    "Права и задължения на двете страни.",
    "Основания за прекратяване и санкции при неизпълнение.",
    "Подписи на страните и дата.",
  ];

  const mistakes = aiContent?.mistakes ?? [
    "Липсващи или неточни идентификационни данни на страните.",
    "Неясен предмет, който води до спорове при изпълнение.",
    "Пропуснат срок или начин на плащане.",
    "Липса на клауза за решаване на спорове и приложимо право.",
  ];

  const faq = aiContent?.faq ?? [
    {
      q: `Задължително ли е ${doc.name.toLowerCase()} да бъде в писмена форма?`,
      a: "По принцип ЗЗД допуска и устни договори, но писменият договор е силно препоръчителен за доказване и защита на правата на страните.",
    },
    {
      q: "Има ли нужда от нотариална заверка?",
      a: "За повечето договори не е задължителна нотариална заверка. Тя става задължителна при договори за недвижими имоти, дарения на имоти и някои корпоративни сделки.",
    },
    {
      q: "Колко струва изготвянето на договора в Dogovori.net?",
      a: "Безплатно за първия документ. Pro абонамент дава неограничен брой договори, DOCX експорт и електронен подпис.",
    },
    {
      q: "Мога ли да го редактирам след генериране?",
      a: "Да. Експортираме договора в DOCX (Word) формат, който можете да редактирате допълнително преди подпис.",
    },
  ];

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "Каталог", item: "https://dogovori.net/catalog" },
      {
        "@type": "ListItem",
        position: 3,
        name: category.title,
        item: `https://dogovori.net/catalog#${category.id}`,
      },
      { "@type": "ListItem", position: 4, name: doc.name, item: `https://dogovori.net${canonical}` },
    ],
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: doc.name,
    description: doc.purpose,
    inLanguage: "bg-BG",
    author: { "@type": "Organization", name: "Dogovori.net" },
    publisher: {
      "@type": "Organization",
      name: "Dogovori.net",
      logo: { "@type": "ImageObject", url: "https://dogovori.net/favicon.png" },
    },
    mainEntityOfPage: `https://dogovori.net${canonical}`,
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${doc.name} — образец`,
    description: doc.purpose,
    inLanguage: "bg-BG",
    category: category.title,
    brand: { "@type": "Brand", name: "Dogovori.net" },
    url: `https://dogovori.net${canonical}`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BGN",
      availability: "https://schema.org/InStock",
      url: `https://dogovori.net${canonical}`,
    },
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Как да изготвя ${doc.name.toLowerCase()} онлайн`,
    inLanguage: "bg-BG",
    totalTime: "PT2M",
    step: [
      { "@type": "HowToStep", position: 1, name: "Избор на шаблон", text: `Изберете „${doc.name}“ от каталога на Dogovori.net.` },
      { "@type": "HowToStep", position: 2, name: "Попълване на въпросник", text: "Отговорете на стратегическия въпросник, изграден от юристи." },
      { "@type": "HowToStep", position: 3, name: "Анализ на риска", text: "Системата проверява клаузите по ЗЗД, ТЗ и КТ и предлага корекции." },
      { "@type": "HowToStep", position: 4, name: "Експорт", text: "Изтеглете готовия документ в PDF или DOCX формат." },
      { "@type": "HowToStep", position: 5, name: "Електронен подпис", text: "Подпишете документа онлайн или го разпечатайте." },
    ],
  };

  return (
    <div className="min-h-screen">
      <Seo
        title={pageTitle}
        description={pageDesc}
        canonical={canonical}
        type="article"
        jsonLd={[breadcrumbsLd, articleLd, productLd, howToLd, faqLd]}
      />
      <Header />

      <article className="container max-w-4xl py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/catalog" className="hover:text-gold">Каталог</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/catalog#${category.id}`} className="hover:text-gold">{category.title}</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-foreground/70">{doc.name}</span>
        </nav>

        <header className="mb-10 relative">
          <div className="eyebrow mb-4">
            <FileText className="h-3 w-3" />
            {category.title}
          </div>
          <h1 className="font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl">{doc.name}</h1>
          <p className="mt-5 text-balance text-base leading-relaxed text-muted-foreground md:text-lg">{doc.purpose}</p>

          <div className="absolute top-0 right-0">
            <Link
              to={`${wizardHref}&blank=1`}
              className="inline-flex items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 text-xs text-gold transition-colors hover:bg-gold/10"
            >
              <Download className="h-3 w-3" />
              Свали само бланка
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link to={wizardHref} className="btn-gold">
              Създай за 2 минути <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/catalog" className="btn-ghost-gold normal-case tracking-normal">
              Виж всички шаблони
            </Link>
          </div>
        </header>

        {intro && (
          <div className="prose prose-invert mb-10 max-w-none text-base leading-[1.8] text-foreground/90">
            <p className="text-pretty">{intro}</p>
          </div>
        )}

        <section className="mb-12 rounded-xl surface-elevated p-6 md:p-7">
          <div className="eyebrow mb-3">Ключова клауза</div>
          <p className="font-serif text-lg italic leading-relaxed text-foreground md:text-xl">⚖ {doc.keyClause}</p>
        </section>

        <Section title="Кога се използва този договор">
          <ul className="space-y-2">
            {usageCases.map((u, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Задължителни реквизити по българското право">
          <ul className="space-y-2">
            {requirements.map((r, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Препратки: Закон за задълженията и договорите (ЗЗД), Търговски закон (ТЗ).
          </p>
        </Section>

        <Section title="Често допускани грешки">
          <ul className="space-y-2">
            {mistakes.map((m, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Често задавани въпроси">
          <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-card/30">
            {faq.map((f, i) => (
              <details key={i} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-start justify-between gap-3 font-serif text-base font-bold text-foreground">
                  <span>{f.q}</span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gold transition-transform duration-200 group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {related.length > 0 && (
          <Section title="Свързани шаблони">
            <div className="grid gap-3 md:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`/shablon/${r.slug}`}
                  className="group rounded-xl surface-elevated p-4 transition-colors hover:border-gold/45"
                >
                  <h3 className="font-serif text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-gold">
                    {r.doc.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{r.doc.purpose}</p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <section className="relative mt-14 overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-10 text-center shadow-elegant md:p-12">
          <div className="absolute inset-x-0 top-0 hairline-x" />
          <h2 className="font-serif text-2xl font-bold leading-tight text-balance md:text-[32px]">Готов ли сте да създадете {doc.name}?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground">
            Попълнете кратък въпросник и получете готов договор в PDF и DOCX формат, съобразен с българското право.
          </p>
          <Link to={wizardHref} className="btn-gold mt-7">
            Започни сега <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </article>

      <SeoFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-5 font-serif text-2xl font-bold leading-tight text-foreground md:text-[28px]">{title}</h2>
      {children}
    </section>
  );
}
