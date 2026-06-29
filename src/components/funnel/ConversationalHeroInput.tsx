/**
 * ConversationalHeroInput — anonymous Step-1 engagement hook.
 *
 * One field, three chips, one secondary action — designed to convert a
 * passive scroller into an *active* user within 3 seconds. Submitting goes
 * to /catalog?q=…, which is heavily SEO-indexed; chips pre-fill common
 * intents (Наем / Трудов / NDA) and ride straight into Step 2 of the funnel.
 *
 * The primary „Започни безплатно" CTA underneath the Hero still owns the
 * conversion-critical click — this widget is purely about engagement +
 * intent capture (which drives smarter retargeting in Step 4).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles } from "lucide-react";
import { trackFunnelEvent } from "@/lib/funnel";

const CHIPS: Array<{ q: string; label: string }> = [
  { q: "договор за наем", label: "Наем" },
  { q: "трудов договор", label: "Трудов" },
  { q: "nda конфиденциалност", label: "NDA" },
  { q: "пълномощно", label: "Пълномощно" },
];

export function ConversationalHeroInput() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const go = (term: string, source: "input" | "chip") => {
    const trimmed = term.trim();
    if (!trimmed) return;
    trackFunnelEvent("hero_query_submit", { source, q: trimmed });
    navigate(`/catalog?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="mx-auto mt-3 w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q, "input");
        }}
        className="group relative flex items-center gap-2 rounded-full border border-gold/40 bg-card/70 px-3 py-2 shadow-soft backdrop-blur-md focus-within:border-gold focus-within:shadow-gold"
      >
        <Search className="ml-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        <input
          type="text"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Какъв документ ти трябва?"
          aria-label="Какъв документ ти трябва?"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold px-3 py-1.5 text-[12px] font-semibold text-navy transition-transform hover:-translate-y-0.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Намери
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.q}
            type="button"
            onClick={() => go(c.q, "chip")}
            className="rounded-full border border-gold/25 bg-card/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-gold/60 hover:text-gold"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
