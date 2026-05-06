import { ShieldCheck, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <div className="container relative py-20 md:py-32">
        <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-gold">
            <Sparkles className="h-3.5 w-3.5" />
            БЕЗПЛАТЕН ЮРИДИЧЕСКИ ПОМОЩНИК
          </div>
          <h1 className="font-serif text-4xl font-bold leading-tight md:text-6xl">
            Договори, които{" "}
            <span className="gold-gradient-text">следват и търсят</span>{" "}
             Вашите интереси
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
            Освен шаблони, сайтът предлага стратегически въпроси, които да напътсват Вашата сделка. Dogovori.net изгражда индивидуални договори, съобразени със ЗЗД, ТЗ и ЗУТ, придружени от пълен правен риск-анализ.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
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

          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, label: "Правно съответствие", value: "ЗЗД · ТЗ · ЗУТ" },
              { icon: Sparkles, label: "Оценка на риска", value: "Преди създаване" },
              { icon: FileText, label: "Експорт", value: "PDF + DOCX" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border/60 bg-card/40 p-5 text-left backdrop-blur-sm"
              >
                <item.icon className="mb-3 h-5 w-5 text-gold" />
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
