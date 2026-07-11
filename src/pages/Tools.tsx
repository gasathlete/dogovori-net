import { Link } from "react-router-dom";
import * as Icons from "@/icons";
import { Calculator as CalcIcon, ArrowRight, ChevronRight, GitCompare, Wrench } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { CALCULATORS } from "@/data/calculators";

interface OtherTool {
  slug: string;
  to: string;
  icon: keyof typeof Icons;
  shortTitle: string;
  description: string;
  badge?: string;
}

const OTHER_TOOLS: OtherTool[] = [
  {
    slug: "sravni",
    to: "/sravni",
    icon: "GitCompare",
    shortTitle: "Сравни шаблони",
    description:
      "Сравни два договорни шаблона един до друг — клаузи, рискове, приложимост. Удобно за избор преди генериране.",
    badge: "Безплатно",
  },
];

export default function Tools() {
  const title = "Правни калкулатори и инструменти 2026 | Dogovori.net";
  const desc =
    "Безплатни правни калкулатори в EUR: обезщетения, лихва за забава, нотариални такси, ДДС, местни данъци, платен отпуск, предизвестие. Сравнение на договорни шаблони по българското право.";

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Правни инструменти",
    itemListElement: [
      ...CALCULATORS.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://dogovori.net/tools/${c.slug}`,
        name: c.shortTitle,
      })),
      ...OTHER_TOOLS.map((t, i) => ({
        "@type": "ListItem",
        position: CALCULATORS.length + i + 1,
        url: `https://dogovori.net${t.to}`,
        name: t.shortTitle,
      })),
    ],
  };
  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "Инструменти", item: "https://dogovori.net/tools" },
    ],
  };

  return (
    <div className="min-h-dvh">
      <Seo title={title} description={desc} canonical="/tools" jsonLd={[breadcrumbsLd, itemListLd]} />
      <Header />

      <article className="container max-w-6xl py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Инструменти</span>
        </nav>

        <header className="mb-12 flex items-start gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
            <Wrench className="h-6 w-6" strokeWidth={1.6} />
          </div>
          <div>
            <div className="eyebrow">
              <span className="font-serif text-sm font-normal tracking-normal text-gold/60">00</span>
              <span className="h-px w-5 bg-gold/40" />
              Инструменти
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl">
              Правни инструменти
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
              Безплатни онлайн инструменти за бързи изчисления и сравнения по българското законодателство — обезщетения, лихва за забава, нотариални такси, ДДС, местни данъци, сравнение на шаблони. Всички парични резултати са в EUR.
            </p>
          </div>
        </header>

        <section aria-labelledby="cat-calculators" className="mb-14">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-gold/[0.05] text-gold">
              <CalcIcon className="h-4 w-4" strokeWidth={1.7} />
            </div>
            <div>
              <h2 id="cat-calculators" className="font-serif text-xl font-bold leading-tight md:text-2xl">
                Калкулатори
              </h2>
              <p className="text-xs text-muted-foreground">
                {CALCULATORS.length} инструмента за изчисления
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {CALCULATORS.map((c) => {
              const Icon = (Icons as any)[c.icon] ?? CalcIcon;
              return (
                <Link
                  key={c.slug}
                  to={`/tools/${c.slug}`}
                  className="group relative overflow-hidden rounded-xl surface-elevated p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-200 group-hover:via-gold/70" />
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-gold/[0.05] text-gold">
                      <Icon className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-serif text-lg font-bold leading-snug text-foreground transition-colors group-hover:text-gold">
                        {c.shortTitle}
                      </h3>
                      <p className="mt-1 text-xs italic text-gold/80">
                        ⚖ {c.legalBasis.map((l) => l.label).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{c.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gold">
                    Отвори калкулатора <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="cat-other">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-gold/[0.05] text-gold">
              <GitCompare className="h-4 w-4" strokeWidth={1.7} />
            </div>
            <div>
              <h2 id="cat-other" className="font-serif text-xl font-bold leading-tight md:text-2xl">
                Други инструменти
              </h2>
              <p className="text-xs text-muted-foreground">
                {OTHER_TOOLS.length} {OTHER_TOOLS.length === 1 ? "инструмент" : "инструмента"} за сравнение и анализ
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {OTHER_TOOLS.map((t) => {
              const Icon = (Icons as any)[t.icon] ?? Wrench;
              return (
                <Link
                  key={t.slug}
                  to={t.to}
                  className="group relative overflow-hidden rounded-xl surface-elevated p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-200 group-hover:via-gold/70" />
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-gold/[0.05] text-gold">
                      <Icon className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif text-lg font-bold leading-snug text-foreground transition-colors group-hover:text-gold">
                          {t.shortTitle}
                        </h3>
                        {t.badge && (
                          <span className="rounded border border-gold/30 bg-gold/[0.08] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                            {t.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gold">
                    Отвори инструмента <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </article>

      <SeoFooter />
    </div>
  );
}
