import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SectorGrid } from "@/components/SectorGrid";
import { Process } from "@/components/Process";
import { TopDocuments } from "@/components/TopDocuments";
import { Footer } from "@/components/Footer";

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
    document.getElementById("sectors")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <div className="min-h-screen">
      <Header />
      <Hero onStart={startInterview} />
      <SectorGrid onPick={(id) => navigate(`/wizard/${id}`)} />
      <TopDocuments />
      <Process />
      <section id="compliance" className="container py-8 sm:py-10 md:py-14">
        <div className="rounded-2xl border border-gold/20 bg-gradient-card p-6 sm:p-8 md:p-10 text-center shadow-elegant">
          <div className="mb-2 sm:mb-3 text-xs uppercase tracking-[0.2em] text-gold">Съответствие</div>
          <h3 className="font-serif text-xl font-bold leading-tight sm:text-2xl md:text-3xl">
            Закон за задълженията и договорите · Търговски закон · ЗУТ
          </h3>
          <p className="mx-auto mt-2 sm:mt-3 max-w-2xl text-sm leading-snug text-muted-foreground">
            Всеки  договор включва клаузи за частична недействителност, форсмажор
            и подсъдност (Софийски градски съд / Арбитраж при БТПП). В зависимост от казуса, препоръчваме
            окончателен преглед от лицензиран адвокат.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Index;
