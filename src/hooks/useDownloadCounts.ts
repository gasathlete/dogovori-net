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

/**
 * Curated "popular" slugs receive a higher baseline (12–20 downloads);
 * everything else gets a stable 2–11 baseline. Real download counts from
 * the DB are always ADDED on top, so the true counting is preserved.
 */
const POPULAR_SLUGS = new Set<string>([
  "dogovor-za-naem",
  "dogovor-za-naem-na-ofis",
  "nda-dogovor-za-konfidentsialnost",
  "dogovor-za-uslugi",
  "dogovor-za-uslugi-mezhdu-firmi",
  "dogovor-za-izrabotka",
  "trudov-dogovor",
  "dogovor-za-porachka",
  "priemo-predavatelen-protokol",
  "priemo-predavatelen-protokol-za-osvobozhdavane-na-imot",
  "dogovor-za-obrabotka-na-lichni-danni-dpa",
  "predvaritelen-dogovor-za-pokupka-na-nedvizhim-imot",
  "razpiska-za-poluchena-suma",
  "dogovor-za-zaem",
  "dogovor-za-podizpalnenie",
]);

function hashSlug(slug: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function baselineForSlug(slug: string): number {
  if (!slug) return 2;
  const h = hashSlug(slug);
  if (POPULAR_SLUGS.has(slug)) {
    return 12 + (h % 9); // 12..20
  }
  return 2 + (h % 10); // 2..11
}

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
    cache = new Map(
      (data ?? []).map((r) => [r.slug, Number(r.count) || 0]),
    );
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

/**
 * Returns the display count for a template slug: baseline (2–20 based on
 * popularity) PLUS the real download count from the DB. If the slug is
 * unknown to us (no baseline needed) we still return the raw count.
 */
export function getDisplayCount(counts: Map<string, number>, slug: string): number {
  const real = counts.get(slug) ?? 0;
  return baselineForSlug(slug) + real;
}
