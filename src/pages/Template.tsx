import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, CheckCircle2, AlertTriangle, FileText, ChevronRight, Download, Package } from "lucide-react";
import { AddToKitDialog } from "@/components/AddToKitDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { getRelatedTemplates, getTemplateBySlug } from "@/lib/templateIndex";
import { TEMPLATE_CONTENT_META } from "@/data/templateContentMeta";
import { loadTemplateContent } from "@/data/templateContent";
import { loadTemplateDraft } from "@/data/templateDrafts";
import type { TemplateContent } from "@/data/templateContentTypes";
import { trackEvent } from "@/lib/analytics";
import { autoLinkParagraph, createAutoLinkState } from "@/lib/autoLinkBlog";
import { RELATED_TEMPLATES } from "@/data/relatedTemplates";
import { getPostBySlug } from "@/lib/blog";
import { useRequireAuth } from "@/hooks/useRequireAuth";


export default function TemplatePage() {
  const { slug } = useParams<{ slug: string }>();
  const entry = useMemo(() => (slug ? getTemplateBySlug(slug) : undefined), [slug]);

  // Async-load the heavy AI content for this template only.
  const [aiContent, setAiContent] = useState<TemplateContent | undefined>(undefined);
  const [draftText, setDraftText] = useState<string | undefined>(undefined);
  const [kitOpen, setKitOpen] = useState(false);
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  useEffect(() => {
    let alive = true;
    if (!entry) return;
    setAiContent(undefined);
    setDraftText(undefined);
    const p = loadTemplateContent(entry.slug);
    if (p) p.then((c) => alive && setAiContent(c)).catch(() => {});
    const d = loadTemplateDraft(entry.slug);
    if (d) d.then((t) => alive && setDraftText(t)).catch(() => {});
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

  const wizardHref = doc.bilingual
    ? `/wizard-bilingual/${category.sectorId}?doc=${encodeURIComponent(doc.name)}`
    : `/wizard/${category.sectorId}?doc=${encodeURIComponent(doc.name)}`;
  const blankWizardHref = doc.bilingual
    ? wizardHref
    : `${wizardHref}&blank=1&returnTo=${encodeURIComponent(`/shablon/${entry.slug}`)}`;
  const canonical = `/shablon/${entry.slug}`;
  const pageTitle = `${doc.name} — образец на български`;
  const pageDesc = meta?.introExcerpt
    ? `${meta.introExcerpt.slice(0, 110)} Безплатен образец на ${doc.name.toLowerCase()} – PDF/DOCX, по ЗЗД и ТЗ.`.slice(0, 160)
    : `Безплатен образец на ${doc.name.toLowerCase()} на български – готов шаблон по ЗЗД, ТЗ и КТ. Попълни и изтегли PDF или DOCX за 2 минути.`.slice(0, 160);

  // Use AI-generated rich content when loaded; show generic fallback meanwhile (zero CLS — same DOM).
  const intro = aiContent?.intro ?? meta?.introExcerpt;

  const docLower = doc.name.toLowerCase();
  const isEmployment = /трудов|служител|работодател|кт\b/.test(docLower) || category.id === "employment";
  const isNotary = /нотариал|пълномощно|декларац|покан/.test(docLower);
  const isFinance = /заем|кредит|погасит|лихв|финанс/.test(docLower) || category.id === "finance";

  const usageCases = aiContent?.usageCases ?? [
    `Когато страните по ${docLower} желаят писмено уреждане на отношенията си съгласно българското право.`,
    `При необходимост от доказване пред съд, нотариус, НАП, Инспекцията по труда или други институции.`,
    `Преди започване на работа, доставка, услуга или сделка, за да се избегнат бъдещи спорове.`,
    `За уреждане на правата и задълженията на двете страни в случай на промяна в обстоятелствата.`,
    `Когато е необходимо обезпечаване на парични или непарични задължения с ясно дефинирани санкции.`,
    isEmployment
      ? `За регистрация в НАП по чл. 62, ал. 3 КТ и официално възникване на трудовото правоотношение.`
      : `Като част от пакет документи при сключване на по-голяма сделка или комплексна транзакция.`,
  ];

  const requirements = aiContent?.requirements ?? [
    "Пълни данни на страните – имена/наименование, ЕГН/ЕИК, постоянен адрес/седалище, представител по закон.",
    `Ясен и конкретен предмет на ${docLower} – без двусмислици и общи формулировки.`,
    isFinance
      ? "Размер на главницата, лихвен процент, погасителен план и обезпечение (ако е приложимо)."
      : "Цена/възнаграждение, валута (€), срок и начин на плащане (банков превод/каса).",
    "Срок на действие, начало на изпълнението и условия за продължаване/прекратяване.",
    "Права и задължения на двете страни, отговорност за неизпълнение и неустойки.",
    "Клауза за решаване на спорове, приложимо право и подсъдност.",
    "Дата и място на сключване, саморъчни подписи на страните (или КЕП).",
  ];

  const mistakes = aiContent?.mistakes ?? [
    "Липсващи или неточни идентификационни данни – грешен ЕГН/ЕИК, остарял адрес, неактуален представител.",
    `Неясен предмет на ${docLower}, който води до спорове при тълкуване и изпълнение.`,
    "Пропуснат срок, начин на плащане или валута – особено при сделки в чужбина.",
    "Липса на клауза за неустойка или непропорционално висока неустойка, която съдът може да намали.",
    "Пропускане на задължителните законови реквизити (напр. чл. 66 КТ за трудов договор, чл. 240 ЗЗД за заем).",
    "Подписване без приемо-предавателен протокол при предаване на вещи, обекти или работа.",
    "Липса на ясна процедура за изменение и допълнение на договора (анекс в писмена форма).",
  ];

  const faq = aiContent?.faq ?? [
    {
      q: `Задължително ли е ${docLower} да бъде в писмена форма?`,
      a: isEmployment
        ? "Да. Съгласно чл. 62, ал. 1 КТ трудовият договор се сключва задължително в писмена форма; неспазването прави договора недействителен."
        : "По принцип ЗЗД допуска и устни договори, но писменият договор е силно препоръчителен за доказване и защита на правата на страните. За някои сделки (недвижими имоти, дарения) писмената или нотариалната форма е задължителна.",
    },
    {
      q: "Има ли нужда от нотариална заверка?",
      a: isNotary
        ? "Да, нотариалната заверка/връчване е задължителен елемент от валидността и доказателствената сила на този документ."
        : "За повечето договори не е задължителна. Тя става задължителна при договори за недвижими имоти, дарения на имоти, някои корпоративни сделки и при изрични законови изисквания.",
    },
    {
      q: `Колко струва изготвянето на ${docLower} в Dogovori.net?`,
      a: "Безплатно: 5 операции при регистрация + 2/месец и 1 безплатна авто-корекция. Професионалист (12.90 €/мес, 50 операции) добавя двуезични договори (BG/EN), пълни AI-корекции, пълен risk report, неограничени комплекти и сваляне без воден знак. Предприемач (19.90 €/мес, 100 операции) добавя GPT-5 и премиум 24/7 поддръжка.",
    },
    {
      q: "Мога ли да го редактирам след генериране?",
      a: "Да. Експортираме документа в DOCX (Word) формат, който можете да редактирате допълнително преди подпис. Платените планове позволяват и редакция директно в платформата.",
    },
    {
      q: "Документът съобразен ли е с актуалното българско законодателство?",
      a: "Да. Шаблоните се поддържат актуални съгласно ЗЗД, ТЗ, КТ и съответните специални закони. ИИ моделът проверява за липсващи задължителни реквизити и потенциални рискове.",
    },
    {
      q: "Какво се случва, ако другата страна откаже да подпише?",
      a: "Документът има стойност на проект до момента на подписване. Препоръчваме изпращане чрез препоръчано писмо с обратна разписка или нотариална покана при оспорване.",
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
      priceCurrency: "EUR",
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
    <div className="min-h-dvh">
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

        <header className="mb-10">
          <div className="mb-4 flex items-start justify-between gap-3 anim-rise" style={{ animationDelay: "0ms" }}>
            <div className="eyebrow">
              <FileText className="h-3 w-3" />
              {category.title}
            </div>
            <Link
              to={blankWizardHref}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 text-xs text-gold transition-colors hover:bg-gold/10"
            >
              <Download className="h-3 w-3" />
              Свали само бланка
            </Link>
          </div>
          <h1 className="font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl anim-rise" style={{ animationDelay: "80ms" }}>
            {doc.name}
            {doc.bilingual && (
              <span className="ml-3 inline-flex items-center gap-1 align-middle">
                <span className="rounded border border-gold/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">BG/EN</span>
                <span className="rounded bg-gradient-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy shadow-gold">ПЛАТЕН</span>
              </span>
            )}
          </h1>
          <p className="mt-5 text-balance text-base leading-relaxed text-muted-foreground md:text-lg anim-rise" style={{ animationDelay: "160ms" }}>{doc.purpose}</p>

          <div className="mt-7 flex flex-wrap gap-3 anim-rise" style={{ animationDelay: "240ms" }}>
            <Link to={wizardHref} className="btn-gold btn-sheen">
              Създай за 2 минути <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/catalog" className="btn-ghost-gold normal-case tracking-normal">
              Виж всички шаблони
            </Link>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground anim-rise" style={{ animationDelay: "320ms" }}>
            <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-gold" /> Съобразен със ЗЗД/ТЗ/КТ</li>
            <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-gold" /> PDF и DOCX експорт</li>
            <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-gold" /> Готов за 2 минути</li>
            <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-gold" /> Добавен в лична, защитена база данни</li>
          </ul>
        </header>


        {intro && (
          <div className="prose prose-invert mx-auto mb-10 max-w-prose text-base leading-[1.8] text-foreground/90">
            <p className="text-pretty">
              {autoLinkParagraph(intro, createAutoLinkState(3), entry.slug, 3)}
            </p>
          </div>
        )}

        {(() => {
          const rel = RELATED_TEMPLATES[entry.slug];
          if (!rel?.templates?.length) return null;
          return (
            <section className="mb-10 rounded-xl border border-gold/20 bg-gold/[0.03] p-6 md:p-7">
              <div className="eyebrow mb-3">Може да Ви потрябва още</div>
              <ul className="space-y-2 text-sm">
                {rel.templates.map((t) => (
                  <li key={t.slug} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    <Link to={`/shablon/${t.slug}`} className="text-foreground/90 transition-colors hover:text-gold">
                      {t.anchor}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        <section className="mb-12 rounded-xl surface-elevated p-6 md:p-7">
          <div className="eyebrow mb-3">Ключова клауза</div>
          <p className="font-serif text-lg italic leading-relaxed text-foreground md:text-xl">⚖ {doc.keyClause}</p>
        </section>

        {!draftText && (
          <Section title="Какво включва документът">
            <p className="mb-4 text-sm text-muted-foreground">
              След попълване на кратък въпросник ИИ генерира пълен документ, който типично съдържа следните раздели:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { t: "I. Страни по документа", d: "Пълни данни на физическите/юридическите лица, ЕГН/ЕИК, представители." },
                { t: "II. Предмет", d: `Конкретно описание на ${doc.name.toLowerCase()} и обхвата му.` },
                { t: "III. Цена/възнаграждение", d: "Стойност в €, начин и срок на плащане, ДДС режим." },
                { t: "IV. Срок и действие", d: "Начало, продължителност, условия за продължаване." },
                { t: "V. Права и задължения", d: "Задължения на двете страни, форсмажор, конфиденциалност." },
                { t: "VI. Прекратяване и неустойки", d: "Основания за прекратяване, размер на неустойки, обезщетения." },
              ].map((s) => (
                <div key={s.t} className="rounded-lg border border-border/50 bg-card/30 p-4">
                  <h3 className="font-serif text-sm font-bold text-foreground">{s.t}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.d}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link
                to={wizardHref}
                onClick={(e) => {
                  if (!requireAuth({ action: `Изготви „${doc.name}"`, redirect: wizardHref })) {
                    e.preventDefault();
                  }
                }}
                className="btn-gold btn-sheen"
              >
                Изготви документа сега <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (!requireAuth({ action: "Добави шаблона в комплект" })) return;
                  setKitOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold/20"
              >
                <Package className="h-4 w-4" /> Добави в профила
              </button>
            </div>
          </Section>
        )}



        {/* Готовият образец е скрит от потребителя — използва се само от системата при зареждане на работния документ след „Създай“. */}


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

        {(() => {
          const rel = RELATED_TEMPLATES[entry.slug];
          const posts = (rel?.blogPosts ?? [])
            .map((s) => getPostBySlug(s))
            .filter((p): p is NonNullable<ReturnType<typeof getPostBySlug>> => Boolean(p));
          if (posts.length === 0) return null;
          return (
            <Section title="Прочетете повече">
              <ul className="space-y-2 text-sm">
                {posts.map((p) => (
                  <li key={p.slug} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    <Link to={`/blog/${p.slug}`} className="text-foreground/90 transition-colors hover:text-gold">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })()}


        <section className="relative mt-14 overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-10 text-center shadow-elegant md:p-12">
          <div className="absolute inset-x-0 top-0 hairline-x" />
          <h2 className="font-serif text-2xl font-bold leading-tight text-balance md:text-[32px]">Готов ли сте да създадете {doc.name}?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground">
            Попълнете кратък въпросник и получете готов договор в PDF и DOCX формат, съобразен с българското право.
          </p>
          <Link to={wizardHref} className="btn-gold btn-sheen mt-7">
            Започни сега <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </article>

      <AddToKitDialog
        open={kitOpen}
        onClose={() => setKitOpen(false)}
        defaultKitTitle={doc.name}
        item={{ role: "primary", ref_label: doc.name, planned_doc_name: doc.name }}
      />

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
