import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SectorGrid } from "@/components/SectorGrid";
import { Process } from "@/components/Process";
import { TopDocuments } from "@/components/TopDocuments";
import { SeoFooter } from "@/components/SeoFooter";
import { PartnersBoard } from "@/components/PartnersBoard";
import { ComplianceSection } from "@/components/ComplianceSection";
import { Seo } from "@/components/Seo";

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
      <TopDocuments />
      <Process />
      <PartnersBoard />
      <ComplianceSection />
      <SeoFooter />
    </div>
  );
};

export default Index;
