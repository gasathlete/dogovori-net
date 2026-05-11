import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SectorGrid } from "@/components/SectorGrid";
import { Process } from "@/components/Process";
import { TopDocuments } from "@/components/TopDocuments";
import { SeoFooter } from "@/components/SeoFooter";
import { PartnersBoard } from "@/components/PartnersBoard";
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
      <section id="compliance" className="container py-14 sm:py-16 md:py-24">
        <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-8 text-center shadow-elegant md:p-14">
          <div className="absolute inset-x-0 top-0 hairline-x" />
          <div className="eyebrow mb-4 justify-center">Съответствие</div>
          <h3 className="font-serif text-xl font-bold leading-tight text-balance sm:text-2xl md:text-[32px]">
            Закон за задълженията и договорите · Търговски закон · ЗУТ
          </h3>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground md:text-base">
            Всеки договор включва клаузи за частична недействителност, форсмажор и подсъдност (Софийски градски съд / Арбитраж при БТПП). В зависимост от казуса, препоръчваме окончателен преглед от лицензиран адвокат.
          </p>
        </div>
      </section>
      <PartnersBoard />
      <SeoFooter />
    </div>
  );
};

export default Index;
