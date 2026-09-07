/**
 * Activation continuity — каноничен модел за чернова на документ.
 *
 * Проблемът: анонимен потребител, дошъл от SEO/шаблон/`/start`, губеше избора,
 * отговорите и генерирания резултат при вход или регистрация (пренасочване към
 * `/account`, презаписан глобален ключ в билдъра, нов таб от имейл линка).
 *
 * Модел (един за wizard и build):
 *
 *   localStorage `activation_draft_v1`   → САМО указател, без лични данни
 *   sessionStorage `…payload:<draftId>`  → съдържанието за текущия таб
 *   public.anonymous_drafts (сървър)     → същото съдържание, защитено с токен
 *
 * Указателят никога не съдържа отговори, имена, ЕГН или IBAN — той пази само
 * идентификатор, еднократен claim токен, маршрут, вид документ и срок.
 *
 * Достъп до сървърната чернова:
 *   - непотърсена → само с claim токена (в указателя);
 *   - присвоена   → само с JWT на собственика; токенът се маха от браузъра.
 */
import { getVariant } from "@/lib/ab";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { getDocumentContext, isValidFunnelId } from "@/lib/funnelContext";
import { isSafeRoute, sanitizeDraftRoute, safeReturnPath } from "@/lib/safeRoute";


export { isSafeRoute, sanitizeDraftRoute } from "@/lib/safeRoute";

export const DRAFT_POINTER_KEY = "activation_draft_v1";
export const DRAFT_PAYLOAD_PREFIX = "activation_draft_payload_v1:";
const TAB_ID_KEY = "activation_draft_tab_v1";
const LEGACY_STAGE_PREFIX = DRAFT_PAYLOAD_PREFIX + "legacy:";

/**
 * Резервен идентификатор за съдържание в текущия таб, когато сървърът още не е
 * върнал draft_id (или е недостъпен). Гарантира, че refresh не губи прогреса
 * дори при неуспешна синхронизация.
 */
export const LOCAL_DRAFT_ID = "local";

/** Анонимна чернова живее 24 часа (после сървърът я изтрива). */
export const ANON_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Присвоена, но недовършена чернова остава при собственика си 30 дни. */
export const CLAIMED_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type DraftFlow = "wizard" | "build";

export interface DraftPointer {
  draftId: string;
  /** Еднократен токен за непотърсена чернова. Празен след присвояване. */
  claimToken: string;
  flow: DraftFlow;
  docKey?: string;
  /** Относителен маршрут, към който да се върнем след вход. */
  route: string;
  stepIdx: number;
  hasResult: boolean;
  /** Таб, който последно е писал (за разпознаване на дублиран таб). */
  tabId: string;
  ts: number;
  expiresAt: number;
  /** true след присвояване — записът върви само с JWT на собственика. */
  claimed: boolean;
  /** Идентификатор в „Моите документи" след прехвърляне на готовия резултат. */
  savedDocId?: string;
  /**
   * Непрозрачни аналитични идентификатори (Stage 2a2) — само за непрекъснатост
   * на фунията при нов таб / имейл линк / OAuth. НЕ са браузърен или табов
   * идентификатор и никога не носят съдържание на документ или лични данни.
   * Старите указатели без тези полета остават валидни.
   */
  journeyId?: string;
  runId?: string;
}

/**
 * Атрибуцията е неделима двойка: използваема е само когато и двата
 * идентификатора минават проверката. Частична или подправена двойка се
 * отхвърля изцяло — никога не се смесва стар journey с текущ run.
 */
function validPair(
  journeyId: unknown,
  runId: unknown,
): { journeyId: string; runId: string } | null {
  if (!isValidFunnelId(journeyId) || !isValidFunnelId(runId)) return null;
  return { journeyId: journeyId as string, runId: runId as string };
}


/** Съдържанието с лични данни — НИКОГА в localStorage. */
export interface DraftPayload {
  answers?: Record<string, unknown>;
  result?: unknown;
  signature?: unknown;
  meta?: Record<string, unknown>;
}

/** Типизирани причини за отказ от сървъра — едно към едно с `_shared/draft-auth.ts`. */
export type DraftErrorReason =
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "expired"
  | "invalid_token"
  | "unauthorized"
  | "different_owner"
  | "already_claimed"
  | "network";

const KNOWN_REASONS: ReadonlySet<string> = new Set<DraftErrorReason>([
  "invalid_request",
  "payload_too_large",
  "rate_limited",
  "expired",
  "invalid_token",
  "unauthorized",
  "different_owner",
  "already_claimed",
  "network",
]);

/** Преходни причини — има смисъл от повторен опит със същия указател. */
export function isTransientDraftReason(reason: DraftErrorReason): boolean {
  return reason === "network" || reason === "rate_limited";
}

/**
 * Причини, при които текущият указател е окончателно невалиден за този
 * браузър/потребител: изчистваме го и започваме нова чернова.
 */
export function isDetachDraftReason(reason: DraftErrorReason): boolean {
  return (
    reason === "expired" ||
    reason === "invalid_token" ||
    reason === "different_owner" ||
    reason === "already_claimed" ||
    reason === "unauthorized"
  );
}

/**
 * Превежда HTTP отговор от edge функция в типизирана причина. Никога не връща
 * суровия текст на грешката — само каноничен код.
 */
export function reasonFromResponse(
  data: { reason?: unknown; ok?: unknown } | null | undefined,
  error: { status?: number } | null | undefined,
): DraftErrorReason {
  const r = data && typeof data.reason === "string" ? data.reason : "";
  if (KNOWN_REASONS.has(r)) return r as DraftErrorReason;
  const status = error?.status;
  if (status === 401) return "unauthorized";
  if (status === 403) return "invalid_token";
  if (status === 404 || status === 410) return "expired";
  if (status === 409) return "already_claimed";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status === 400) return "invalid_request";
  return "network";
}

/* ------------------------------- Feature flag ------------------------------ */

/**
 * Rollout зад A/B рамката (`?ab_activation_continuity=variant` форсира само за
 * текущия таб — за QA/ботове). „variant“ = новото поведение.
 */
export function isActivationContinuityEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return getVariant("activation_continuity") === "variant";
  } catch {
    return false;
  }
}

/* --------------------------------- Помощни -------------------------------- */

/** Текущият маршрут на страницата, изчистен от технически параметри. */
export function currentDraftRoute(): string {
  if (typeof window === "undefined") return "/";
  return safeReturnPath(window.location.pathname + window.location.search, "/");
}

export function getTabId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const id = randomId();
    sessionStorage.setItem(TAB_ID_KEY, id);
    return id;
  } catch {
    return "no-storage";
  }
}

function randomId(): string {
  try {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

const CLAIM_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

function isPointer(value: unknown): value is DraftPointer {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (typeof p.draftId !== "string" || typeof p.claimToken !== "string") return false;
  if (!(p.flow === "wizard" || p.flow === "build")) return false;
  if (!isSafeRoute(p.route) || typeof p.expiresAt !== "number") return false;
  // Инвариант: непотърсена чернова се оторизира само с токен; присвоената —
  // само със сесията на собственика (токенът е ротиран и не се пази).
  return p.claimed === true ? true : CLAIM_TOKEN_RE.test(p.claimToken);
}

/* -------------------------------- Указател -------------------------------- */

export function readPointer(now: number = Date.now()): DraftPointer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_POINTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPointer(parsed)) {
      clearPointer();
      return null;
    }
    if (parsed.expiresAt <= now) {
      clearDraft(parsed.draftId);
      return null;
    }
    const p = parsed as DraftPointer & { claimed?: unknown; savedDocId?: unknown };
    return {
      ...parsed,
      route: safeReturnPath(parsed.route, "/"),
      stepIdx: typeof parsed.stepIdx === "number" ? parsed.stepIdx : 0,
      hasResult: !!parsed.hasResult,
      tabId: typeof parsed.tabId === "string" ? parsed.tabId : "",
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
      claimed: p.claimed === true,
      savedDocId: typeof p.savedDocId === "string" ? p.savedDocId : undefined,
      // Подправена или частична атрибуция се изхвърля цялата — черновата остава.
      journeyId: validPair(p.journeyId, p.runId)?.journeyId,
      runId: validPair(p.journeyId, p.runId)?.runId,

    };

  } catch {
    return null;
  }
}

export function writePointer(pointer: DraftPointer): void {
  if (typeof window === "undefined") return;
  try {
    // Защитна мрежа: в указателя не влиза нищо освен изброените полета.
    const claimed = pointer.claimed === true;
    const safe: DraftPointer = {
      draftId: pointer.draftId,
      // След присвояване токенът не се пази никъде в браузъра.
      claimToken: claimed ? "" : pointer.claimToken,
      flow: pointer.flow,
      docKey: pointer.docKey ? String(pointer.docKey).slice(0, 120) : undefined,
      route: safeReturnPath(pointer.route, "/"),
      stepIdx: Number.isFinite(pointer.stepIdx) ? Math.max(0, Math.trunc(pointer.stepIdx)) : 0,
      hasResult: !!pointer.hasResult,
      tabId: pointer.tabId || getTabId(),
      ts: pointer.ts || Date.now(),
      expiresAt: pointer.expiresAt,
      claimed,
      savedDocId: typeof pointer.savedDocId === "string" && pointer.savedDocId ? pointer.savedDocId : undefined,
      // Само непрозрачни идентификатори, генерирани от funnelContext.
      journeyId: validPair(pointer.journeyId, pointer.runId)?.journeyId,
      runId: validPair(pointer.journeyId, pointer.runId)?.runId,


    };
    localStorage.setItem(DRAFT_POINTER_KEY, JSON.stringify(safe));
  } catch {
    /* private mode / quota — продължаваме само с паметта на таба */
  }
}

export function clearPointer(): void {
  try {
    localStorage.removeItem(DRAFT_POINTER_KEY);
  } catch { /* ignore */ }
}

/** Маха само съдържанието на дадена чернова от таба (указателят остава). */
export function removePayload(draftId: string): void {
  try {
    sessionStorage.removeItem(DRAFT_PAYLOAD_PREFIX + draftId);
  } catch { /* ignore */ }
}

export function clearDraft(draftId?: string): void {
  clearPointer();
  if (!draftId) return;
  removePayload(draftId);
}

/**
 * Изчиства всичко по черновата от браузъра — указател и всяко съдържание в
 * таба (вкл. резервното и стажираните стари чернови). Вика се при изход.
 */
export function clearAllDraftStorage(): void {
  clearPointer();
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(DRAFT_PAYLOAD_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch { /* ignore */ }
}

/** true, ако указателят е бил записан от друг таб (дублиран таб). */
export function isForeignTab(pointer: DraftPointer | null): boolean {
  if (!pointer || !pointer.tabId) return false;
  return pointer.tabId !== getTabId();
}

/* --------------------------------- Payload -------------------------------- */

/** Има ли в съдържанието нещо за възстановяване (а не празен обект)? */
export function hasRestorableContent(payload: DraftPayload | null | undefined): payload is DraftPayload {
  if (!payload || typeof payload !== "object") return false;
  if (payload.result) return true;
  if (payload.signature) return true;
  if (payload.answers && Object.keys(payload.answers).length > 0) return true;
  if (payload.meta && Object.keys(payload.meta).length > 0) return true;
  return false;
}

function hasNonEmptyValue(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  return Object.values(obj as Record<string, unknown>).some((v) => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number" || typeof v === "boolean") return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return hasNonEmptyValue(v);
    return false;
  });
}

/**
 * Има ли в съдържанието нещо, което потребителят реално е въвел?
 *
 * По-строго от `hasRestorableContent`: снапшотът при отваряне на екрана носи
 * служебни полета (тип документ, версия, стъпка 0) и не бива да създава
 * чернова, да презаписва вече запазено съдържание или да блокира
 * възстановяването след присвояване.
 */
export function hasUserContent(
  payload: DraftPayload | null | undefined,
  stepIdx = 0,
): payload is DraftPayload {
  if (!payload || typeof payload !== "object") return false;
  if (payload.result) return true;
  if (stepIdx > 0) return true;
  if (hasNonEmptyValue(payload.answers)) return true;
  if (hasNonEmptyValue(payload.signature)) return true;
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  if (typeof meta.savedDocId === "string" && meta.savedDocId) return true;
  if (typeof meta.customTitle === "string" && meta.customTitle.trim()) return true;
  if (typeof meta.name === "string" && meta.name.trim()) return true;
  if (typeof meta.stepIdx === "number" && meta.stepIdx > 0) return true;
  for (const key of ["partiesA", "partiesB"]) {
    const v = meta[key];
    if (typeof v === "string" ? v.trim().length > 0 : hasNonEmptyValue(v)) return true;
  }
  return false;
}

export function readPayload(draftId: string): DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_PAYLOAD_PREFIX + draftId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as DraftPayload) : null;
  } catch {
    return null;
  }
}

/** Записва съдържанието в таба; връща true само ако записът е потвърден. */
export function writePayload(draftId: string, payload: DraftPayload): boolean {
  if (typeof window === "undefined") return false;
  try {
    const serialized = JSON.stringify(payload);
    sessionStorage.setItem(DRAFT_PAYLOAD_PREFIX + draftId, serialized);
    return sessionStorage.getItem(DRAFT_PAYLOAD_PREFIX + draftId) === serialized;
  } catch {
    return false;
  }
}

/* ------------------------------ Сървърна част ----------------------------- */

interface SyncResponse {
  ok?: boolean;
  reason?: string;
  draft_id?: string;
  claim_token?: string;
  expires_at?: string;
  claimed?: boolean;
  transferred?: boolean;
}

/** Стойности, с които викащият „презарежда“ резултата с по-ново състояние. */
export interface SyncCommitOverrides {
  /** Най-новото съдържание в таба (по-ново от изпратеното). */
  payload?: DraftPayload;
  stepIdx?: number;
  hasResult?: boolean;
  route?: string;
}

/** Условия, при които закъснял резултат още има право да пише в хранилището. */
export interface SyncCommitOptions {
  /**
   * Записва само ако хранилището е още в същото състояние, с което е тръгнала
   * заявката:
   *  - при update (изпратен указател) — хранилището още сочи СЪЩАТА чернова от
   *    същия поток; преминаване към „присвоена“ е допустимо (сливаемо е и
   *    токенът никога не се връща);
   *  - при изричен create — снимката на запазения указател (включително чужд
   *    поток, който новата чернова умишлено измества) е непроменена. Ако друг
   *    таб я е заменил или обновил, `commit` връща `null`.
   */
  requireCurrent?: boolean;
}

/**
 * Снимка на съществените полета на указателя — за разпознаване „друг таб го е
 * заменил или обновил“, без да реагираме на самата отметка за време.
 */
function pointerSnapshot(p: DraftPointer | null): string | null {
  if (!p) return null;
  return [
    p.draftId,
    p.flow,
    p.claimed ? "1" : "0",
    p.stepIdx,
    p.hasResult ? "1" : "0",
    p.route,
    p.savedDocId ?? "",
    p.tabId,
    // Атрибуцията също е част от снимката: закъснял запис не бива да замести
    // по-нова атрибуция със старата си.
    p.journeyId ?? "",
    p.runId ?? "",
  ].join("|");

}

export type SyncResult =
  | {
      ok: true;
      pointer: DraftPointer;
      created: boolean;
      /**
       * Прилага указателя и съдържанието в хранилището. Извиква се само когато
       * резултатът още е актуален; връща реално записания указател или `null`,
       * ако при `requireCurrent` хранилището вече сочи друга чернова.
       */
      commit: (overrides?: SyncCommitOverrides, opts?: SyncCommitOptions) => DraftPointer | null;
    }
  | { ok: false; reason: DraftErrorReason };


/**
 * Сглобява указателя от отговора на сървъра спрямо ТЕКУЩО запазения указател.
 *
 * Присвояването е необратимо: закъснял отговор никога не връща токена в
 * браузъра и не сваля флага. Флагът се пренася само за СЪЩАТА чернова — ако
 * сървърът е върнал нов идентификатор, статусът му е неизвестен и указателят
 * започва като непотърсен (с новия токен).
 */
function buildSyncPointer(args: {
  sent: DraftPointer | null;
  data: SyncResponse;
  flow: DraftFlow;
  docKey?: string;
  route: string;
  stepIdx: number;
  hasResult: boolean;
}): { pointer: DraftPointer; created: boolean } {
  const { sent, data } = args;
  const draftId = String(data.draft_id);
  const stored = readPointer();
  const sameAsSent = sent?.draftId === draftId;
  const storedSame = stored?.draftId === draftId ? stored : null;
  const claimed =
    data.claimed === true || (sameAsSent && sent?.claimed === true) || storedSame?.claimed === true;
  const ttl = claimed ? CLAIMED_DRAFT_TTL_MS : ANON_DRAFT_TTL_MS;
  const expiresAt = Math.max(
    Date.parse(data.expires_at || "") || Date.now() + ttl,
    claimed ? storedSame?.expiresAt ?? 0 : 0,
  );
  // Атрибуцията е неделима двойка: пази се само ако и двата идентификатора са
  // валидни; иначе се взема цялата двойка от един снимък на текущия контекст.
  const existingPair =
    validPair(storedSame?.journeyId, storedSame?.runId) ??
    (sameAsSent ? validPair(sent?.journeyId, sent?.runId) : null);
  const ctx = existingPair ? null : getDocumentContext();
  const pair = existingPair ?? validPair(ctx?.journey_id, ctx?.run_id);

  return {
    created: !sameAsSent,
    pointer: {
      draftId,
      claimToken: claimed ? "" : data.claim_token || (sameAsSent ? sent?.claimToken : "") || "",
      flow: args.flow,
      docKey: args.docKey,
      route: args.route,
      stepIdx: args.stepIdx,
      hasResult: args.hasResult || storedSame?.hasResult === true,
      tabId: getTabId(),
      ts: Date.now(),
      expiresAt,
      claimed,
      savedDocId: storedSame?.savedDocId ?? (sameAsSent ? sent?.savedDocId : undefined),
      journeyId: pair?.journeyId,
      runId: pair?.runId,

    },

  };
}

/**
 * Създава или обновява черновата на сървъра.
 *
 * - без указател → изричен create (нова чернова; токенът се връща само тогава);
 * - непотърсен указател → update с токена;
 * - присвоен указател → update само с JWT (supabase-js го добавя сам).
 *
 * Отказ от сървъра се връща като типизирана причина — викащият решава дали да
 * опита пак (network/rate_limited) или да започне нова чернова (expired,
 * invalid_token, different_owner…). Никога не създаваме тихо дубликат тук.
 *
 * `opts.commit === false` изключва автоматичния запис в хранилището: тогава
 * викащият проверява дали отговорът не е остарял и сам вика `res.commit(...)`
 * с най-новото състояние. Записът се сглобява в момента на commit-а, така че
 * присвояване, случило се междувременно, не се губи.
 */
export async function syncDraft(
  input: {
    pointer: DraftPointer | null;
    flow: DraftFlow;
    docKey?: string;
    route: string;
    stepIdx: number;
    payload: DraftPayload;
    hasResult: boolean;
  },
  opts: { commit?: boolean } = {},
): Promise<SyncResult> {
  const p = input.pointer;
  // Снимка на хранилището в момента на изпращане — по нея решаваме дали
  // закъснял резултат още има право да пише (виж `SyncCommitOptions`).
  const startedSnapshot = pointerSnapshot(readPointer());
  const route = safeReturnPath(input.route, "/");
  const body: Record<string, unknown> = {
    flow: input.flow,
    doc_key: input.docKey ?? null,
    route,
    step_idx: input.stepIdx,
    has_result: input.hasResult,
    payload: input.payload,
  };
  if (p) {
    body.draft_id = p.draftId;
    // Токенът пътува само докато черновата е непотърсена.
    if (!p.claimed && p.claimToken) body.claim_token = p.claimToken;
  }

  try {
    const { data, error } = await invokeEdgeFunction<SyncResponse>("draft-sync", { body, retries: 1 });
    if (error || !data || data.ok === false || !data.draft_id) {
      return { ok: false, reason: reasonFromResponse(data, error) };
    }

    const preview = buildSyncPointer({
      sent: p,
      data,
      flow: input.flow,
      docKey: input.docKey,
      route,
      stepIdx: input.stepIdx,
      hasResult: input.hasResult,
    });

    const commit = (
      overrides: SyncCommitOverrides = {},
      commitOpts: SyncCommitOptions = {},
    ): DraftPointer | null => {
      if (commitOpts.requireCurrent) {
        const stored = readPointer();
        if (p) {
          // Update: хранилището още трябва да сочи ИЗПРАТЕНАТА чернова от този
          // поток. Преминаването към „присвоена“ е допустимо — сливаемо е.
          const relevant = stored && stored.flow === input.flow ? stored : null;
          if ((relevant?.draftId ?? null) !== p.draftId) return null;
        } else if (pointerSnapshot(stored) !== startedSnapshot) {
          // Изричен create: измества само точно онзи указател, който е бил
          // запазен при изпращането. Ако друг таб го е заменил или обновил,
          // резултатът е остарял.
          return null;
        }
      }
      const built = buildSyncPointer({
        sent: p,
        data,
        flow: input.flow,
        docKey: input.docKey,
        route: overrides.route ? safeReturnPath(overrides.route, route) : route,
        stepIdx: overrides.stepIdx ?? input.stepIdx,
        hasResult: overrides.hasResult ?? input.hasResult,
      });
      const payload = overrides.payload ?? input.payload;
      writePointer(built.pointer);
      writePayload(built.pointer.draftId, payload);
      // Сървърният запис е потвърден — резервният слот на таба и съдържанието
      // под стария идентификатор вече не са нужни.
      removePayload(LOCAL_DRAFT_ID);
      if (p && p.draftId !== built.pointer.draftId) removePayload(p.draftId);
      return built.pointer;
    };

    if (opts.commit === false) {
      return { ok: true, pointer: preview.pointer, created: preview.created, commit };
    }
    const pointer = commit();
    return { ok: true, pointer: pointer ?? preview.pointer, created: preview.created, commit };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Условно изчистване: маха указателя само ако той още сочи ОЧАКВАНАТА чернова.
 *
 * Пази срещу закъснял отговор/грешка за чернова A, която иначе би изтрила вече
 * заменения указател на чернова B. Съдържанието на таба се пази в резервния
 * слот (`LOCAL_DRAFT_ID`), за да не се губи въведеното.
 *
 * Буквално „само ако текущият е очакваният“: липсващ указател (изрично
 * отказване, друг таб) също е разминаване — тогава нищо не се пипа и резервно
 * копие НЕ се създава, за да не възкръсне отказан документ.
 *
 * `requireUnclaimed` пази и третия случай: същата чернова, но междувременно
 * присвоена (успешен claim, докато записът е пътувал) — тогава не пипаме нищо.
 */
export function clearDraftIfCurrent(
  expectedDraftId: string,
  opts: { keepPayload?: DraftPayload | null; requireUnclaimed?: boolean } = {},
): boolean {
  const stored = readPointer();
  if (!stored || stored.draftId !== expectedDraftId) return false;
  if (opts.requireUnclaimed && stored.claimed) return false;
  const payload = opts.keepPayload ?? readPayload(expectedDraftId);
  if (hasRestorableContent(payload)) writePayload(LOCAL_DRAFT_ID, payload);
  clearDraft(expectedDraftId);
  return true;
}


/** Максимум опити за присвояване при преходна грешка (на монтиране/сесия). */
export const MAX_CLAIM_ATTEMPTS = 5;
const CLAIM_RETRY_BASE_MS = 1000;
const CLAIM_RETRY_CAP_MS = 30_000;

/**
 * Изчакване преди повторен опит за присвояване: ограничен експоненциален
 * backoff с малък jitter. Чиста функция — `rand` се подава в тестовете.
 */
export function claimRetryDelay(attempt: number, rand: () => number = Math.random): number {
  const n = Math.max(1, Math.trunc(attempt));
  const base = Math.min(CLAIM_RETRY_CAP_MS, CLAIM_RETRY_BASE_MS * 2 ** (n - 1));
  return base + Math.floor(Math.min(1, Math.max(0, rand())) * 250);
}


export interface ClaimResult {
  ok: boolean;
  reason?: DraftErrorReason;
  route?: string;
  flow?: DraftFlow;
  docKey?: string;
  stepIdx?: number;
  hasResult?: boolean;
  payload?: DraftPayload;
  savedDocId?: string;
  /** Съдържанието вече е прехвърлено в „Моите документи" и е изтрито от черновата. */
  purged?: boolean;
  expiresAt?: number;
}

interface ClaimResponse {
  ok?: boolean;
  reason?: string;
  route?: string;
  flow?: DraftFlow;
  doc_key?: string | null;
  step_idx?: number;
  has_result?: boolean;
  payload?: DraftPayload | null;
  saved_doc_id?: string | null;
  purged?: boolean;
  expires_at?: string;
}

/**
 * Присвоява черновата към влезлия потребител (или, за вече присвоена от него,
 * връща съдържанието идемпотентно). Не логва нищо от отговора.
 */
export async function claimDraft(pointer: DraftPointer): Promise<ClaimResult> {
  try {
    const body: Record<string, unknown> = { draft_id: pointer.draftId };
    if (!pointer.claimed && pointer.claimToken) body.claim_token = pointer.claimToken;
    const { data, error } = await invokeEdgeFunction<ClaimResponse>("draft-claim", { body, retries: 1 });
    if (error || !data || !data.ok) {
      return { ok: false, reason: reasonFromResponse(data, error) };
    }
    const payload = hasRestorableContent(data.payload ?? undefined) ? (data.payload as DraftPayload) : undefined;
    return {
      ok: true,
      route: safeReturnPath(data.route, pointer.route),
      flow: data.flow ?? pointer.flow,
      docKey: data.doc_key ?? pointer.docKey,
      stepIdx: typeof data.step_idx === "number" ? data.step_idx : pointer.stepIdx,
      hasResult: typeof data.has_result === "boolean" ? data.has_result : pointer.hasResult,
      payload,
      savedDocId: data.saved_doc_id ?? undefined,
      purged: data.purged === true,
      expiresAt: Date.parse(data.expires_at || "") || undefined,
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * След прехвърляне източникът на истина е `saved_documents` (RLS: само
 * собственикът). Връща съдържанието в същата форма като черновата или null.
 */
export async function loadSavedDraftPayload(savedDocId: string): Promise<DraftPayload | null> {
  try {
    const { data, error } = await supabase
      .from("saved_documents")
      .select("payload")
      .eq("id", savedDocId)
      .maybeSingle();
    if (error || !data) return null;
    const payload = data.payload as unknown;
    if (!payload || typeof payload !== "object") return null;
    const p = payload as DraftPayload;
    return hasRestorableContent(p) ? p : null;
  } catch {
    return null;
  }
}

/* ------------------------- Миграция от стари ключове ----------------------- */

const LEGACY_BUILD_KEY = "build:custom-contract";
const LEGACY_WIZARD_PREFIX = "wizard:";

export interface LegacyDraft {
  flow: DraftFlow;
  key: string;
  payload: DraftPayload;
  stepIdx: number;
  hasResult: boolean;
  docKey?: string;
}

function parseLegacy(key: string, raw: string): LegacyDraft | null {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") return null;
  const flow: DraftFlow = key === LEGACY_BUILD_KEY ? "build" : "wizard";
  return {
    flow,
    key,
    docKey: flow === "wizard" ? key.slice(LEGACY_WIZARD_PREFIX.length) : (parsed.name as string | undefined),
    stepIdx: typeof parsed.stepIdx === "number" ? parsed.stepIdx : 0,
    hasResult: !!parsed.result,
    payload: {
      answers: (parsed.answers as Record<string, unknown> | undefined) ?? undefined,
      result: parsed.result,
      signature: parsed.signature,
      meta: parsed,
    },
  };
}

/** Стажира стара чернова в таба; true само ако копието е потвърдено. */
function stageLegacy(draft: LegacyDraft): boolean {
  try {
    const serialized = JSON.stringify(draft);
    sessionStorage.setItem(LEGACY_STAGE_PREFIX + draft.key, serialized);
    return sessionStorage.getItem(LEGACY_STAGE_PREFIX + draft.key) === serialized;
  } catch {
    return false;
  }
}

function readStagedLegacy(): LegacyDraft[] {
  const out: LegacyDraft[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(LEGACY_STAGE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(sessionStorage.getItem(k) ?? "") as LegacyDraft;
        if (parsed && (parsed.flow === "wizard" || parsed.flow === "build") && parsed.payload) out.push(parsed);
      } catch {
        sessionStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * Пренася старите локални чернови (с лични данни) към каноничния модел БЕЗ
 * загуба: всяка се копира в таба (sessionStorage), копието се проверява и
 * едва тогава старият ключ се маха от localStorage. При неуспешно копие
 * (квота, изключено хранилище) старият ключ остава — единственото копие не се
 * унищожава. Повреден запис (не е JSON) няма какво да губи и се изтрива.
 *
 * Връща всички налични стари чернови — и току-що пренесените, и стажираните
 * от предишно зареждане, за които сървърният запис още не е потвърден.
 */
export function takeLegacyDrafts(): LegacyDraft[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === LEGACY_BUILD_KEY || k.startsWith(LEGACY_WIZARD_PREFIX)) keys.push(k);
    }
  } catch {
    return readStagedLegacy();
  }

  const fresh: LegacyDraft[] = [];
  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (!raw) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      continue;
    }
    let draft: LegacyDraft | null = null;
    try {
      draft = parseLegacy(key, raw);
    } catch {
      // Повреден запис — няма какво да се пренесе.
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      continue;
    }
    if (!draft) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      continue;
    }
    fresh.push(draft);
    if (stageLegacy(draft)) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  }

  const staged = readStagedLegacy().filter((s) => !fresh.some((f) => f.key === s.key));
  return [...staged, ...fresh];
}

/** Маха стажираните стари чернови след потвърден сървърен запис. */
export function clearStagedLegacyDrafts(flow?: DraftFlow): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(LEGACY_STAGE_PREFIX)) continue;
      if (!flow) {
        keys.push(k);
        continue;
      }
      const legacyKey = k.slice(LEGACY_STAGE_PREFIX.length);
      const keyFlow: DraftFlow = legacyKey === LEGACY_BUILD_KEY ? "build" : "wizard";
      if (keyFlow === flow) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch { /* ignore */ }
}

/** Изтрива всички стари ключове без да чете съдържанието (privacy cleanup). */
export function purgeLegacyDrafts(): number {
  return takeLegacyDrafts().length;
}
