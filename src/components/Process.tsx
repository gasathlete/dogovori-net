import { ListChecks, ClipboardList, ShieldCheck, FileCheck2, FolderArchive, BookOpen } from "lucide-react";

export function Process() {
  const steps = [
    {
      icon: ListChecks,
      n: "01",
      title: "Намери или създай документ",
      text: "Разгледайте каталога с разнообразие от правни документи. Ако не намерите правилен, използвайте системата, за да създадете документ за >2 минути.",
    },
    {
      icon: ClipboardList,
      n: "02",
      title: "Стратегическо интервю",
      text: "Отговорете на индивидуален въпросник, изграден от експертите ни за конкретния тип договор/декларация.",
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
      title: "Готов документ",
      text: "Експортирайте професионално изготвения договор в PDF или DOCX, или го подпишете директно с електронен подпис.",
    },
    {
      icon: FolderArchive,
      n: "05",
      title: "Съхраняване и подреждане",
      text: "Организирайте цялата си документация на едно място — с тагове, версии и бърз достъп до всеки договор в Профил.",
    },
    {
      icon: BookOpen,
      n: "06",
      title: "Блог",
      text: "Разрастваща се мрежа от статии, засягащи най-актуалните теми за документи, коментари, въпроси и мнения.",
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
            Функции
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 md:grid-cols-4">
          {steps.slice(0, 4).map((s) => (
            <div
              key={s.n}
              className="group relative flex flex-col bg-card/80 p-6 transition-colors duration-200 hover:bg-card sm:p-7"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="font-serif text-2xl font-bold text-gold/35 transition-colors duration-200 group-hover:text-gold/60">{s.n}</span>
                <s.icon className="h-5 w-5 text-gold" strokeWidth={1.6} />
              </div>
              <h3 className="font-serif text-base font-bold leading-snug text-foreground sm:text-lg">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <span className="h-px flex-1 bg-hairline" />
          Допълнително
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2">
          {steps.slice(4).map((s) => (
            <div
              key={s.n}
              className="group relative flex flex-col bg-card/40 p-6 transition-colors duration-200 hover:bg-card/70 sm:p-7"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-serif text-xl font-bold text-gold/30 transition-colors duration-200 group-hover:text-gold/50">{s.n}</span>
                <s.icon className="h-4 w-4 text-gold/80" strokeWidth={1.6} />
              </div>
              <h3 className="font-serif text-base font-bold leading-snug text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
