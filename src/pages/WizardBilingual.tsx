import { useMemo } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import BuildContractPage from "./BuildContract";
import { CATALOG } from "@/data/catalog";

/**
 * Dedicated wizard route for bilingual (BG/EN) documents picked from the
 * catalog. Wraps the existing /build builder with template-specific chrome
 * and a locked bilingual preset, so users coming from a template page do not
 * land on the generic "Изготви документ" screen.
 *
 * Route: /wizard-bilingual/:sectorId?doc=<documentName>
 */
export default function WizardBilingualPage() {
  const { sectorId } = useParams<{ sectorId: string }>();
  const [searchParams] = useSearchParams();
  const docName = searchParams.get("doc") ?? "";

  const resolved = useMemo(() => {
    if (!sectorId || !docName) return null;
    for (const cat of CATALOG) {
      if (cat.sectorId !== sectorId) continue;
      const doc = cat.documents.find((d) => d.name === docName);
      if (doc?.bilingual) return { cat, doc };
    }
    return null;
  }, [sectorId, docName]);

  if (!resolved) {
    return <Navigate to="/catalog" replace />;
  }

  return (
    <BuildContractPage
      variant="bilingual-template"
      presetOverride={{
        category: sectorId,
        documentType: resolved.doc.documentType ?? "contract",
        name: resolved.doc.name,
        bilingual: true,
      }}
    />
  );
}
