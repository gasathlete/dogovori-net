import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * First100Counter — small, elegant "Остават X/100" pill placed under the
 * FIRST100 promo line in the Hero. Reads the live count via the public
 * RPC `get_first100_remaining` and refreshes every 60s so the number
 * ticks down as new subscriptions come in.
 */
export function First100Counter() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("get_first100_remaining");
      if (cancelled || error) return;
      const value = typeof data === "number" ? data : Number(data);
      if (Number.isFinite(value)) setRemaining(Math.max(0, Math.min(100, value)));
    };

    // Defer first fetch to idle so it never competes with LCP.
    const idle =
      (window as any).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 800));
    const handle = idle(load, { timeout: 3000 });

    const interval = window.setInterval(load, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      const cic = (window as any).cancelIdleCallback;
      if (cic) cic(handle);
      else clearTimeout(handle as any);
    };
  }, []);

  if (remaining === null) return null;

  const taken = 100 - remaining;
  const pct = Math.max(4, Math.min(100, taken));
  const scarce = remaining <= 20;

  return (
    <div
      className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-card/50 px-2.5 py-1 text-[11px] backdrop-blur-sm"
      aria-live="polite"
    >
      <Flame
        className={`h-3 w-3 ${scarce ? "text-danger animate-pulse" : "text-gold"}`}
        aria-hidden="true"
      />
      <span className="font-medium tracking-wide text-muted-foreground">
        Остават{" "}
        <span className={`font-semibold tabular-nums ${scarce ? "text-danger" : "text-gold"}`}>
          {remaining}
        </span>
        <span className="text-muted-foreground/70">/100</span>
      </span>
      <span
        aria-hidden="true"
        className="relative h-1 w-14 overflow-hidden rounded-full bg-foreground/10"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/70 to-gold transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}
