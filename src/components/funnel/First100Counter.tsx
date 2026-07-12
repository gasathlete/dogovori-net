import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame } from "@/icons";
import { supabase } from "@/integrations/supabase/client";

/**
 * First100Counter — elegant "Остават X/100" pill placed under the
 * FIRST100 promo line in the Hero. Reads the live count via the public
 * RPC `get_first90_remaining` (100 minus a 10-seat marketing seed minus
 * real active paid users + teams — including admin-granted subscriptions)
 * and refreshes every 60s. Clicking the pill navigates to /plans.
 */
const TOTAL_SEATS = 100;

export function First100Counter() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("get_first90_remaining");
      if (cancelled) return;
      let value: number;
      if (error || data === null || data === undefined) {
        value = TOTAL_SEATS;
      } else {
        value = typeof data === "number" ? data : Number(data);
        if (!Number.isFinite(value)) value = TOTAL_SEATS;
      }
      setRemaining(Math.max(0, Math.min(TOTAL_SEATS, value)));
    };

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

  const taken = TOTAL_SEATS - remaining;
  const pct = Math.max(4, Math.min(100, (taken / TOTAL_SEATS) * 100));
  const scarce = remaining <= 18;

  return (
    <Link
      to="/plans"
      aria-label={`Остават ${remaining} от ${TOTAL_SEATS} места с 20% отстъпка — виж плановете`}
      className="group mt-2 inline-flex items-center gap-2.5 rounded-full border border-gold/30 bg-card/60 px-3.5 py-1.5 text-[13px] backdrop-blur-sm transition-all hover:border-gold/60 hover:bg-card/80 hover:shadow-[0_0_0_4px_hsl(var(--gold)/0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
    >
      <Flame
        className={`h-3.5 w-3.5 ${scarce ? "text-danger animate-pulse" : "text-gold"}`}
        aria-hidden="true"
      />
      <span className="font-medium tracking-wide text-muted-foreground">
        Остават{" "}
        <span
          className={`font-semibold tabular-nums ${scarce ? "text-danger" : "text-gold"}`}
        >
          {remaining}
        </span>
        <span className="text-muted-foreground/70">/{TOTAL_SEATS}</span>
      </span>
      <span
        aria-hidden="true"
        className="relative h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/70 to-gold transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span
        aria-hidden="true"
        className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
