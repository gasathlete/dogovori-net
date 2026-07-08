/**
 * HeroSearchLazy — lightweight placeholder that renders instantly and
 * upgrades to the full ConversationalHeroInput (with supabase-powered
 * live suggestions) only on first user interaction.
 *
 * Why: the full search pulls in the supabase client + search hook, which
 * used to sit in the landing entry chunk and delayed LCP. The lite input
 * is a plain form that submits to /catalog?q=… so it's fully functional
 * even before the upgrade lands.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles } from "lucide-react";

const ConversationalHeroInput = lazy(() =>
  import("./ConversationalHeroInput").then((m) => ({ default: m.ConversationalHeroInput })),
);

export function HeroSearchLazy() {
  const [upgrade, setUpgrade] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Idle-prefetch the full component so first focus feels instant on fast
  // connections, but without blocking initial paint.
  useEffect(() => {
    const idle =
      (window as any).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 1500));
    const handle = idle(
      () => {
        import("./ConversationalHeroInput");
      },
      { timeout: 4000 },
    );
    return () => {
      const cic = (window as any).cancelIdleCallback;
      if (cic) cic(handle);
      else clearTimeout(handle as any);
    };
  }, []);

  const doUpgrade = () => {
    if (upgrade) return;
    setUpgrade(true);
  };

  if (upgrade) {
    return (
      <Suspense
        fallback={
          <LitePlaceholder
            q={q}
            setQ={setQ}
            onFocus={() => {}}
            onSubmit={(term) => term && navigate(`/catalog?q=${encodeURIComponent(term)}`)}
          />
        }
      >
        <ConversationalHeroInput />
      </Suspense>
    );
  }

  return (
    <LitePlaceholder
      ref={inputRef}
      q={q}
      setQ={(v) => {
        setQ(v);
        doUpgrade();
      }}
      onFocus={doUpgrade}
      onSubmit={(term) => {
        const t = term.trim();
        if (t) navigate(`/catalog?q=${encodeURIComponent(t)}`);
      }}
    />
  );
}

type LiteProps = {
  q: string;
  setQ: (v: string) => void;
  onFocus: () => void;
  onSubmit: (term: string) => void;
};

const LitePlaceholder = (
  { q, setQ, onFocus, onSubmit, ref }: LiteProps & { ref?: React.Ref<HTMLInputElement> },
) => (
  <div className="relative mx-auto mt-3 w-full max-w-xl">
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(q);
      }}
      className="group relative flex items-center gap-2 rounded-full border border-gold/40 bg-card/70 px-3 py-2 shadow-soft backdrop-blur-md focus-within:border-gold focus-within:shadow-gold"
    >
      <Search className="ml-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        inputMode="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={onFocus}
        onPointerDown={onFocus}
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
  </div>
);
