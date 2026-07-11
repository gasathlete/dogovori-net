import { useNavigate } from "react-router-dom";
import { Loader2, FileDown, FileText, Save, FileSignature } from "@/icons";
import { Button } from "@/components/ui/button";
import { RiskMeter } from "@/components/wizard/RiskMeter";
import { RiskReport } from "@/components/wizard/RiskReport";
import { SignatureBlock, type SignatureData } from "@/components/wizard/SignatureBlock";
import { CorrectionsPanel, type CorrectionsSelection } from "@/components/wizard/CorrectionsPanel";
import { STORAGE_KEY, type AIResult } from "./parts";

type Props = {
  result: AIResult;
  isPro: boolean;
  freeWaveAvailable: boolean;
  applyingCorrections: boolean;
  appliedNotes: string[] | undefined;
  syntheticAnswers: { party_a_name: string; party_b_name: string };
  signature: SignatureData;
  setSignature: (s: SignatureData) => void;
  exporting: "pdf" | "docx" | null;
  saving: boolean;
  savedDocId: string | undefined;
  signingFreeAvailable: boolean;
  onApplyCorrections: (sel: CorrectionsSelection) => void;
  onExport: (format: "pdf" | "docx") => void;
  onSaveToProfile: () => void;
  setSignDialogOpen: (v: boolean) => void;
  onResetAll: () => void;
};

export function FinalizePane({
  result,
  isPro,
  freeWaveAvailable,
  applyingCorrections,
  appliedNotes,
  syntheticAnswers,
  signature,
  setSignature,
  exporting,
  saving,
  savedDocId,
  signingFreeAvailable,
  onApplyCorrections,
  onExport,
  onSaveToProfile,
  setSignDialogOpen,
  onResetAll,
}: Props) {
  const navigate = useNavigate();
  return (
    <div className="space-y-5 animate-fade-in">
      <RiskMeter level={result.risk.level} score={result.risk.score} summary={result.risk.summary} />
      <CorrectionsPanel
        isPro={isPro}
        freeWaveAvailable={freeWaveAvailable}
        issues={result.risk.issues || []}
        recommendations={result.risk.recommendations || []}
        loading={applyingCorrections}
        applied={appliedNotes}
        onApply={onApplyCorrections}
        onUpgrade={() => navigate("/account?tab=subscription")}
      />
      <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
        <RiskReport
          level={result.risk.level}
          issues={result.risk.issues || []}
          recommendations={result.risk.recommendations || []}
          isPro={isPro}
        />
      </div>

      <SignatureBlock
        isPro={isPro}
        defaultPartyA={syntheticAnswers.party_a_name}
        defaultPartyB={syntheticAnswers.party_b_name}
        value={signature}
        onChange={setSignature}
      />

      <div className="rounded-xl border border-gold/30 bg-gradient-card p-6 shadow-soft">
        <h3 className="mb-1 font-serif text-lg font-bold">Финализиране</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Експорт, подпис и запис в профила — както при шаблонните договори.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => onExport("pdf")}
            disabled={!!exporting}
            className="flex-1 bg-gradient-gold text-navy hover:shadow-gold"
          >
            {exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Свали PDF
          </Button>
          <Button
            onClick={() => onExport("docx")}
            disabled={!!exporting}
            variant="outline"
            className="flex-1 border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            {exporting === "docx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Свали DOCX
          </Button>
        </div>
        <Button
          onClick={onSaveToProfile}
          disabled={saving || !!savedDocId}
          variant="outline"
          className="mt-2 w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {savedDocId ? "Запазено в профила" : "Запази в профила"}
        </Button>
        <Button
          onClick={() => setSignDialogOpen(true)}
          variant="outline"
          className="mt-2 w-full border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
        >
          <FileSignature className="mr-2 h-4 w-4" />
          Експорт за онлайн подпис
          {!isPro && signingFreeAvailable && (
            <span className="ml-2 inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
              1 безплатна
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={onResetAll}
          className="mt-3 w-full text-xs text-muted-foreground hover:text-gold"
        >
          Започни нов договор
        </Button>
      </div>
    </div>
  );
}

export { STORAGE_KEY };
