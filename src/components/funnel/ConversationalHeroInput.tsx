/**
 * ConversationalHeroInput — anonymous Step-1 engagement hook.
 *
 * Single search field with live, catalog-style suggestions (server-side
 * search_templates RPC, same source as /catalog). Selecting a hit goes to
 * the template page; pressing Enter goes to /catalog?q=…
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles, Loader2 } from "@/icons";
import { trackFunnelEvent } from "@/lib/funnel";
import { useTemplateSearch } from "@/hooks/useTemplateSearch";

type Props = { initialQuery?: string; autoFocus?: boolean };

export function ConversationalHeroInput({ initialQuery = "", autoFocus = false }: Props = {}) {
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch { /* noop */ }
      if (initialQuery.trim().length >= 2) setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { hits, loading } = useTemplateSearch(q, {
    enabled: q.trim().length >= 2,
    limit: 6,
    sort: "relevance",
    debounceMs: 260,
  });

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = formRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, q]);

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
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="group relative flex items-center gap-2 rounded-full border border-gold/40 bg-card/70 px-3 py-2 shadow-soft backdrop-blur-md focus-within:border-gold focus-within:shadow-gold"
      >
        <Search className="ml-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Търси документ"
          aria-label="Търси документ"
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

      {showDropdown && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 9999 }}
          className="overflow-hidden rounded-2xl border border-gold/30 bg-card shadow-2xl ring-1 ring-black/5"
        >
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
            <ul className="max-h-[55vh] overflow-y-auto overscroll-contain">
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
        </div>,
        document.body,
      )}
    </div>
  );
}
