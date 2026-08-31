import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { prefetchOnIdle } from "@/lib/routePrefetch";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { PrimaryChoice } from "@/components/home/PrimaryChoice";
import { ExploreAccordion, ExploreSection } from "@/components/home/ExploreSection";
import { ProcessChips } from "@/components/home/ProcessChips";

import { FEATURED_BLANKS } from "@/data/featuredBlanks";
import { buildFaqJsonLd } from "@/data/faqItems";

// NOTE: `templateIndex` (and its transitive `CATALOG` JSON ~260KB) is loaded
// lazily inside the JSON-LD effect below — keeping it out of the landing
// entry chunk.

// Опростена структура (top → bottom):
//  Hero (кратко) → PrimaryChoice (3 пътя) → разгъващи се панели → CTABand → SeoFooter
// Всяка секция под сгъвката е скрита зад ExploreSection: човек отваря само
// това, което иска да види. Съдържанието остава в DOM-а за търсачките.
const PlatformCapabilities = lazy(() => import("@/components/PlatformCapabilities").then((m) => ({ default: m.PlatformCapabilities })));
const SocialProofStrip = lazy(() => import("@/components/SocialProofStrip").then((m) => ({ default: m.SocialProofStrip })));
const PainSolution = lazy(() => import("@/components/PainSolution").then((m) => ({ default: m.PainSolution })));
const FeaturedBlanks = lazy(() => import("@/components/FeaturedBlanks").then((m) => ({ default: m.FeaturedBlanks })));
const LifeScenarios = lazy(() => import("@/components/LifeScenarios").then((m) => ({ default: m.LifeScenarios })));
const PlatformShowcase = lazy(() => import("@/components/PlatformShowcase").then((m) => ({ default: m.PlatformShowcase })));
const ComparisonTable = lazy(() => import("@/components/ComparisonTable").then((m) => ({ default: m.ComparisonTable })));
const Process = lazy(() => import("@/components/Process").then((m) => ({ default: m.Process })));
const Testimonials = lazy(() => import("@/components/Testimonials").then((m) => ({ default: m.Testimonials })));
const FAQ = lazy(() => import("@/components/FAQ").then((m) => ({ default: m.FAQ })));
const ComplianceSection = lazy(() => import("@/components/ComplianceSection").then((m) => ({ default: m.ComplianceSection })));
const CTABand = lazy(() => import("@/components/CTABand").then((m) => ({ default: m.CTABand })));

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      import("@/lib/scrollToHash").then(({ scrollToHash }) => scrollToHash(id, { updateHash: false }));
    }
  }, [location]);

  // Warm the most likely next routes when the main thread is idle
  // (skipped on data-saver / slow connections).
  useEffect(() => prefetchOnIdle(["/build", "/catalog"]), []);

  // Bridge legacy event name to the global DogovAI bubble
  useEffect(() => {
    const onOpen = () => window.dispatchEvent(new CustomEvent("dogovai:open"));
    window.addEventListener("dogovori:open-assistant", onOpen as EventListener);
    return () => window.removeEventListener("dogovori:open-assistant", onOpen as EventListener);
  }, []);

  const startInterview = () => {
    navigate("/catalog");
  };

  // ItemList JSON-LD is built asynchronously after first paint so we never
  // ship the 260KB catalog JSON in the landing entry chunk.
  const [slugMap, setSlugMap] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const idle =
      (window as any).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 600));
    const handle = idle(async () => {
      const { allTemplates } = await import("@/lib/templateIndex");
      if (cancelled) return;
      setSlugMap(new Map(allTemplates().map((t) => [t.doc.name, t.slug])));
    }, { timeout: 4000 });
    return () => {
      cancelled = true;
      const cic = (window as any).cancelIdleCallback;
      if (cic) cic(handle);
      else clearTimeout(handle as any);
    };
  }, []);

  const jsonLd = useMemo(() => {
    const base: Record<string, unknown>[] = [buildFaqJsonLd()];
    if (!slugMap) return base;
    const items = FEATURED_BLANKS
      .map((b, i) => {
        const slug = slugMap.get(b.docName);
        if (!slug) return null;
        return {
          "@type": "ListItem",
          position: i + 1,
          name: b.shortLabel,
          url: `https://dogovori.net/shablon/${slug}`,
        };
      })
      .filter(Boolean);
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Избрани от Договори нет — Топ 5 най-търсени бланки",
      itemListElement: items,
    };
    return [itemList, ...base];
  }, [slugMap]);

  return (
    <div className="min-h-dvh">
      <Seo
        title="Dogovori.net – документи, бланки и образци на български"
        description="600+ безплатни образци – трудов договор, наем, граждански, NDA, пълномощно. Попълни онлайн, свали в PDF/DOCX, подпиши електронно."
        canonical="/"
        jsonLd={jsonLd}
      />
      <Header />
      <main className="route-fade">
        <Hero onStart={startInterview} />
        <PrimaryChoice />

        <LazyOnVisible minHeight={420}>
          <Suspense fallback={<SectionSkeleton />}>
            <Testimonials />
            <SocialProofStrip />
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={520}>
          <Suspense fallback={<SectionSkeleton />}>
            <div className="container flex flex-col gap-3 pb-14 [&_.section-number]:hidden">
              <div className="eyebrow mb-1 mt-2">
                <span className="section-index font-serif text-base font-normal tracking-normal text-gold/60">
                  03
                </span>
                <span className="h-px w-8 bg-gold/40" />
                Разгледай в детайли
              </div>
              <ExploreAccordion defaultOpenId="capabilities">
              <ExploreSection
                id="capabilities"
                number="04"
                title="Какво може платформата"
                summary="Шест инструмента, един работен процес — от преговор до подпис."
                highlights={["AI асистент","625 шаблона","Risk анализ","е-Подпис"]}
                cta="Разгледай инструментите"
              >
                <PlatformCapabilities />
              </ExploreSection>

              <ExploreSection
                id="value"
                number="05"
                title="За кого е и какво решава"
                summary="Фрийлансъри и малки фирми — реални казуси и рискове, които покриваме."
                highlights={["Неплатен аванс = 800 €","Устна уговорка = 0 защита"]}
                cta="Виж казусите"
              >
                <PainSolution />
                <LifeScenarios />
              </ExploreSection>

              <ExploreSection
                id="process"
                number="06"
                title="Как работи — 3 стъпки"
                summary="Избираш документ, отговаряш на въпроси, сваляш PDF или DOCX."
                highlights={["~2 минути","Без карта","PDF + DOCX"]}
                cta="Виж стъпките"
              >
                <ProcessChips className="px-4 pt-4 sm:px-5" />
                <Process />
                <PlatformShowcase />
              </ExploreSection>

              <ExploreSection
                id="templates"
                number="07"
                title="Популярни шаблони"
                summary="Най-търсените образци — трудов договор, наем, NDA, пълномощно."
                highlights={["Трудов договор","Наем","NDA","Пълномощно"]}
                cta="Отвори шаблоните"
              >
                <FeaturedBlanks />
              </ExploreSection>

              <ExploreSection
                id="comparison"
                number="08"
                title="Сравнение с адвокат и Word"
                summary="Колко време и пари спестяваш при всеки документ."
                highlights={["Адвокат от 150 €","Тук от 12.90 €/мес."]}
                cta="Виж сравнението"
              >
                <ComparisonTable />
              </ExploreSection>

              <ExploreSection
                id="compliance"
                number="09"
                title="Сигурност и съответствие"
                summary="GDPR, eIDAS, AI Act — как пазим данните и документите ти."
                highlights={["GDPR","eIDAS","AI Act","EU сървъри"]}
                cta="Виж защитата"
              >
                <ComplianceSection />
              </ExploreSection>

              <ExploreSection
                id="faq"
                number="10"
                title="Често задавани въпроси"
                summary="Цени, операции, правна стойност на документите, е-подпис."
                highlights={["Какво е операция?","Валиден ли е е-подписът?"]}
                cta="Виж отговорите"
              >
                <FAQ />
              </ExploreSection>
              </ExploreAccordion>
            </div>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={300}>
          <Suspense fallback={<SectionSkeleton />}>
            <CTABand />
          </Suspense>
        </LazyOnVisible>
        <SeoFooter />
      </main>
    </div>
  );
};

export default Index;
