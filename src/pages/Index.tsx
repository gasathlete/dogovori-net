import { lazy, Suspense, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SectorGrid } from "@/components/SectorGrid";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { Reveal } from "@/components/Reveal";
// BlogRotator пада в `LazyOnVisible` секцията по-долу — превърнат в lazy chunk
// за да не дърпа blogTopics + autoLinkBlog в entry bundle-а.
import { FEATURED_BLANKS } from "@/data/featuredBlanks";
import { allTemplates } from "@/lib/templateIndex";

// Pre-compute the doc-name -> slug lookup once at module load instead of on every
// Index render. ItemList JSON-LD below depends on this.
const SLUG_BY_NAME: Map<string, string> = new Map(
  allTemplates().map((t) => [t.doc.name, t.slug]),
);

// Below-the-fold sections — code-split + mounted on scroll.
// SeoFooter stays eager (internal links matter for crawling).
const FeaturedBlanks = lazy(() => import("@/components/FeaturedBlanks").then((m) => ({ default: m.FeaturedBlanks })));
const LifeScenarios = lazy(() => import("@/components/LifeScenarios").then((m) => ({ default: m.LifeScenarios })));
const PlatformShowcase = lazy(() => import("@/components/PlatformShowcase").then((m) => ({ default: m.PlatformShowcase })));
const TopDocuments = lazy(() => import("@/components/TopDocuments").then((m) => ({ default: m.TopDocuments })));
const Process = lazy(() => import("@/components/Process").then((m) => ({ default: m.Process })));
const PartnersBoard = lazy(() => import("@/components/PartnersBoard").then((m) => ({ default: m.PartnersBoard })));
const Testimonials = lazy(() => import("@/components/Testimonials").then((m) => ({ default: m.Testimonials })));
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
  // ItemList JSON-LD for "Избрани от Договори нет" — gives Google a rich-result
  // candidate on the homepage and concentrates internal link equity onto the
  // top 5 high-search blanks. Slugs are resolved from templateIndex so they
  // always match the real /shablon/:slug URLs.
  const featuredJsonLd = useMemo(() => {
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
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Избрани от Договори нет — Топ 5 най-търсени бланки",
      itemListElement: items,
    };
  }, []);


  return (
    <div className="min-h-screen">
      <Seo
        title="Dogovori.net – документи, бланки и образци на български"
        description="600+ безплатни образци – трудов договор, наем, граждански, NDA, пълномощно. Попълни онлайн, свали в PDF/DOCX, подпиши електронно."
        canonical="/"
        jsonLd={featuredJsonLd}
      />
      <Header />
      <main className="route-fade">
        <Hero onStart={startInterview} />
        <Suspense fallback={<SectionSkeleton />}>
          <LazyOnVisible minHeight={420}>
            <Reveal>
              <LifeScenarios />
            </Reveal>
          </LazyOnVisible>
          <Divider />
          <LazyOnVisible minHeight={560}>
            <Reveal>
              <PlatformShowcase />
            </Reveal>
          </LazyOnVisible>
          <Divider />
          <LazyOnVisible minHeight={420}>
            <Reveal>
              <FeaturedBlanks />
            </Reveal>
          </LazyOnVisible>
          <Divider />
          <LazyOnVisible minHeight={500}>
            <Reveal>
              <TopDocuments />
            </Reveal>
          </LazyOnVisible>
          <Divider />
          <LazyOnVisible minHeight={420}>
            <Reveal>
              <BlogRotator />
            </Reveal>
          </LazyOnVisible>
          <Divider />
          <Reveal>
            <SectorGrid onPick={(id) => navigate(`/sektor/${id}`)} />
          </Reveal>
          <Divider />
          <LazyOnVisible minHeight={400}>
            <Reveal>
              <Process />
            </Reveal>
          </LazyOnVisible>
          <Divider />
          <LazyOnVisible minHeight={400}>
            <Reveal>
              <PartnersBoard />
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
