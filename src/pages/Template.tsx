import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, AlertTriangle, FileText, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { getRelatedTemplates, getTemplateBySlug } from "@/lib/templateIndex";
import { TEMPLATE_CONTENT } from "@/data/templateContent";

export default function TemplatePage() {
  const { slug } = useParams<{ slug: string }>();
  const entry = useMemo(() => (slug ? getTemplateBySlug(slug) : undefined), [slug]);

  if (!entry) return <Navigate to="/catalog" replace />;

  const { doc, category } = entry;
  const related = getRelatedTemplates(entry, 3);
  const aiContent = TEMPLATE_CONTENT[entry.slug];

  const wizardHref = `/wizard/${category.sectorId}?doc=${encodeURIComponent(doc.name)}`;
  const canonical = `/shablon/${entry.slug}`;
  const pageTitle = `${doc.name} — образец на български | Dogovori.net`;
  const pageDesc = aiContent?.intro
    ? aiContent.intro.slice(0, 155)
    : `${doc.purpose} Готов шаблон по българското право (ЗЗД, ТЗ). Попълни и изтегли PDF/DOCX за 2 минути.`;

  // Use AI-generated rich content when available, fallback to generic content from catalog metadata.
  const intro = aiContent?.intro;

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

  return (
    <div className="min-h-screen">
      <Seo
        title={pageTitle}
        description={pageDesc}
        canonical={canonical}
        type="article"
        jsonLd={[breadcrumbsLd, articleLd, faqLd]}
      />
      <Header />

      <article className="container max-w-4xl py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/catalog" className="hover:text-gold">Каталог</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/catalog#${category.id}`} className="hover:text-gold">{category.title}</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{doc.name}</span>
        </nav>

        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-gold">
            <FileText className="h-3 w-3" />
            {category.title}
          </div>
          <h1 className="font-serif text-3xl font-bold leading-tight md:text-5xl">{doc.name}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{doc.purpose}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={wizardHref}
              className="inline-flex items-center gap-2 rounded-md bg-gradient-gold px-6 py-3 text-sm font-bold uppercase tracking-wider text-navy shadow-gold transition-all hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
            >
              Създай за 2 минути <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 rounded-md border border-gold/30 px-6 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
            >
              Виж всички шаблони
            </Link>
          </div>
        </header>

        <section className="mb-10 rounded-xl border border-gold/20 bg-gradient-card p-6 shadow-soft">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">Ключова клауза</div>
          <p className="font-serif text-lg italic text-foreground">⚖ {doc.keyClause}</p>
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
          <div className="space-y-4">
            {faq.map((f, i) => (
              <details key={i} className="group rounded-lg border border-border/60 bg-navy-light/30 p-4">
                <summary className="cursor-pointer font-serif text-base font-bold text-foreground">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
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
                  className="group rounded-lg border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/40 hover:shadow-soft"
                >
                  <h3 className="font-serif text-sm font-bold text-foreground group-hover:text-gold">
                    {r.doc.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.doc.purpose}</p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <section className="mt-12 rounded-2xl border border-gold/20 bg-gradient-card p-8 text-center shadow-elegant">
          <h2 className="font-serif text-2xl font-bold md:text-3xl">Готов ли сте да създадете {doc.name}?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Попълнете кратък въпросник и получете готов договор в PDF и DOCX формат, съобразен с българското право.
          </p>
          <Link
            to={wizardHref}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gradient-gold px-6 py-3 text-sm font-bold uppercase tracking-wider text-navy shadow-gold"
          >
            Започни сега <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </article>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 font-serif text-2xl font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
