import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { Reveal } from "@/components/Reveal";

import { FEATURED_BLANKS } from "@/data/featuredBlanks";
import { buildFaqJsonLd } from "@/data/faqItems";

// NOTE: `templateIndex` (and its transitive `CATALOG` JSON ~260KB) is loaded
// lazily inside the JSON-LD effect below — keeping it out of the landing
// entry chunk. The slug map is only needed to build the optional ItemList
// structured-data block, which doesn't have to render synchronously.

// Linear-style landing structure (top → bottom):
//  Hero → SocialProofStrip → PainSolution → PlatformShowcase → FeaturedBlanks
//  → LifeScenarios → ComparisonTable → Testimonials → Process → FAQ
//  → ComplianceSection → CTABand → SeoFooter
import { SocialProofStrip } from "@/components/SocialProofStrip";


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
// StickyScrollCta removed — DogovAIBubble is the single persistent floating helper on the landing.
const SocialProofToast = lazy(() => import("@/components/funnel/SocialProofToast").then((m) => ({ default: m.SocialProofToast })));

const Divider = () => (
  <div aria-hidden="true" className="container">
    <div className="section-divider" />
  </div>
);

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      import("@/lib/scrollToHash").then(({ scrollToHash }) => scrollToHash(id, { updateHash: false }));
    }
  }, [location]);

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
        <SocialProofStrip />
        <Suspense fallback={<SectionSkeleton />}>

          <LazyOnVisible minHeight={420}>
            <Reveal>
              <LifeScenarios />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={420}>
            <Reveal>
              <FeaturedBlanks />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={560}>
            <Reveal>
              <PlatformShowcase />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={400}>
            <Reveal>
              <Process />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={500}>
            <Reveal>
              <ComparisonTable />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={420}>
            <Reveal>
              <PainSolution />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={400}>
            <Reveal>
              <Testimonials />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={400}>
            <Reveal>
              <ComplianceSection />
            </Reveal>
          </LazyOnVisible>
          <Divider />





          <LazyOnVisible minHeight={500}>
            <Reveal>
              <FAQ />
            </Reveal>
          </LazyOnVisible>
          <Divider />

          <LazyOnVisible minHeight={300}>
            <Reveal>
              <CTABand />
            </Reveal>
          </LazyOnVisible>
        </Suspense>
        <SeoFooter />
      </main>
      <StickyScrollCta />
    </div>
  );
};

export default Index;
