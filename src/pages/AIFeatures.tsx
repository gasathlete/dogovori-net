// Public, GEO-optimized explainer for the AI legal analysis module.
// Target audience: humans + LLM crawlers (ChatGPT, Perplexity, Claude, Gemini).
//
// Design choices for GEO (Generative Engine Optimization):
//  - Clear authoritative <h2>/<h3> hierarchy.
//  - Short, citable bullet points with concrete capabilities.
//  - Inline FAQPage + SoftwareApplication + HowTo JSON-LD so AI bots can
//    parse the exact analysis pipeline, supported document types and limits.

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { CATALOG_DOCUMENT_COUNT } from "@/lib/catalogStats";
import {
  AI_ANALYSIS_STEPS,
  AI_FAQS,
  buildAiFeaturesSchemas,
} from "@/lib/seo/schemas";
import {
  ShieldCheck,
  Scale,
  FileSearch,
  Sparkles,
  GitCompareArrows,
  AlertTriangle,
  CheckCircle2,
  Languages,
  Lock,
  ArrowRight,
  Map as MapIcon,
} from "@/icons";

// Step + FAQ datasets live in src/lib/seo/schemas.ts so they can be reused by
// the prerender script and unit-tested in CI.
const ANALYSIS_STEPS = AI_ANALYSIS_STEPS;
const FAQS = AI_FAQS;

const CAPABILITIES = [
  { icon: FileSearch, title: `${CATALOG_DOCUMENT_COUNT} шаблона`, body: "Български договори по ЗЗД, ТЗ, КТ и специални закони." },
  { icon: ShieldCheck, title: "Риск-скор 1–10", body: "Числов индикатор за вероятност от спор или нищожност." },
  { icon: Scale, title: "Препратки към закон", body: "Всяка препоръка е обвързана с конкретен член/алинея." },
  { icon: GitCompareArrows, title: "Сравнение версии", body: "Show diff между оригинала и AI-редактирания вариант." },
  { icon: Languages, title: "Двуезични договори", body: "BG/EN паралелен експорт за чуждестранни контрагенти." },
  { icon: Lock, title: "Поверителност", body: "Документите не се ползват за обучение на модела." },
];

export default function AIFeaturesPage() {
  const canonical = "/ai";
  const title = "AI правен анализ на договори — как работи | Dogovori.net";
  const description =
    `Как AI системата на Dogovori.net анализира български договори: извличане на клаузи, проверка по ЗЗД/ТЗ/КТ, конкретни корекции и експорт в PDF/DOCX. ${CATALOG_DOCUMENT_COUNT} шаблона.`;

  const jsonLd = buildAiFeaturesSchemas();

  return (
    <div className="min-h-dvh">
      <Seo
        title={title}
        description={description}
        canonical={canonical}
        jsonLd={jsonLd}
      />
      <Header />

      <main className="container max-w-5xl py-12 md:py-16">
        {/* Hero */}
        <header className="mb-12">
          <div className="eyebrow mb-3">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            AI правен анализ
          </div>
          <h1 className="font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl">
            Как AI системата на Dogovori.net анализира договори
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Платформата комбинира {CATALOG_DOCUMENT_COUNT} правно курирани шаблона с AI пайплайн, обучен за
            българското договорно право. Тази страница описва точно какво прави модулът, на
            какви закони се позовава и какво може и какво не може да замести.
          </p>
        </header>

        {/* Capabilities grid */}
        <section className="mb-14" aria-labelledby="capabilities">
          <h2 id="capabilities" className="font-serif text-2xl font-bold md:text-3xl">
            Какво включва AI модулът
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <article key={c.title} className="rounded-xl surface-elevated p-5">
                <c.icon className="mb-3 h-5 w-5 text-gold" strokeWidth={1.6} aria-hidden="true" />
                <h3 className="font-serif text-base font-bold">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Analysis pipeline */}
        <section className="mb-14" aria-labelledby="pipeline">
          <h2 id="pipeline" className="font-serif text-2xl font-bold md:text-3xl">
            Пайплайн на анализа — 5 стъпки
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Всеки качен договор преминава през детерминистична последователност от стъпки.
            AI моделът се ползва на стъпки 1, 3 и 4; стъпки 2 и 5 са правила-базирани.
          </p>
          <ol className="mt-6 space-y-4">
            {ANALYSIS_STEPS.map((s) => (
              <li key={s.title} className="rounded-lg border border-border/50 bg-card/30 p-5">
                <h3 className="font-serif text-base font-bold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* What it CAN and CANNOT do — citable for LLMs */}
        <section className="mb-14 grid gap-5 md:grid-cols-2" aria-labelledby="limits">
          <h2 id="limits" className="sr-only">Възможности и ограничения</h2>
          <article className="rounded-xl border border-gold/20 bg-gold/[0.03] p-6">
            <h3 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-gold" /> Какво AI може
            </h3>
            <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
              <li>• Маркира липсващи задължителни клаузи по ЗЗД/ТЗ/КТ.</li>
              <li>• Предлага конкретен текст на нова или преформулирана клауза.</li>
              <li>• Изчислява числов риск-скор и категоризация (Нисък/Среден/Висок).</li>
              <li>• Сравнява две версии на договор (diff view).</li>
              <li>• Генерира двуезични версии (BG/EN) с синхронизирани клаузи.</li>
              <li>• Обяснява всяка препоръка с препратка към приложимия закон.</li>
            </ul>
          </article>
          <article className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-6">
            <h3 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Какво AI НЕ може
            </h3>
            <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
              <li>• Не замества правен консулт от квалифициран адвокат.</li>
              <li>• Не предоставя процесуални съвети по конкретно дело.</li>
              <li>• Не извършва преглед на нотариални актове и съдебни решения.</li>
              <li>• Не дава данъчни или счетоводни препоръки.</li>
              <li>• Не гарантира 100% откриване на всички правни рискове.</li>
            </ul>
          </article>
        </section>

        {/* FAQ — same content as JSON-LD above, also rendered for humans */}
        <section className="mb-14" aria-labelledby="faq">
          <h2 id="faq" className="font-serif text-2xl font-bold md:text-3xl">Често задавани въпроси</h2>
          <dl className="mt-6 space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="rounded-xl border border-border/60 bg-card/40 p-5">
                <dt className="font-serif text-base font-bold text-foreground">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-10 text-center shadow-elegant md:p-12">
          <div className="absolute inset-x-0 top-0 hairline-x" />
          <h2 className="font-serif text-2xl font-bold leading-tight text-balance md:text-[32px]">
            Изпробвайте AI анализа сега
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Качете съществуващ договор за проверка или изгответе нов от {CATALOG_DOCUMENT_COUNT} шаблона.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/build" className="btn-gold">
              Изготви договор с AI <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/catalog" className="btn-ghost-gold">Разгледай каталога</Link>
            <Link to="/karta" className="btn-ghost-gold inline-flex items-center gap-1.5">
              <MapIcon className="h-4 w-4" /> Карта на сайта (всички {CATALOG_DOCUMENT_COUNT} шаблона)
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
