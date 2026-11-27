/**
 * Sprint 3 — Discovery & Catalog 2.0
 *
 * Debounced server-side search against the `search_templates` RPC.
 * Supports both Cyrillic and Latin transliterated queries
 * ("naem ofis" ≡ "наем офис") plus filters.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TemplateSearchHit = {
  slug: string;
  name: string;
  category_id: string;
  category_title: string;
  purpose: string;
  key_clause: string;
  document_type: string | null;
  bilingual: boolean;
  has_dynamic_wizard: boolean;
  lawyer_reviewed: boolean;
  downloads: number;
  rank: number;
  total: number;
};

export type SearchOpts = {
  category?: string | null;
  documentType?: string | null;
  bilingualOnly?: boolean;
  dynamicOnly?: boolean;
  sort?: "relevance" | "popular" | "name" | "new";
  limit?: number;
  offset?: number;
  debounceMs?: number;
  /** Pass false to skip the network call (e.g. while query is empty). */
  enabled?: boolean;
};

export function useTemplateSearch(query: string, opts: SearchOpts = {}) {
  const [hits, setHits]       = useState<TemplateSearchHit[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const enabled       = opts.enabled !== false;
  const debounceMs    = opts.debounceMs ?? 180;
  const category      = opts.category      ?? null;
  const documentType  = opts.documentType  ?? null;
  const bilingualOnly = !!opts.bilingualOnly;
  const dynamicOnly   = !!opts.dynamicOnly;
  const sort          = opts.sort  ?? "relevance";
  const limit         = opts.limit ?? 30;
  const offset        = opts.offset ?? 0;

  useEffect(() => {
    if (!enabled) {
      setHits([]); setTotal(0); setLoading(false); setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const handle = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_templates", {
        q: query.trim() || null,
        p_category: category,
        p_document_type: documentType,
        p_bilingual_only: bilingualOnly,
        p_dynamic_only: dynamicOnly,
        p_sort: sort,
        p_limit: limit,
        p_offset: offset,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setHits([]);
        setTotal(0);
      } else {
        const rows = (data ?? []) as TemplateSearchHit[];
        setHits(rows);
        setTotal(rows[0]?.total ?? 0);
        setError(null);
      }
      setLoading(false);
    }, debounceMs);

    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [query, enabled, debounceMs, category, documentType, bilingualOnly, dynamicOnly, sort, limit, offset]);

  return { hits, total, loading, error };
}
