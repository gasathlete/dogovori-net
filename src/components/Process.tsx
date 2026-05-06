import { ClipboardList, Brain, FileCheck2 } from "lucide-react";

export function Process() {
  const steps = [
    {
      icon: ClipboardList,
      n: "01",
      title: "Стратегическо интервю",
      text: "Пълен договор с номерирани клаузи, форматиран и издържан, структурно и визуално. Експорт PDF/DOCX.",
    },
    {
      icon: Brain,
      n: "02",
      title: "Анализ на риска",
      text: "Системата идентифицира слаби места и Ви предупреждава за реални правни рискове.",
    },
    {
      icon: FileCheck2,
      n: "03",
      title: "Готов договор",
      text: "Пълен договор с номерирани клаузи, частична недействителност и подсъдност. Експорт PDF/DOCX.",
    },
  ];

  return (
    <section id="process" className="border-y border-border/60 bg-navy-light/30 py-8 sm:py-10 md:py-14">
      <div className="container">
        <div className="mb-6 sm:mb-8 md:mb-10 max-w-2xl">
          <div className="mb-2 sm:mb-3 text-xs uppercase tracking-[0.2em] text-gold">02 · Процес</div>
          <h2 className="font-serif text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">Как работи ?</h2>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="bg-card p-8">
              <div className="mb-4 flex items-center gap-4">
                <span className="font-serif text-3xl font-bold text-gold/40">{s.n}</span>
                <s.icon className="h-5 w-5 text-gold" />
              </div>
              <h3 className="font-serif text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
