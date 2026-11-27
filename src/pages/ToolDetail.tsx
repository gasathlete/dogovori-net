import { Navigate, useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { ChevronRight } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { CalculatorShell } from "@/components/calculators/CalculatorShell";
import { CollapsibleSection } from "@/components/article/CollapsibleSection";
import { getCalculator, CALCULATORS } from "@/data/calculators";

export default function ToolDetail() {
  const { slug } = useParams<{ slug: string }>();
  const calc = slug ? getCalculator(slug) : undefined;

  if (!calc) return <Navigate to="/tools" replace />;

  const canonical = `/tools/${calc.slug}`;
  // Keep title under ~60 chars: keyword-first, year, brand.
  const title = `${calc.shortTitle} 2026 – калкулатор | Dogovori.net`;
  const desc = calc.seo.metaDescription;
  const pageUrl = `https://dogovori.net${canonical}`;

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "Инструменти", item: "https://dogovori.net/tools" },
      {
        "@type": "ListItem",
        position: 3,
        name: calc.shortTitle,
        item: `https://dogovori.net${canonical}`,
      },
    ],
  };

  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: calc.title,
    description: calc.description,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    url: pageUrl,
    inLanguage: "bg-BG",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: calc.seo.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Как да използвате ${calc.shortTitle}`,
    description: calc.seo.howItWorks,
    inLanguage: "bg-BG",
    totalTime: "PT1M",
    tool: [{ "@type": "HowToTool", name: calc.title }],
    step: [
      { "@type": "HowToStep", position: 1, name: "Въведете данните", text: `Попълнете полетата в ${calc.shortTitle} според вашия случай.` },
      { "@type": "HowToStep", position: 2, name: "Изчислете", text: "Резултатът се показва автоматично в EUR с подробна разбивка." },
      { "@type": "HowToStep", position: 3, name: "Проверете правното основание", text: `Основание: ${calc.legalBasis.map((l) => l.label).join(", ")}.` },
    ],
  };

  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: calc.title,
    description: desc,
    url: pageUrl,
    inLanguage: "bg-BG",
    isPartOf: { "@type": "WebSite", name: "Dogovori.net", url: "https://dogovori.net/" },
    primaryImageOfPage: undefined,
  };

  const related = CALCULATORS.filter((c) => c.slug !== calc.slug).slice(0, 4);

  return (
    <div className="min-h-dvh">
      <Seo
        title={title}
        description={desc}
        canonical={canonical}
        jsonLd={[webPageLd, breadcrumbsLd, appLd, howToLd, faqLd]}
      />
      <Header />

      <article className="container max-w-6xl pb-28 pt-10 md:pt-14 lg:pb-14">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/tools" className="hover:text-gold">Инструменти</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-foreground/70">{calc.shortTitle}</span>
        </nav>

        <header className="mb-8">
          <div className="eyebrow">Калкулатор</div>
          <h1 className="mt-2 font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl">
            {calc.shortTitle}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {calc.seo.intro}
          </p>
        </header>

        <CalculatorShell calculator={calc} />

        <div className="max-w-3xl">
          <CollapsibleSection heading="Как работи изчислението" preview={calc.seo.howItWorks}>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
              {calc.seo.howItWorks}
            </p>
          </CollapsibleSection>

          <CollapsibleSection heading="Често задавани въпроси" preview={`${calc.seo.faq.length} въпроса и отговора`}>
            <dl className="space-y-3 md:space-y-4">
              {calc.seo.faq.map((f) => (
                <div key={f.q} className="rounded-xl border border-border/60 bg-card/40 p-4 md:p-5">
                  <dt className="font-serif text-base font-bold text-foreground">{f.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleSection>
        </div>

        <section className="mt-14">
          <h2 className="mb-5 font-serif text-xl font-bold md:text-2xl">Свързани инструменти</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/tools/${r.slug}`}
                className="group rounded-lg border border-border/60 bg-card/40 p-4 transition-colors hover:border-gold/40"
              >
                <div className="text-xs font-semibold text-foreground group-hover:text-gold">
                  {r.shortTitle}
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {r.description}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </article>

      <SeoFooter />
    </div>
  );
}
