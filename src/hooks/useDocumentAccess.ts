import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DocumentAccessState {
  loading: boolean;
  isPro: boolean;
  hasUnlock: boolean;
  canDownload: boolean;
  refresh: () => void;
}

/**
 * Returns access status for wizard-generated ("strict") contracts.
 * Free users must either be Pro or have an active strict_doc_unlocks row
 * for this specific docKey. Anonymous users always canDownload = false.
 */
export function useDocumentAccess(docKey: string | undefined): DocumentAccessState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [hasUnlock, setHasUnlock] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!user) {
        setIsPro(false);
        setHasUnlock(false);
        setLoading(false);
        return;
      }
      const [{ data: quota }, unlockRes] = await Promise.all([
        supabase
          .from("download_quota")
          .select("plan, pro_until")
          .eq("user_id", user.id)
          .maybeSingle(),
        docKey
          ? supabase
              .from("strict_doc_unlocks")
              .select("id, expires_at")
              .eq("user_id", user.id)
              .eq("doc_key", docKey)
              .gt("expires_at", new Date().toISOString())
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;
      const pro =
        !!quota &&
        (quota.plan === "pro" || (!!quota.pro_until && new Date(quota.pro_until) > new Date()));
      setIsPro(pro);
      setHasUnlock(!!unlockRes?.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, docKey, tick]);

  return {
    loading,
    isPro,
    hasUnlock,
    canDownload: isPro || hasUnlock,
    refresh: () => setTick((t) => t + 1),
  };
}
