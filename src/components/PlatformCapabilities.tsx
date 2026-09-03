import { Link } from "react-router-dom";
import { Bot, FileText, ShieldAlert, Languages, FileSignature, Package, ChevronRight } from "@/icons";
import { scrollToHash } from "@/lib/scrollToHash";

type Item = {
  icon: typeof Bot;
  label: string;
  desc: string;
  to?: string;
  action?: "assistant" | "kits";
};

const ITEMS: Item[] = [
  { icon: Bot, action: "assistant", label: "Правен AI-асистент", desc: "Преговаря най-добрите условия за Вас." },
  { icon: FileText, to: "/catalog", label: "Над 600 шаблона", desc: "Бизнес, имоти, труд, услуги." },
  { icon: ShieldAlert, to: "/demo/risk-analysis", label: "Анализ на документ", desc: "Открива клопки и неравноправни клаузи." },
  { icon: Languages, to: "/demo/bilingual", label: "Двуезични договори", desc: "Български, английски, немски, френски." },
  { icon: FileSignature, to: "/demo/e-signature", label: "Електронен подпис", desc: "Директно от dogovori.net." },
  { icon: Package, action: "kits", label: "Комплекти документи", desc: "Готови решения за чести казуси." },
];

export function PlatformCapabilities() {
  return (
    <section
      aria-labelledby="platform-capabilities-title"
      className="relative border-b border-border/50 bg-gradient-to-b from-background to-card/40 py-14 sm:py-20"
    >

      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold/80 sm:text-[11px]">
            <span className="section-number font-serif text-base font-normal tracking-normal text-gold/60">02</span>
            <span className="h-px w-5 bg-gold/40" />
            КАКВО ИМА В НАШАТА ПЛАТФОРМА ?
          </p>
          <h2
            id="platform-capabilities-title"
            className="mt-3 font-serif text-2xl font-bold leading-tight text-balance sm:text-[28px] md:text-3xl"
          >
            Шест инструмента, един работен процес
          </h2>
          <p className="mx-auto mt-3 max-w-[62ch] text-sm text-muted-foreground sm:text-[15px]">
            Един непрекъснат поток: питаш, избираш шаблон, проверяваш риска,
            превеждаш, подписваш и подреждаш в комплект — без да сменяш платформа.
          </p>
        </div>

        <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item, index) => {
            const Icon = item.icon;
            const inner = (
              <>
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-gradient-to-br from-gold/15 to-gold/[0.03] text-gold shadow-[inset_0_1px_0_hsl(var(--gold)/0.15)] transition-all group-hover:border-gold/60 group-hover:from-gold/25">
                  <Icon aria-hidden="true" className="h-[19px] w-[19px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 block font-serif text-[11px] tracking-[0.16em] text-gold/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[15px] font-semibold text-foreground">{item.label}</span>
                    <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gold/50 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                    {item.desc}
                  </span>
                </span>
              </>
            );
            const cls =
              "group relative flex h-full w-full items-start gap-3.5 overflow-hidden rounded-2xl border border-gold/15 bg-card/60 px-5 py-4 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-gold/45 hover:bg-card/80 hover:shadow-elegant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60";

            if (item.action) {
              const onClick = () => {
                if (item.action === "assistant") {
                  window.dispatchEvent(new CustomEvent("dogovori:open-assistant"));
                } else if (item.action === "kits") {
                  scrollToHash("scenarios");
                }
              };
              return (
                <li key={item.label}>
                  <button type="button" onClick={onClick} aria-label={`${item.label} — ${item.desc}`} className={cls}>
                    {inner}
                  </button>
                </li>
              );
            }
            return (
              <li key={item.label}>
                <Link to={item.to!} aria-label={`${item.label} — ${item.desc}`} className={cls}>
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="absolute inset-x-0 bottom-0 hairline-x opacity-70" />
    </section>
  );
}
