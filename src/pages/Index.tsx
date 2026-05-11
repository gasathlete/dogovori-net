import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SectorGrid } from "@/components/SectorGrid";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LazyOnVisible } from "@/components/LazyOnVisible";

// Below-the-fold sections — code-split + mounted on scroll.
// SeoFooter stays eager (internal links matter for crawling).
const TopDocuments = lazy(() => import("@/components/TopDocuments").then((m) => ({ default: m.TopDocuments })));
const Process = lazy(() => import("@/components/Process").then((m) => ({ default: m.Process })));
const PartnersBoard = lazy(() => import("@/components/PartnersBoard").then((m) => ({ default: m.PartnersBoard })));
const ComplianceSection = lazy(() => import("@/components/ComplianceSection").then((m) => ({ default: m.ComplianceSection })));

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 80);
    }
  }, [location]);

  const startInterview = () => {
    navigate("/catalog");
  };
  return (
    <div className="min-h-screen">
      <Seo
        title="Договори онлайн на български — Dogovori.net"
        description="Над 290 професионални договора и правни бланки на български с AI асистент. Електронен подпис, PDF и DOCX експорт. Безплатно за първия документ."
        canonical="/"
      />
      <Header />
      <Hero onStart={startInterview} />
      <SectorGrid onPick={(id) => navigate(`/wizard/${id}`)} />
      <Suspense fallback={null}>
        <LazyOnVisible minHeight={500}>
          <TopDocuments />
        </LazyOnVisible>
        <LazyOnVisible minHeight={400}>
          <Process />
        </LazyOnVisible>
        <LazyOnVisible minHeight={400}>
          <PartnersBoard />
        </LazyOnVisible>
        <LazyOnVisible minHeight={400}>
          <ComplianceSection />
        </LazyOnVisible>
      </Suspense>
      <SeoFooter />
    </div>
  );
};

export default Index;
