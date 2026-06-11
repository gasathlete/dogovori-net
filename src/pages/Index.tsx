import { lazy, Suspense, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { Reveal } from "@/components/Reveal";
import { FEATURED_BLANKS } from "@/data/featuredBlanks";
import { allTemplates } from "@/lib/templateIndex";
import { buildFaqJsonLd } from "@/data/faqItems";

const SLUG_BY_NAME: Map<string, string> = new Map(
  allTemplates().map((t) => [t.doc.name, t.slug]),
);

// Linear-style landing structure (top → bottom):
//  Hero → SocialProofStrip → PainSolution → PlatformShowcase → FeaturedBlanks
//  → LifeScenarios → ComparisonTable → Testimonials → Process → FAQ
//  → ComplianceSection → CTABand → SeoFooter
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

  const startInterview = () => {
    navigate("/catalog");
  };

  const jsonLd = useMemo(() => {
    const items = FEATURED_BLANKS
      .map((b, i) => {
        const slug = SLUG_BY_NAME.get(b.docName);
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
    return [itemList, buildFaqJsonLd()];
  }, []);

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
        <Suspense fallback={<SectionSkeleton />}>
          <LazyOnVisible minHeight={120}>
            <SocialProofStrip />
          </LazyOnVisible>

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
    </div>
  );
};

export default Index;
