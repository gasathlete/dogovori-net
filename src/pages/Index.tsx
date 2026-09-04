import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { prefetchOnIdle, shouldPrefetch } from "@/lib/routePrefetch";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { PrimaryChoice } from "@/components/home/PrimaryChoice";

import { BackdropSection } from "@/components/SectionBackdrop";

import { FEATURED_BLANKS } from "@/data/featuredBlanks";
import { buildFaqJsonLd } from "@/data/faqItems";

// NOTE: `templateIndex` (and its transitive `CATALOG` JSON ~260KB) is loaded
// lazily inside the JSON-LD effect below — keeping it out of the landing
// entry chunk.
// Класическа подредба: всяка секция е винаги видима, но се монтира лениво
// при скрол, за да остане входният chunk малък.
const PlatformCapabilities = lazy(() => import("@/components/PlatformCapabilities").then((m) => ({ default: m.PlatformCapabilities })));
const BrandedDocumentShowcase = lazy(() => import("@/components/home/BrandedDocumentShowcase").then((m) => ({ default: m.BrandedDocumentShowcase })));
const DogovaryAIShowcase = lazy(() => import("@/components/home/DogovaryAIShowcase").then((m) => ({ default: m.DogovaryAIShowcase })));
const SocialProofStrip = lazy(() => import("@/components/SocialProofStrip").then((m) => ({ default: m.SocialProofStrip })));
const PainSolution = lazy(() => import("@/components/PainSolution").then((m) => ({ default: m.PainSolution })));
const FeaturedBlanks = lazy(() => import("@/components/FeaturedBlanks").then((m) => ({ default: m.FeaturedBlanks })));
const LifeScenarios = lazy(() => import("@/components/LifeScenarios").then((m) => ({ default: m.LifeScenarios })));
const ComparisonTable = lazy(() => import("@/components/ComparisonTable").then((m) => ({ default: m.ComparisonTable })));

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
  // Only /catalog (43KB) — /build pulls the export + template chunks (~500KB)
  // and it was the single biggest cause of a sluggish landing page.
  useEffect(() => prefetchOnIdle(["/catalog"]), []);

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
    if (!shouldPrefetch()) return;
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

        {/* Social proof веднага под херото — зарежда се веднага, без lazy gate */}
        <Suspense fallback={<SectionSkeleton />}>
          <SocialProofStrip />
        </Suspense>

        <BackdropSection variant="rings">
          <PrimaryChoice />
        </BackdropSection>

        <LazyOnVisible minHeight={420}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="papers" align="bottom">
              <FeaturedBlanks />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={420}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="grid" align="top">
              <PlatformCapabilities />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        {/* DogovaryAI — премиум асистент, веднага след функциите (03) */}
        <LazyOnVisible minHeight={520}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="rings" align="center">
              <DogovaryAIShowcase />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>


        {/* Персонално брандиране — веднага под функциите на приложението */}
        <LazyOnVisible minHeight={520}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="dots" align="center">
              <BrandedDocumentShowcase />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        {/* Готови комплекти */}
        <LazyOnVisible minHeight={480}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="rings">
              <LifeScenarios />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={420}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="dots">
              <Testimonials />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={480}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="rings">
              <PainSolution />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={420}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="grid" align="center">
              <ComparisonTable />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={420}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="shield" intensity="medium">
              <ComplianceSection />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={480}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="dots">
              <FAQ />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <LazyOnVisible minHeight={300}>
          <Suspense fallback={<SectionSkeleton />}>
            <BackdropSection variant="flow" align="center">
              <CTABand />
            </BackdropSection>
          </Suspense>
        </LazyOnVisible>

        <SeoFooter />
      </main>
    </div>
  );
};

export default Index;
