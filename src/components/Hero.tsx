import { ShieldCheck, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImg from "@/assets/logo-dogovori.png";

export function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-90" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(43 55% 54%) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <img
          src={logoImg}
          alt=""
          className="h-[85%] max-h-[720px] w-auto opacity-[0.08] mix-blend-screen md:opacity-[0.10]"
        />
      </div>
      <div className="container relative py-6 sm:py-8 md:py-14 lg:py-16">
        <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
          <div className="mb-3 sm:mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gold sm:text-xs sm:tracking-[0.2em]">
            <Sparkles className="h-3.5 w-3.5" />
            БЕЗПЛАТЕН ЮРИДИЧЕСКИ ПОМОЩНИК
          </div>
          <h1 className="font-serif text-[26px] font-bold leading-[1.15] sm:text-4xl md:text-5xl lg:text-6xl">
            Договори, които{" "}
            <span className="gold-gradient-text">следват и търсят</span>{" "}
             Вашите интереси
          </h1>
          <p className="mx-auto mt-3 sm:mt-4 max-w-2xl text-sm leading-snug text-muted-foreground sm:text-base sm:leading-normal md:text-lg">
            Освен шаблони, сайтът предлага стратегически въпроси, които да напътсват Вашата сделка. Dogovori.net изгражда индивидуални договори, съобразени със ЗЗД, ТЗ и ЗУТ, придружени от пълен правен риск-анализ.
          </p>
          <div className="mt-5 sm:mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3">
            <Button
              size="lg"
              onClick={onStart}
              className="bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)] transition-all"
            >
              НАМЕРИ ДОГОВОР 
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-gold/40 bg-transparent text-foreground hover:bg-gold/10 hover:text-gold"
              asChild
            >
              <a href="#process">Как работи процесът</a>
            </Button>
          </div>

          <div className="mt-8 sm:mt-10 md:mt-12 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, label: "Правно съответствие", value: "ЗЗД · ТЗ · ЗУТ" },
              { icon: Sparkles, label: "Оценка на риска", value: "Преди създаване" },
              { icon: FileText, label: "Експорт", value: "PDF + DOCX" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border/60 bg-card/40 p-4 sm:p-5 text-left backdrop-blur-sm"
              >
                <item.icon className="mb-2 sm:mb-3 h-5 w-5 text-gold" />
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1 font-serif text-lg text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
