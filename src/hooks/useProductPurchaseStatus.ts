import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { ONE_TIME_PURCHASES_AVAILABLE } from "@/lib/products";
import { resolvePurchaseState, type ProductPurchaseState } from "@/lib/productPurchaseStatus";
import { useAuth } from "@/hooks/useAuth";

/** Сървърен статус „може ли да се купи сега“; при грешка — затворено. */
export function useProductPurchaseStatus(): ProductPurchaseState {
  const { user } = useAuth();
  const [state, setState] = useState<ProductPurchaseState>(
    ONE_TIME_PURCHASES_AVAILABLE ? { status: "loading" } : { status: "closed", reason: "prelaunch" },
  );
  useEffect(() => {
    if (!ONE_TIME_PURCHASES_AVAILABLE) return;
    let alive = true;
    (async () => {
      let environment: "sandbox" | "live";
      try { environment = getStripeEnvironment(); } catch {
        if (alive) setState({ status: "closed", reason: "unavailable" });
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("product-purchase-status", { body: { environment } });
        if (alive) setState(resolvePurchaseState(true, error ? null : data));
      } catch {
        if (alive) setState({ status: "closed", reason: "unavailable" });
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);
  return state;
}
