import { useNavigate } from "react-router-dom";
import { FileSignature } from "@/icons";
import { Button } from "@/components/ui/button";
import { ResultShell } from "@/components/wizard/ResultShell";
import { ResultActionBar } from "@/components/wizard/ResultActionBar";
import { RiskReport } from "@/components/wizard/RiskReport";
import { SignatureBlock, type SignatureData } from "@/components/wizard/SignatureBlock";
import { CorrectionsPanel, type CorrectionsSelection } from "@/components/wizard/CorrectionsPanel";
import { getPreferredFormat } from "@/lib/preferredFormat";
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
  const issues = result.risk.issues || [];
  const recommendations = result.risk.recommendations || [];
  const total = issues.length + recommendations.length;

  return (
    <div className="space-y-4 animate-fade-in">
      <ResultActionBar
        documentTitle={result.contract.title}
        needsAuth={false}
        canDownload
        exporting={exporting}
        saving={saving}
        saved={!!savedDocId}
        preferredFormat={getPreferredFormat()}
        onExportPdf={() => onExport("pdf")}
        onExportDocx={() => onExport("docx")}
        onSave={onSaveToProfile}
        onRegister={onSaveToProfile}
      />

      <Button
        onClick={() => setSignDialogOpen(true)}
        className="h-11 w-full bg-gradient-gold text-navy hover:shadow-gold"
      >
        <FileSignature className="mr-2 h-4 w-4" />
        Изпрати за подпис
        {!isPro && signingFreeAvailable && (
          <span className="ml-2 inline-flex items-center rounded-full border border-navy/25 bg-navy/10 px-2 py-0.5 text-[10px] font-semibold">
            1 безплатна
          </span>
        )}
      </Button>

      <ResultShell
        risk={{ level: result.risk.level, score: result.risk.score, summary: result.risk.summary }}
        riskSectionId="risk"
        sections={[
          {
            id: "corrections",
            title: "Корекции и препоръки",
            badge: total > 0 ? String(total) : undefined,
            badgeTone: result.risk.level === "high" ? "danger" : "warning",
            defaultOpen: result.risk.level === "high" && issues.length > 0,
            content: (
              <CorrectionsPanel
                isPro={isPro}
                freeWaveAvailable={freeWaveAvailable}
                issues={issues}
                recommendations={recommendations}
                loading={applyingCorrections}
                applied={appliedNotes}
                onApply={onApplyCorrections}
                onUpgrade={() => navigate("/account?tab=subscription")}
              />
            ),
          },
          {
            id: "risk",
            title: "Правен риск и анализ",
            content: (
              <RiskReport
                level={result.risk.level}
                issues={issues}
                recommendations={recommendations}
                isPro={isPro}
              />
            ),
          },
          {
            id: "signing",
            title: "Подписи и данни за подписване",
            content: (
              <SignatureBlock
                isPro={isPro}
                defaultPartyA={syntheticAnswers.party_a_name}
                defaultPartyB={syntheticAnswers.party_b_name}
                value={signature}
                onChange={setSignature}
              />
            ),
          },
        ]}
        footer={
          <Button
            variant="ghost"
            onClick={onResetAll}
            className="w-full text-xs text-muted-foreground hover:text-gold"
          >
            Започни нов договор
          </Button>
        }
      />
    </div>
  );
}

export { STORAGE_KEY };
