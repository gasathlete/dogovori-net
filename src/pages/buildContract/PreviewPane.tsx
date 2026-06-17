import { FileText, FileDown, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetectedReferencesBanner } from "@/components/DetectedReferencesBanner";
import { LiveDraft } from "@/components/wizard/LiveDraft";
import { MultiPartySigningDialog } from "@/components/MultiPartySigningDialog";
import { collectContractText, type DocumentTypeId } from "@/lib/documentReferences";
import type { Sector } from "@/data/sectors";
import type { SignatureData } from "@/components/wizard/SignatureBlock";
import type { AIResult } from "./parts";
import { splitLines } from "./parts";

type Props = {
  result: AIResult | null;
  syntheticSector: Sector;
  syntheticAnswers: { party_a_name: string; party_b_name: string };
  signature: SignatureData;
  isPro: boolean;
  name: string;
  partiesA: string;
  partiesB: string;
  fieldValues: Record<string, string>;
  bilingual: boolean;
  bilingualLang: "en" | "de" | "fr" | "ru" | "es" | "it";
  canBilingual: boolean;
  documentType: DocumentTypeId;
  exporting: "pdf" | "docx" | null;
  savedDocId: string | undefined;
  appendixRefreshTick: number;
  setAppendixRefreshTick: React.Dispatch<React.SetStateAction<number>>;
  signDialogOpen: boolean;
  setSignDialogOpen: (v: boolean) => void;
  signingFreeAvailable: boolean;
  refreshPro: () => void;
  onExport: (format: "pdf" | "docx") => void;
  setResult: (r: AIResult | null) => void;
  setSavedDocId: (id: string | undefined) => void;
};

export function PreviewPane({
  result,
  syntheticSector,
  syntheticAnswers,
  signature,
  isPro,
  name,
  partiesA,
  partiesB,
  fieldValues,
  bilingual,
  bilingualLang,
  canBilingual,
  documentType,
  exporting,
  savedDocId,
  appendixRefreshTick,
  setAppendixRefreshTick,
  signDialogOpen,
  setSignDialogOpen,
  signingFreeAvailable,
  refreshPro,
  onExport,
  setResult,
  setSavedDocId,
}: Props) {
  return (
    <section className="lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
      {result ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
              <FileText className="h-3.5 w-3.5" />
              Краен документ
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={!!exporting}
                onClick={() => onExport("pdf")}
                title="Свали PDF"
                className="h-8 px-2 text-gold hover:bg-gold/10"
              >
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.print()}
                title="Печат"
                className="h-8 px-2 text-gold hover:bg-gold/10"
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            <DetectedReferencesBanner
              key={appendixRefreshTick}
              text={collectContractText(result.contract)}
              parentSavedId={savedDocId ?? null}
              parentTitle={name || result.contract.title}
              parentContext={{
                partiesA: splitLines(partiesA),
                partiesB: splitLines(partiesB),
                subject: (fieldValues.subject ?? "").trim(),
              }}
              onChildLinked={() => setAppendixRefreshTick((t) => t + 1)}
            />
            <LiveDraft
              sector={syntheticSector}
              answers={syntheticAnswers}
              generated={result.contract}
              signature={signature}
              isPro={isPro}
              onContractChange={(next) => {
                if (!result) return;
                setResult({ ...result, contract: { ...result.contract, ...next } });
                setSavedDocId(undefined);
              }}
            />
          </div>
          <MultiPartySigningDialog
            open={signDialogOpen}
            onOpenChange={setSignDialogOpen}
            title={(name || result.contract.title || "Договор").trim()}
            documentSnapshot={result.contract}
            savedDocumentId={savedDocId ?? null}
            isPro={isPro}
            freeAvailable={signingFreeAvailable}
            onCreated={refreshPro}
          />
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
              <FileText className="h-3.5 w-3.5" />
              Работен документ
            </div>
            <span className="text-xs text-muted-foreground">Актуализация в реално време</span>
          </div>
          <LiveDraft
            sector={syntheticSector}
            answers={syntheticAnswers}
            generated={null}
            isPro={isPro}
            bilingual={bilingual && canBilingual}
            bilingualLang={bilingualLang}
            docName={name}
            documentType={documentType}
          />
        </>
      )}
    </section>
  );
}
