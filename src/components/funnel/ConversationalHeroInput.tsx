/**
 * ConversationalHeroInput — anonymous Step-1 engagement hook.
 *
 * Single search field with live, catalog-style suggestions (server-side
 * search_templates RPC, same source as /catalog). Selecting a hit goes to
 * the template page; pressing Enter goes to /catalog?q=…
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { trackFunnelEvent } from "@/lib/funnel";
import { useTemplateSearch } from "@/hooks/useTemplateSearch";

export function ConversationalHeroInput() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  const { hits, loading } = useTemplateSearch(q, {
    enabled: q.trim().length >= 2,
    limit: 6,
    sort: "relevance",
  });

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const submit = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    trackFunnelEvent("hero_query_submit", { source: "input", q: trimmed });
    navigate(`/catalog?q=${encodeURIComponent(trimmed)}`);
  };

  const pickHit = (slug: string, name: string) => {
    trackFunnelEvent("hero_query_submit", { source: "suggestion", q: name });
    navigate(`/shablon/${slug}`);
  };

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative mx-auto mt-3 w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="group relative flex items-center gap-2 rounded-full border border-gold/40 bg-card/70 px-3 py-2 shadow-soft backdrop-blur-md focus-within:border-gold focus-within:shadow-gold"
      >
        <Search className="ml-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        <input
          type="text"
          inputMode="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
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

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl border border-gold/30 bg-card/95 shadow-xl backdrop-blur-md">
          {loading && hits.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Търсене…
            </div>
          ) : hits.length === 0 ? (
            <button
              type="button"
              onClick={() => submit(q)}
              className="block w-full px-4 py-3 text-left text-[13px] text-muted-foreground hover:bg-gold/10"
            >
              Няма съвпадения. Търси „{q}" в каталога →
            </button>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {hits.map((h) => (
                <li key={h.slug}>
                  <button
                    type="button"
                    onClick={() => pickHit(h.slug, h.name)}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gold/10"
                  >
                    <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/70" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {h.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {h.category_title}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => submit(q)}
                  className="block w-full border-t border-border/40 px-4 py-2 text-left text-[12px] font-medium text-gold hover:bg-gold/10"
                >
                  Виж всички резултати за „{q}" →
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
