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
} from "lucide-react";

const ANALYSIS_STEPS = [
  {
    title: "1. Структурно разпознаване",
    body:
      "Качените PDF/DOCX се преобразуват в текст и AI моделът разпознава типа на документа (трудов, наем, услуга, NDA, дистрибуторски и др.) и страните по него.",
  },
  {
    title: "2. Извличане на клаузи",
    body:
      "Системата сегментира договора по клаузи (предмет, цена, срок, отговорност, прекратяване, юрисдикция) и ги нормализира за съпоставка със стандартни шаблони.",
  },
  {
    title: "3. Риск-анализ спрямо БГ право",
    body:
      "Всяка клауза се сравнява с императивните разпоредби на ЗЗД, ТЗ, КТ и специалното законодателство. Маркират се липсващи задължителни елементи, неравноправни условия и потенциални нищожности.",
  },
  {
    title: "4. Конкретни корекции",
    body:
      "За всеки риск AI предлага конкретна редакция — нов или преформулиран текст на клаузата — с обяснение защо подобрението е необходимо.",
  },
  {
    title: "5. Експорт и e-подпис",
    body:
      "Финалният документ се експортира като PDF и DOCX (с проследени промени) и може да бъде подписан електронно с КЕП или електронен подпис в платформата.",
  },
];

const CAPABILITIES = [
  { icon: FileSearch, title: "Над 600 шаблона", body: "Български договори по ЗЗД, ТЗ, КТ и специални закони." },
  { icon: ShieldCheck, title: "Риск-скор 1–10", body: "Числов индикатор за вероятност от спор или нищожност." },
  { icon: Scale, title: "Препратки към закон", body: "Всяка препоръка е обвързана с конкретен член/алинея." },
  { icon: GitCompareArrows, title: "Сравнение версии", body: "Show diff между оригинала и AI-редактирания вариант." },
  { icon: Languages, title: "Двуезични договори", body: "BG/EN паралелен експорт за чуждестранни контрагенти." },
  { icon: Lock, title: "Поверителност", body: "Документите не се ползват за обучение на модела." },
];

const FAQS = [
  {
    q: "Какво точно прави AI анализът на договори в Dogovori.net?",
    a: "Платформата качва качения от вас договор (PDF или DOCX), разпознава типа му, извлича всички клаузи и ги сравнява спрямо изискванията на българското право — ЗЗД, ТЗ, КТ и съответните специални закони. За всеки идентифициран риск връща обяснение и конкретна редакция на клаузата.",
  },
  {
    q: "На колко езика работи AI асистентът?",
    a: "Първичният език е български. Системата поддържа и двуезични договори (български + английски) за работа с чуждестранни контрагенти, с автоматично синхронизиране на двата варианта.",
  },
  {
    q: "Какви типове договори анализира?",
    a: "Над 600 шаблона: трудови договори (чл. 67 КТ), договори за наем на жилище и търговски обект, граждански договори за услуги и изработка, NDA, дистрибуторски, франчайзинг, заем, дарение, цесия, договори по ЗОП, ЗУТ и др.",
  },
  {
    q: "Колко струва AI анализът?",
    a: "Pro план: 9.90 €/месец, включва 100 операции. Team план: 7.90 €/seat/месец (минимум 3 места). Еднократен пакет: 1.90 € за 5 операции. Цените са с включен 20% ДДС. Една операция = един downloaded договор или анализ.",
  },
  {
    q: "Заместват ли AI препоръките правен консулт?",
    a: "Не. AI анализът е инструмент за подкрепа на решенията — той маркира рискове и предлага корекции, но окончателната правна преценка трябва да бъде направена от квалифициран юрист. Платформата изрично извежда дисклеймър при всеки експорт.",
  },
  {
    q: "Качените от мен документи използват ли се за обучение?",
    a: "Не. Документите, които потребителите качват за анализ, не се ползват за обучение или подобряване на модела. Те се съхраняват временно и могат да бъдат изтрити по всяко време от профила на потребителя.",
  },
  {
    q: "Кои AI модели стоят зад анализа?",
    a: "Платформата ползва съчетание от Gemini и собствена prompt пайплайн, специализирана за българското договорно право, плюс експертно курирани шаблони от юристи.",
  },
];

export default function AIFeaturesPage() {
  const canonical = "/ai";
  const title = "AI правен анализ на договори — как работи | Dogovori.net";
  const description =
    "Как AI системата на Dogovori.net анализира български договори: извличане на клаузи, проверка по ЗЗД/ТЗ/КТ, конкретни корекции и експорт в PDF/DOCX. Над 600 шаблона.";

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  // Detailed SoftwareApplication schema specifically describing the AI module.
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dogovori.net AI Contract Analysis",
    url: "https://dogovori.net/ai",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "LegalTech / Contract Lifecycle Management",
    operatingSystem: "Web",
    inLanguage: ["bg-BG", "en"],
    description:
      "AI-powered legal contract analysis for Bulgarian law (ЗЗД, ТЗ, КТ). Extracts clauses, scores risk on a 1–10 scale, suggests concrete redlines and exports to PDF/DOCX with e-signature support.",
    featureList: [
      "600+ Bulgarian contract templates",
      "Clause extraction and segmentation",
      "Risk scoring vs Bulgarian statutory law (ЗЗД / ТЗ / КТ)",
      "Concrete redline suggestions per clause",
      "Bilingual (BG/EN) parallel export",
      "PDF + DOCX export with tracked changes",
      "Electronic signature (КЕП and platform-native)",
      "GDPR-compliant; uploaded documents not used for model training",
    ],
    offers: [
      { "@type": "Offer", name: "Pro", price: "9.90", priceCurrency: "EUR", description: "100 operations/month" },
      { "@type": "Offer", name: "Team (per seat)", price: "7.90", priceCurrency: "EUR", description: "Min 3 seats, 100 operations/seat/month" },
      { "@type": "Offer", name: "Pay-as-you-go", price: "1.90", priceCurrency: "EUR", description: "5 operations" },
    ],
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", ratingCount: "127" },
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Как работи AI анализът на договори",
    inLanguage: "bg-BG",
    totalTime: "PT2M",
    step: ANALYSIS_STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title.replace(/^\d+\.\s*/, ""),
      text: s.body,
    })),
  };

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "AI правен анализ", item: "https://dogovori.net/ai" },
    ],
  };

  return (
    <div className="min-h-screen">
      <Seo
        title={title}
        description={description}
        canonical={canonical}
        jsonLd={[softwareLd, faqLd, howToLd, breadcrumbsLd]}
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
            Платформата комбинира над 600 правно курирани шаблона с AI пайплайн, обучен за
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
              <CheckCircle2 className="h-5 w-5 text-gold" /> Какво AI може
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
            Качете съществуващ договор за проверка или изгответе нов от 600+ шаблона.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/build" className="btn-gold">
              Изготви договор с AI <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/catalog" className="btn-ghost-gold">Разгледай каталога</Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
