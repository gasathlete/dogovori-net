/**
 * Кратък визуален път на документа за началната страница.
 *
 * Три компактни стъпки с една ясна следваща стъпка. Без дълги обяснения, без
 * измерени обещания и без второ доминиращо действие — водещото злато остава
 * само в hero-а.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { FileText, FilePen, Download, ArrowRight } from "@/icons";

const PATH_STEPS = [
  {
    n: "1",
    icon: FileText,
    title: "Избирате документ",
    line: "Шаблон от каталога или Ваш файл.",
  },
  {
    n: "2",
    icon: FilePen,
    title: "Попълвате данните",
    line: "Кратки въпроси, вижда се какво липсва.",
  },
  {
    n: "3",
    icon: Download,
    title: "Сваляте готовия файл",
    line: "DOCX и PDF, с историята на версиите.",
  },
] as const;

export function DocumentPathStrip() {
  return (
    <section
      aria-labelledby="document-path-title"
      data-testid="document-path-strip"
      className="container py-10 sm:py-14"
    >
      <h2
        id="document-path-title"
        className="text-center font-serif text-[22px] font-bold tracking-tight sm:text-2xl"
      >
        Пътят на един документ
      </h2>
      <p className="mx-auto mt-2 max-w-md text-center text-[15px] leading-relaxed text-muted-foreground sm:text-base">
        Три стъпки от избора до готовия файл.
      </p>

      <ol className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-3">
        {PATH_STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li
              key={step.n}
              className="relative rounded-xl border border-border/70 bg-card/50 p-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gold/30 bg-gold/[0.07] text-gold">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-serif text-[11px] font-bold tabular-nums text-muted-foreground">
                  {step.n}
                </span>
              </div>
              <h3 className="mt-3 text-[15px] font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                {step.line}
              </p>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 text-center">
        <Link
          to="/catalog"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-gold"
        >
          Разгледайте шаблоните
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

export default DocumentPathStrip;
