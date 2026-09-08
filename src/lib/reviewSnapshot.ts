/**
 * Q2d — обвързване на AI ревизията с ТОЧНАТА снимка на документа.
 *
 * Клиентът показва присъда/проверки САМО когато отговорът носи същия отпечатък
 * на източника, който сме заявили, и заявката е от текущата генерация.
 * Стар (legacy) резултат без отпечатък се показва като непотвърден.
 */

export const REVIEW_SOURCE_VERSION = "q2d-review-source-1";
export const REVIEW_TEXT_LIMIT = 60000;

export interface ReviewDecision {
  label: string;
  value: string;
}

export interface ReviewContextInput {
  role?: string;
  decisions: ReviewDecision[];
}

export interface ReviewSnapshotInput {
  documentText: string;
  documentTitle?: string;
  documentType?: string;
  documentVersion?: string;
  context?: ReviewContextInput | null;
  ignorePersonalData?: boolean;
}

/** Канонично представяне — ЕДНО и също с edge функцията. */
export function canonicalReviewSource(i: ReviewSnapshotInput): string {
  const parts: string[] = [
    REVIEW_SOURCE_VERSION,
    (i.documentType ?? "").trim(),
    ((i.documentTitle ?? "").trim() || "Документ"),
    (i.documentVersion ?? "").trim(),
    (i.context?.role ?? "").trim(),
    String(i.ignorePersonalData === true),
  ];
  for (const d of i.context?.decisions ?? []) {
    if (!d.label.trim() || !d.value.trim()) continue;
    parts.push(`${d.label.trim()}=${d.value.trim()}`);
  }
  parts.push("\u241E", i.documentText.trim());
  return parts.join("\u0000");
}

export async function computeReviewSourceDigest(i: ReviewSnapshotInput): Promise<string> {
  const buf = new TextEncoder().encode(canonicalReviewSource(i));
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ReviewTrust = "verified" | "unverified" | "mismatched";

export interface ReviewTrustState {
  trust: ReviewTrust;
  /** Може ли изобщо да се показва присъда като отнасяща се за текущия текст. */
  showVerdict: boolean;
  notice: string | null;
}

/**
 * Строго: приемаме резултата САМО при точно съвпадение на отпечатъка.
 * Липсващ отпечатък (стар резултат) не се обявява за проверен.
 */
export function assessReviewTrust(input: {
  responseSource?: { v?: string; digest?: string } | null;
  expectedDigest: string;
}): ReviewTrustState {
  const src = input.responseSource;
  if (!src || typeof src.digest !== "string" || !src.digest || src.v !== REVIEW_SOURCE_VERSION) {
    return {
      trust: "unverified",
      showVerdict: false,
      notice: "Този резултат не може да бъде свързан с текущия документ. Направете нова проверка.",
    };
  }
  if (src.digest !== input.expectedDigest) {
    return {
      trust: "mismatched",
      showVerdict: false,
      notice: "Документът е променен след тази проверка. Резултатът не се отнася за текущия текст.",
    };
  }
  return { trust: "verified", showVerdict: true, notice: null };
}

export type CompletenessStatus = "complete" | "partial" | "incomplete";

export interface ReviewCompleteness {
  status: CompletenessStatus;
  reasons?: string[];
}

/** Непълна проверка никога не се представя като „готово". */
export function completenessNotice(c: ReviewCompleteness | null | undefined): string | null {
  if (!c || c.status === "complete") return null;
  if (c.status === "incomplete") {
    if ((c.reasons ?? []).includes("input_truncated")) {
      return "Документът е по-дълъг от обхвата на проверката — прегледана е само част от текста. Потвърдените находки остават видими.";
    }
    return "Част от проверката не е завършена. Потвърдените находки остават видими.";
  }
  return "Част от констатациите не са потвърдени с откъс от текста и не се представят като установени факти.";
}

export function canShowReady(input: {
  verdict: string;
  completeness?: ReviewCompleteness | null;
  trust: ReviewTrust;
}): boolean {
  if (input.trust !== "verified") return false;
  if (input.completeness && input.completeness.status !== "complete") return false;
  return input.verdict === "ready";
}

/** Runtime проверка на пълнотата от отговора — без cast-ове. */
export function readCompleteness(v: unknown): ReviewCompleteness | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = o.status;
  if (s !== "complete" && s !== "partial" && s !== "incomplete") return null;
  const reasons = Array.isArray(o.reasons) ? o.reasons.filter((r): r is string => typeof r === "string") : [];
  return { status: s, reasons };
}
