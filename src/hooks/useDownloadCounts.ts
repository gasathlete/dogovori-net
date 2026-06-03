/**
 * Sprint 3 — Discovery & Catalog 2.0
 *
 * Fetches the public download-counts map (slug → count) once per session and
 * caches it in memory. The table is small (one row per popular template), so
 * a single SELECT is cheaper than per-card joins.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cache: Map<string, number> | null = null;
let inflight: Promise<Map<string, number>> | null = null;

async function loadCounts(): Promise<Map<string, number>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("template_download_counts")
      .select("slug, count");
    if (error) {
      console.warn("download counts fetch failed", error);
      cache = new Map();
      return cache;
    }
    cache = new Map((data ?? []).map((r) => [r.slug, Number(r.count) || 0]));
    return cache;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function useDownloadCounts(): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(() => cache ?? new Map());
  useEffect(() => {
    let cancelled = false;
    if (!cache) {
      loadCounts().then((m) => { if (!cancelled) setCounts(m); });
    }
    return () => { cancelled = true; };
  }, []);
  return counts;
}
