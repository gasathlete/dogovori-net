/**
 * Backward-compat redirect: the graph-driven wizard has been unified into
 * the classic `/wizard/:sectorId` flow. Any old link to
 * `/wizard-graph/:slug` (or `/wizard-graph/:slug/review`) now resolves to
 * the correct `sectorId` + `?doc=` and preserves the user's flow.
 */
import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { CATALOG } from "@/data/catalog";
import { slugify } from "@/lib/slugify";

export default function WizardGraphRedirect() {
  const { slug } = useParams<{ slug: string }>();

  // Find (sectorId, docName) whose slugified doc name matches.
  let sectorId: string | null = null;
  let docName: string | null = null;
  if (slug) {
    for (const cat of CATALOG) {
      const doc = cat.documents.find((d) => slugify(d.name) === slug);
      if (doc) {
        sectorId = cat.sectorId;
        docName = doc.name;
        break;
      }
    }
  }

  useEffect(() => {
    // Migrate saved graph draft to something wizard can pick up (best-effort).
    if (!slug) return;
    try {
      const raw = sessionStorage.getItem(`wizard-graph:last:${slug}`);
      if (raw) sessionStorage.setItem(`wizard-graph:migrated:${slug}`, raw);
    } catch { /* noop */ }
  }, [slug]);

  if (sectorId && docName) {
    return <Navigate to={`/wizard/${sectorId}?doc=${encodeURIComponent(docName)}`} replace />;
  }
  return <Navigate to="/catalog" replace />;
}
