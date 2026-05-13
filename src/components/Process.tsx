import { ListChecks, ClipboardList, ShieldCheck, FileCheck2, FolderArchive, Send } from "lucide-react";

export function Process() {
  const steps = [
    {
      icon: ListChecks,
      n: "01",
      title: "Готов документ",
      text: "Разгледайте каталога и изберете подходящия за Вашия казус договор от над 20 правни сектора.",
    },
    {
      icon: ClipboardList,
      n: "02",
      title: "Стратегическо интервю",
      text: "Отговорете на индивидуален въпросник, изграден от експертите ни за конкретния тип договор.",
    },
    {
      icon: ShieldCheck,
      n: "03",
      title: "Анализ на риска и корекции",
      text: "Системата идентифицира слаби места и предлага автоматични корекции на проблемните клаузи.",
    },
    {
      icon: FileCheck2,
      n: "04",
      title: "Готов договор",
      text: "Организирайте цялата си документация на едно място — с тагове, версии и бърз достъп до всеки договор в Профил.",
    },
    {
      icon: FolderArchive,
      n: "05",
      title: "Съхраняване и подреждане",
      text: "Организирайте цялата си документация на едно място — с тагове, версии и бърз достъп до всеки договор.",
    },
    {
      icon: Send,
      n: "06",
      title: "Подписване и изпращане",
      text: "Подпишете електронно и изпратете готовия професионален документ директно до отсрещната страна.",
    },
  ];

  return (
    <section id="process" className="relative border-y border-border/60 bg-navy-light/25 py-14 sm:py-16 md:py-24">
      <div className="absolute inset-x-0 top-0 hairline-x opacity-50" />
      <div className="container">
        <div className="mb-10 max-w-2xl md:mb-14">
          <div className="eyebrow mb-3">
            <span className="font-serif text-base font-normal tracking-normal text-gold/60">02</span>
            <span className="h-px w-6 bg-gold/40" />
            Процес
          </div>
          <h2 className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[44px]">
            ​Функции
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="group relative flex flex-col bg-card/80 p-7 transition-colors duration-200 hover:bg-card sm:p-8"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="font-serif text-2xl font-bold text-gold/35 transition-colors duration-200 group-hover:text-gold/60">{s.n}</span>
                <s.icon className="h-5 w-5 text-gold" strokeWidth={1.6} />
              </div>
              <h3 className="font-serif text-lg font-bold leading-snug text-foreground sm:text-xl">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
