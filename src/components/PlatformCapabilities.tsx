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
  { icon: Package, action: "kits", label: "Комплекти", desc: "Готови решения за чести казуси." },
];

export function PlatformCapabilities() {
  return (
    <section
      aria-labelledby="platform-capabilities-title"
      className="relative border-b border-border/50 bg-gradient-to-b from-background to-card/40 py-14 sm:py-20"
    >

      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold/80 sm:text-[11px]">
            Какво прави платформата
          </p>
          <h2
            id="platform-capabilities-title"
            className="mt-3 font-serif text-2xl font-bold leading-tight text-balance sm:text-[28px] md:text-3xl"
          >
            Шест инструмента, един работен процес
          </h2>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm text-muted-foreground sm:text-[15px]">
            От анализ и преговори до подпис — цялото пътуване на документа на едно място.
          </p>
        </div>

        <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const inner = (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold transition-colors group-hover:border-gold/60 group-hover:bg-gold/15">
                  <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
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
              "group flex h-full w-full items-start gap-3 rounded-xl border border-gold/15 bg-card/50 px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:bg-card/70 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60";

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
