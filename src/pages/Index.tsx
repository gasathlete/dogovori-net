import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SectorGrid } from "@/components/SectorGrid";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { Reveal } from "@/components/Reveal";

// Below-the-fold sections — code-split + mounted on scroll.
// SeoFooter stays eager (internal links matter for crawling).
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
  return (
    <div className="min-h-screen">
      <Seo
        title="Договори, образци и бланки на български — Dogovori.net"
        description="290+ безплатни образци на договори и правни бланки на български – трудови, наем, NDA, GDPR, IT. Готови за попълване, PDF/DOCX експорт и електронен подпис."
        canonical="/"
      />
      <Header />
      <main className="route-fade">
        <Hero onStart={startInterview} />
        <Reveal>
          <SectorGrid onPick={(id) => navigate(`/sektor/${id}`)} />
        </Reveal>
        <Divider />
        <Suspense fallback={<SectionSkeleton />}>
          <LazyOnVisible minHeight={500}>
            <Reveal>
              <TopDocuments />
            </Reveal>
          </LazyOnVisible>
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
              <ComplianceSection />
            </Reveal>
          </LazyOnVisible>
        </Suspense>
        <SeoFooter />
      </main>
    </div>
  );
};

export default Index;
