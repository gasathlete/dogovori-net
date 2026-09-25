import { Zap, Briefcase, Scale } from "@/icons";
import { Label } from "@/components/ui/label";
import type { RiskLevel } from "@/components/wizard/RiskMeter";
import type { RiskIssue } from "@/components/wizard/RiskReport";
import type { GeneratedContract } from "@/lib/exporters";

export type BuildMode = "fast" | "working" | "strict";

export const BUILD_MODES: { id: BuildMode; label: string; short: string; description: string; icon: any }[] = [
  { id: "fast", label: "Бърз", short: "Бърз", description: "По-прости документи без висока прецизност — кратко и ясно.", icon: Zap },
  { id: "working", label: "Разширен", short: "Разширен", description: "Балансирана версия с опционално надграждане.", icon: Briefcase },
  { id: "strict", label: "Стриктен", short: "Стриктен", description: "Подробно, високопрофесионално — съвети и стриктна правна форма.", icon: Scale },
];

export const buildPresetSignature = (params: URLSearchParams) => [
  params.get("category") ?? "",
  params.get("documentType") ?? "",
  params.get("name") ?? "",
  params.get("bilingual") ?? "",
  params.get("parentSavedId") ?? "",
  params.get("parentUploadedId") ?? "",
  params.get("parentTitle") ?? "",
  params.get("refCtx") ?? "",
  params.get("refNumber") ?? "",
  params.get("refType") ?? "",
  params.get("partiesA") ?? "",
  params.get("partiesB") ?? "",
  params.get("subject") ?? "",
].join("|");

export interface AIResult {
  risk: { level: RiskLevel; score: number; summary: string; issues: RiskIssue[]; recommendations: string[] };
  contract: GeneratedContract;
  /** Q4a — подписан манифест за качество; маха се при локална редакция. */
  quality_manifest?: unknown;
}

export const STORAGE_KEY = "build:custom-contract";

export const splitLines = (s: string) =>
  s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export const GEN_STEPS = [
  "Проверяваме въведената информация…",
  "Подбираме приложимите правни клаузи…",
  "Комплектоваме структурата на договора…",
  "Съставяме текста и форматираме раздели…",
  "Извършваме оценка на риска…",
  "Финализираме документа — почти готово…",
];

export function Field({
  label,
  required,
  hint,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-1 text-gold">*</span>}
        </Label>
        {hint && <span className="text-[11px] italic text-muted-foreground">{hint}</span>}
      </div>
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}
