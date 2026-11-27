import { useMemo } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { CATALOG } from "@/data/catalog";
import { resolveBuildSectorId } from "@/lib/bilingualBuildRouting";

/**
 * Dedicated entry point for bilingual (BG/EN) documents chosen from the
 * catalog. We reuse the standard step-by-step Wizard (with live preview)
 * instead of the free-form "Изготви документ" builder — only the generation
 * step asks the edge function for parallel English text.
 *
 * Route: /wizard-bilingual/:sectorId?doc=<documentName>
 * Redirects to: /wizard/<resolvedSector>?doc=<documentName>&bilingual=1
 */
export default function WizardBilingualPage() {
  const { sectorId } = useParams<{ sectorId: string }>();
  const [searchParams] = useSearchParams();
  const docName = searchParams.get("doc") ?? "";

  const target = useMemo(() => {
    if (!docName) return null;
    // Find the catalog entry to read documentType for accurate routing.
    let documentType: string | undefined;
    for (const cat of CATALOG) {
      const doc = cat.documents.find((d) => d.name === docName && d.bilingual);
      if (doc) {
        documentType = doc.documentType;
        break;
      }
    }
    const resolvedSector = resolveBuildSectorId({
      bilingual: true,
      docName,
      sectorId,
      documentType,
    });
    return `/wizard/${resolvedSector}?doc=${encodeURIComponent(docName)}&bilingual=1`;
  }, [sectorId, docName]);

  if (!target) return <Navigate to="/catalog" replace />;
  return <Navigate to={target} replace />;
}
