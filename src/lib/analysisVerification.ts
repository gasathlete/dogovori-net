/**
 * Q2a — представяне на риск-анализа според доказателственото му състояние.
 *
 * Оценката е рейтинг САМО когато анализът е напълно обоснован с текст от
 * договора (`evidence_checked`). Иначе числото не се показва като оценка —
 * липсата на потвърдени находки НЕ означава, че документът е безопасен.
 *
 * Метаданните идват от базата и се третират като недоверен вход: всяко
 * отклонение от очакваната форма дава `unverified`, а липсата им — `legacy_unverified`.
 */

export type AnalysisVerificationStatus =
  | "evidence_checked"
  | "incomplete"
  | "legacy_unverified"
  | "unverified";

export interface AnalysisVerificationCounts {
  issuesRaw: number;
  issuesKept: number;
  issuesRejected: number;
  missingRaw: number;
  missingKept: number;
  missingRejected: number;
}

export interface ParsedAnalysisVerification {
  status: AnalysisVerificationStatus;
  reasonCodes: string[];
  counts: AnalysisVerificationCounts | null;
  /** Само при `evidence_checked` числото може да се показва като оценка. */
  scoreTrusted: boolean;
}

const SUPPORTED_VERSION = 1;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseAnalysisVerification(value: unknown): ParsedAnalysisVerification {
  if (value === null || value === undefined) {
    return { status: "legacy_unverified", reasonCodes: [], counts: null, scoreTrusted: false };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { status: "unverified", reasonCodes: [], counts: null, scoreTrusted: false };
  }
  const v = value as Record<string, unknown>;
  if (v.version !== SUPPORTED_VERSION) {
    return { status: "unverified", reasonCodes: [], counts: null, scoreTrusted: false };
  }
  if (v.status !== "evidence_checked" && v.status !== "incomplete") {
    return { status: "unverified", reasonCodes: [], counts: null, scoreTrusted: false };
  }
  const reasonCodes = Array.isArray(v.reason_codes)
    ? v.reason_codes.filter((c): c is string => typeof c === "string")
    : [];
  const rawCounts = v.counts && typeof v.counts === "object" && !Array.isArray(v.counts)
    ? (v.counts as Record<string, unknown>)
    : null;
  const counts: AnalysisVerificationCounts | null = rawCounts
    ? {
        issuesRaw: num(rawCounts.issues_raw),
        issuesKept: num(rawCounts.issues_kept),
        issuesRejected: num(rawCounts.issues_rejected),
        missingRaw: num(rawCounts.missing_raw),
        missingKept: num(rawCounts.missing_kept),
        missingRejected: num(rawCounts.missing_rejected),
      }
    : null;
  const status = v.status as "evidence_checked" | "incomplete";
  return {
    status,
    reasonCodes,
    counts,
    scoreTrusted: status === "evidence_checked" && v.score_trusted === true,
  };
}

export interface AnalysisScorePresentation {
  /** Дали числото може да се покаже като оценка. */
  showScore: boolean;
  score: number | null;
  /** Tailwind класове от дизайн-токените. */
  tone: string;
  label: string;
  subtext: string;
  /** Обяснение, когато проверката не е пълна. */
  notice: string | null;
}

const NEUTRAL_TONE = "text-muted-foreground border-border/60 bg-muted/20";

function toneForScore(s: number): string {
  if (s >= 7) return "text-emerald-400 border-emerald-400/40 bg-emerald-400/10";
  if (s >= 5) return "text-amber-300 border-amber-300/40 bg-amber-300/10";
  if (s >= 3) return "text-orange-400 border-orange-400/40 bg-orange-400/10";
  return "text-red-400 border-red-400/40 bg-red-400/10";
}

function labelForScore(s: number): string {
  if (s >= 9) return "Изряден договор";
  if (s >= 7) return "Добър договор";
  if (s >= 5) return "Препоръчителни корекции";
  if (s >= 3) return "Проблемен — преговаряй";
  return "Опасен — не подписвай";
}

function subtextForScore(s: number): string {
  if (s >= 9) return "Балансиран, без установени съществени рискове в обхвата на проверката.";
  if (s >= 7) return "Малки несъвършенства. Проверката не е правна гаранция.";
  if (s >= 5) return "Има 1-2 средни рискове или липсват важни клаузи.";
  if (s >= 3) return "Съществени неравнопоставености или липсва защита.";
  return "Признаци на престъпна, нищожна или крайно неравнопоставена клауза.";
}

const UNVERIFIED_NOTICE =
  "Проверката на този анализ не е пълна, затова оценка не се показва. Липсата на потвърдени находки не означава, че документът е безопасен.";

export function presentAnalysisScore(input: {
  score: unknown;
  verification: unknown;
}): AnalysisScorePresentation {
  const parsed = parseAnalysisVerification(input.verification);
  const rawScore = input.score;
  const scoreUsable =
    typeof rawScore === "number" && Number.isFinite(rawScore) && rawScore >= 1 && rawScore <= 10;

  if (!parsed.scoreTrusted || !scoreUsable) {
    return {
      showScore: false,
      score: null,
      tone: NEUTRAL_TONE,
      label:
        parsed.status === "legacy_unverified"
          ? "Анализ без запис от проверката"
          : "Оценката не е потвърдена",
      subtext:
        parsed.status === "legacy_unverified"
          ? "По-стар анализ — показва се неутрално, без оценка със задна дата."
          : "Показваме само потвърдените находки по-долу.",
      notice: UNVERIFIED_NOTICE,
    };
  }

  const s = Math.round(rawScore as number);
  return {
    showScore: true,
    score: s,
    tone: toneForScore(s),
    label: labelForScore(s),
    subtext: subtextForScore(s),
    notice: null,
  };
}

/** Текст при нула находки — никога „без рискове", когато проверката не е пълна. */
export function emptyIssuesMessage(verification: unknown): string {
  const parsed = parseAnalysisVerification(verification);
  if (parsed.status === "evidence_checked") {
    return "Не са открити находки с текстово покритие в договора. Това не е правна гаранция.";
  }
  return "Няма потвърдени находки; проверката не е пълна.";
}

/** Кратък бадж за списъчните изгледи. */
export function analysisBadge(input: { score: unknown; verification: unknown }): {
  text: string;
  className: string;
} {
  const p = presentAnalysisScore(input);
  if (!p.showScore) return { text: "непотвърден", className: NEUTRAL_TONE };
  return { text: `${p.score}/10`, className: p.tone };
}
