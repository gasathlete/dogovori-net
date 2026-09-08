/**
 * Q2a — представяне на риск-анализа според доказателственото му състояние.
 *
 * Оценката е рейтинг САМО когато анализът е напълно обоснован с текст от
 * договора (`evidence_checked`). Иначе числото не се показва като оценка —
 * липсата на потвърдени находки НЕ означава, че документът е безопасен.
 *
 * Метаданните идват от базата и се третират като недоверен вход. Валидаторът тук
 * е ОГЛЕДАЛЕН на `supabase/functions/_shared/analysis-evidence.ts`
 * (`validateAnalysisVerification`) — същата версия, същият затворен набор кодове,
 * същите изисквания за шестте броя, същите правила за консистентност между
 * статус, кодове и доверена оценка. Двете страни се проверяват с еднакъв набор
 * тестови случаи. Валидаторът НЕ „пада отворен": всичко нестандартно е
 * `unverified`, липсата на метаданни е `legacy_unverified`.
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
  /** Само при валиден `evidence_checked` числото може да се показва като оценка. */
  scoreTrusted: boolean;
}

const SUPPORTED_VERSION = 1;

/** Затворен набор — идентичен с `ANALYSIS_REASON_CODES` на функцията. */
export const ANALYSIS_REASON_CODES = [
  "root_shape_invalid",
  "issues_not_array",
  "missing_not_array",
  "issue_malformed",
  "quote_unverified",
  "missing_clause_malformed",
  "missing_clause_filtered",
  "input_truncated",
  "score_invalid",
] as const;

const COUNT_KEYS = [
  "issues_raw",
  "issues_kept",
  "issues_rejected",
  "missing_raw",
  "missing_kept",
  "missing_rejected",
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeCount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v) && v >= 0 &&
    v <= Number.MAX_SAFE_INTEGER;
}

const UNVERIFIED: ParsedAnalysisVerification = {
  status: "unverified",
  reasonCodes: [],
  counts: null,
  scoreTrusted: false,
};

export function parseAnalysisVerification(value: unknown): ParsedAnalysisVerification {
  if (value === null || value === undefined) {
    return { status: "legacy_unverified", reasonCodes: [], counts: null, scoreTrusted: false };
  }
  if (!isPlainObject(value)) return UNVERIFIED;
  if (value.version !== SUPPORTED_VERSION) return UNVERIFIED;

  const status = value.status;
  if (status !== "evidence_checked" && status !== "incomplete") return UNVERIFIED;

  if (!Array.isArray(value.reason_codes)) return UNVERIFIED;
  const reasonCodes: string[] = [];
  for (const c of value.reason_codes) {
    if (typeof c !== "string") return UNVERIFIED;
    if (!(ANALYSIS_REASON_CODES as readonly string[]).includes(c)) return UNVERIFIED;
    if (reasonCodes.includes(c)) return UNVERIFIED;
    reasonCodes.push(c);
  }

  const rawCounts = value.counts;
  if (!isPlainObject(rawCounts)) return UNVERIFIED;
  for (const k of COUNT_KEYS) {
    if (!safeCount(rawCounts[k])) return UNVERIFIED;
  }
  const counts: AnalysisVerificationCounts = {
    issuesRaw: rawCounts.issues_raw as number,
    issuesKept: rawCounts.issues_kept as number,
    issuesRejected: rawCounts.issues_rejected as number,
    missingRaw: rawCounts.missing_raw as number,
    missingKept: rawCounts.missing_kept as number,
    missingRejected: rawCounts.missing_rejected as number,
  };
  if (counts.issuesRaw !== counts.issuesKept + counts.issuesRejected) return UNVERIFIED;
  if (counts.missingRaw !== counts.missingKept + counts.missingRejected) return UNVERIFIED;

  if (typeof value.score_trusted !== "boolean") return UNVERIFIED;

  if (status === "evidence_checked") {
    if (reasonCodes.length !== 0) return UNVERIFIED;
    if (counts.issuesRejected !== 0 || counts.missingRejected !== 0) return UNVERIFIED;
    if (value.score_trusted !== true) return UNVERIFIED;
  } else {
    if (reasonCodes.length === 0) return UNVERIFIED;
    if (value.score_trusted !== false) return UNVERIFIED;
  }

  return {
    status,
    reasonCodes,
    counts,
    scoreTrusted: status === "evidence_checked",
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
  /** Обяснение, когато проверката не е пълна или не е за текущия текст. */
  notice: string | null;
}


export const NEUTRAL_ANALYSIS_TONE = "text-muted-foreground border-border/60 bg-muted/20";

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

/**
 * Текстове, когато оценка не се показва. Езикът е насочен към действието на
 * ползвателя, а не към вътрешното състояние на проверката.
 */
const INCOMPLETE_NOTICE =
  "Част от проверката не е завършена, затова оценка не се показва. Липсата на находки не означава, че документът е безопасен.";

const UNCONFIRMED_NOTICE =
  "Не можем да потвърдим този анализ, затова оценка не се показва. Прегледайте документа и посочените находки.";

const LEGACY_NOTICE =
  "Този анализ е от по-ранна проверка и не носи запис за проверените цитати, затова оценка не се показва.";

/** Оценка се приема само като цяло число 1..10 — без закръгляне на дробни стойности. */
function usableScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

export function presentAnalysisScore(input: {
  score: unknown;
  verification: unknown;
}): AnalysisScorePresentation {
  const parsed = parseAnalysisVerification(input.verification);

  if (!parsed.scoreTrusted || !usableScore(input.score)) {
    let label = "Не можем да потвърдим този анализ";
    let subtext = "Прегледайте документа и посочените находки.";
    let notice = UNCONFIRMED_NOTICE;

    if (parsed.status === "legacy_unverified") {
      label = "Предишен анализ";
      subtext = "Направете нов анализ, за да получите актуална проверка.";
      notice = LEGACY_NOTICE;
    } else if (parsed.status === "incomplete") {
      label = "Част от проверката не е завършена";
      subtext = "Потвърдените находки остават видими.";
      notice = INCOMPLETE_NOTICE;
    }

    return { showScore: false, score: null, tone: NEUTRAL_ANALYSIS_TONE, label, subtext, notice };
  }

  const s = input.score;
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
  if (parsed.status === "incomplete") {
    return "Няма потвърдени находки; част от проверката не е завършена.";
  }
  return "Няма отбелязани находки, но този анализ не е потвърден. Прегледайте документа.";
}

/** Кратък бадж за списъчните изгледи. */
export function analysisBadge(input: { score: unknown; verification: unknown }): {
  text: string;
  className: string;
} {
  const p = presentAnalysisScore(input);
  if (!p.showScore) return { text: "непотвърден", className: NEUTRAL_ANALYSIS_TONE };
  return { text: `${p.score}/10`, className: p.tone };
}
