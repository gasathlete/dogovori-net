import { ClipboardList, Brain, FileCheck2 } from "lucide-react";

export function Process() {
  const steps = [
    {
      icon: ClipboardList,
      n: "01",
      title: "Стратегическо интервю",
      text: "10–15 целенасочени въпроса с условна логика – AI задълбочава според Вашите отговори.",
    },
    {
      icon: Brain,
      n: "02",
      title: "Risk Analysis",
      text: "AI идентифицира слаби места и Ви предупреждава за реални правни рискове.",
    },
    {
      icon: FileCheck2,
      n: "03",
      title: "Генериран договор",
      text: "Пълен договор с номерирани клаузи, частична недействителност и подсъдност. Експорт PDF/DOCX.",
    },
  ];

  return (
    <section id="process" className="border-y border-border/60 bg-navy-light/30 py-20">
      <div className="container">
        <div className="mb-12 max-w-2xl">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-gold">02 · Процес</div>
          <h2 className="font-serif text-3xl font-bold md:text-4xl">Как работи</h2>
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
