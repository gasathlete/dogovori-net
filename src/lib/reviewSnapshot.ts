/**
 * Q2d — обвързване на AI ревизията с ТОЧНАТА снимка на документа.
 *
 * Клиентът показва присъда/проверки САМО когато отговорът носи същия отпечатък
 * на източника, който сме заявили, и заявката е от текущата снимка.
 * Стар (legacy) резултат без отпечатък се показва като непотвърден.
 *
 * Каноничното представяне е СТРУКТУРИРАН JSON — идентичен в браузъра и в edge
 * функцията. Не се използват разделители в текста, защото стойност, съдържаща
 * разделителя, би могла да се преправи в друга снимка със същия отпечатък.
 */

export const REVIEW_SOURCE_VERSION = "q2d-review-source-2";
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

/** Канонично представяне — ЕДНО и също с edge функцията (structured JSON). */
export function canonicalReviewSource(i: ReviewSnapshotInput): string {
  const decisions: ReviewDecision[] = [];
  for (const d of i.context?.decisions ?? []) {
    const label = (d?.label ?? "").trim();
    const value = (d?.value ?? "").trim();
    if (!label || !value) continue;
    decisions.push({ label, value });
  }
  return JSON.stringify({
    v: REVIEW_SOURCE_VERSION,
    type: (i.documentType ?? "").trim(),
    title: (i.documentTitle ?? "").trim() || "Документ",
    version: (i.documentVersion ?? "").trim(),
    role: (i.context?.role ?? "").trim(),
    ignorePersonalData: i.ignorePersonalData === true,
    decisions,
    text: i.documentText.trim(),
  });
}

export async function computeReviewSourceDigest(i: ReviewSnapshotInput): Promise<string> {
  const buf = new TextEncoder().encode(canonicalReviewSource(i));
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Синхронен ключ на текущата снимка (без хеширане) — с него UI-ът решава ВЕДНАГА,
 * още при рисуването, дали показаният резултат се отнася за текущия вход.
 * Обхватът на потребителя влиза в ключа: чужд/изтекъл резултат не се показва.
 */
export function reviewIdentityKey(i: ReviewSnapshotInput & { userScope?: string | null }): string {
  return JSON.stringify({ scope: i.userScope ?? "", src: canonicalReviewSource(i) });
}

export type ReviewTrust = "verified" | "unverified" | "mismatched";

export interface ReviewTrustState {
  trust: ReviewTrust;
  /** Може ли изобщо да се показва присъда като отнасяща се за текущия текст. */
  showVerdict: boolean;
  notice: string | null;
}

/**
 * Строго: приемаме резултата САМО при точно съвпадение на отпечатъка на
 * ЗАЯВЕНАТА снимка, която е и текущата.
 */
export function assessReviewTrust(input: {
  responseSource?: { v?: string; digest?: string } | null;
  expectedDigest: string;
  /** Резултатът е от текущия вход (ключът не се е променил). */
  currentInput?: boolean;
}): ReviewTrustState {
  const src = input.responseSource;
  if (input.currentInput === false) {
    return {
      trust: "mismatched",
      showVerdict: false,
      notice: "Документът е променен след тази проверка. Резултатът не се отнася за текущия текст.",
    };
  }
  if (!src || typeof src.digest !== "string" || !src.digest || src.v !== REVIEW_SOURCE_VERSION) {
    return {
      trust: "unverified",
      showVerdict: false,
      notice: "Този резултат не може да бъде свързан с текущия документ. Направете нова проверка.",
    };
  }
  if (!input.expectedDigest || src.digest !== input.expectedDigest) {
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
  if (!c) {
    return "Проверката не съобщава колко от документа е обхванала. Резултатът не се представя като окончателен.";
  }
  if (c.status === "complete") return null;
  if (c.status === "incomplete") {
    if ((c.reasons ?? []).includes("input_truncated")) {
      return "Документът е по-дълъг от обхвата на проверката — прегледана е само част от текста. Потвърдените находки остават видими.";
    }
    return "Част от проверката не е завършена. Потвърдените находки остават видими.";
  }
  return "Част от констатациите не са потвърдени с откъс от текста и не се представят като установени факти.";
}

/** „Готово" изисква ИЗРИЧНО потвърдена пълна проверка — липсваща метаинформация не е доказателство. */
export function canShowReady(input: {
  verdict: string;
  completeness?: ReviewCompleteness | null;
  trust: ReviewTrust;
}): boolean {
  if (input.trust !== "verified") return false;
  if (!input.completeness || input.completeness.status !== "complete") return false;
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
