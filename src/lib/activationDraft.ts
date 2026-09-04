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
 */
import { getVariant } from "@/lib/ab";
import { supabase } from "@/integrations/supabase/client";

export const DRAFT_POINTER_KEY = "activation_draft_v1";
export const DRAFT_PAYLOAD_PREFIX = "activation_draft_payload_v1:";
const TAB_ID_KEY = "activation_draft_tab_v1";

/** Анонимна чернова живее 24 часа (после сървърът я изтрива). */
/**
 * Резервен идентификатор за съдържание в текущия таб, когато сървърът още не е
 * върнал draft_id (или е недостъпен). Гарантира, че refresh не губи прогреса
 * дори при неуспешна синхронизация.
 */
export const LOCAL_DRAFT_ID = "local";

export const ANON_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type DraftFlow = "wizard" | "build";

export interface DraftPointer {
  draftId: string;
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
}

/** Съдържанието с лични данни — НИКОГА в localStorage. */
export interface DraftPayload {
  answers?: Record<string, unknown>;
  result?: unknown;
  signature?: unknown;
  meta?: Record<string, unknown>;
}

/* ------------------------------- Feature flag ------------------------------ */

/**
 * Rollout зад съществуващата A/B рамка (`?ab_activation_continuity=variant`
 * форсира включване за QA/ботове). „variant“ = новото поведение.
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

/**
 * Само относителни пътища — предпазва от open redirect след вход.
 * Началната страница („/") е допустима: тя е резервният маршрут, когато
 * подаденият път е бил отхвърлен.
 */
export function isSafeRoute(route: unknown): route is string {
  return typeof route === "string" && (route === "/" || /^\/[^/\\]/.test(route));
}

/**
 * Маршрутът, който пазим в указателя, съдържа само параметрите на документа.
 * Технически ключове за тестове (ab_*, utm_*, debug) се премахват, за да не
 * се връща потребителят в експериментален вариант след вход.
 */
export function sanitizeDraftRoute(
  pathname: string,
  search: string,
): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return pathname;
  }
  for (const key of [...params.keys()]) {
    if (/^(ab_|utm_|debug$|gclid$|fbclid$)/i.test(key)) params.delete(key);
  }
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/** Текущият маршрут на страницата, изчистен от технически параметри. */
export function currentDraftRoute(): string {
  if (typeof window === "undefined") return "/";
  return sanitizeDraftRoute(window.location.pathname, window.location.search);
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

function isPointer(value: unknown): value is DraftPointer {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.draftId === "string" &&
    typeof p.claimToken === "string" &&
    (p.flow === "wizard" || p.flow === "build") &&
    isSafeRoute(p.route) &&
    typeof p.expiresAt === "number"
  );
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
    return {
      ...parsed,
      stepIdx: typeof parsed.stepIdx === "number" ? parsed.stepIdx : 0,
      hasResult: !!parsed.hasResult,
      tabId: typeof parsed.tabId === "string" ? parsed.tabId : "",
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
    };
  } catch {
    return null;
  }
}

export function writePointer(pointer: DraftPointer): void {
  if (typeof window === "undefined") return;
  try {
    // Защитна мрежа: в указателя не влиза нищо освен изброените полета.
    const safe: DraftPointer = {
      draftId: pointer.draftId,
      claimToken: pointer.claimToken,
      flow: pointer.flow,
      docKey: pointer.docKey ? String(pointer.docKey).slice(0, 120) : undefined,
      route: isSafeRoute(pointer.route) ? pointer.route : "/",
      stepIdx: Number.isFinite(pointer.stepIdx) ? Math.max(0, Math.trunc(pointer.stepIdx)) : 0,
      hasResult: !!pointer.hasResult,
      tabId: pointer.tabId || getTabId(),
      ts: pointer.ts || Date.now(),
      expiresAt: pointer.expiresAt,
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

export function clearDraft(draftId?: string): void {
  clearPointer();
  if (!draftId) return;
  try {
    sessionStorage.removeItem(DRAFT_PAYLOAD_PREFIX + draftId);
  } catch { /* ignore */ }
}

/** true, ако указателят е бил записан от друг таб (дублиран таб). */
export function isForeignTab(pointer: DraftPointer | null): boolean {
  if (!pointer || !pointer.tabId) return false;
  return pointer.tabId !== getTabId();
}

/* --------------------------------- Payload -------------------------------- */

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

export function writePayload(draftId: string, payload: DraftPayload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DRAFT_PAYLOAD_PREFIX + draftId, JSON.stringify(payload));
  } catch { /* ignore */ }
}

/* ------------------------------ Сървърна част ----------------------------- */

interface SyncResponse {
  draft_id: string;
  claim_token?: string;
  expires_at: string;
}

/**
 * Създава (или обновява) чернова на сървъра. Токенът се генерира от сървъра и
 * се връща само при създаване.
 */
export async function syncDraft(input: {
  pointer: DraftPointer | null;
  flow: DraftFlow;
  docKey?: string;
  route: string;
  stepIdx: number;
  payload: DraftPayload;
  hasResult: boolean;
}): Promise<DraftPointer | null> {
  const body = {
    draft_id: input.pointer?.draftId,
    claim_token: input.pointer?.claimToken,
    flow: input.flow,
    doc_key: input.docKey ?? null,
    route: isSafeRoute(input.route) ? input.route : "/",
    step_idx: input.stepIdx,
    has_result: input.hasResult,
    payload: input.payload,
  };
  const { data, error } = await supabase.functions.invoke<SyncResponse>("draft-sync", { body });
  if (error || !data?.draft_id) return null;
  const expiresAt = Date.parse(data.expires_at || "") || Date.now() + ANON_DRAFT_TTL_MS;
  const pointer: DraftPointer = {
    draftId: data.draft_id,
    claimToken: data.claim_token || input.pointer?.claimToken || "",
    flow: input.flow,
    docKey: input.docKey,
    route: input.route,
    stepIdx: input.stepIdx,
    hasResult: input.hasResult,
    tabId: getTabId(),
    ts: Date.now(),
    expiresAt,
  };
  writePointer(pointer);
  writePayload(pointer.draftId, input.payload);
  return pointer;
}

export type ClaimReason = "expired" | "already_claimed" | "invalid_token" | "network";

export interface ClaimResult {
  ok: boolean;
  reason?: ClaimReason;
  route?: string;
  flow?: DraftFlow;
  docKey?: string;
  stepIdx?: number;
  payload?: DraftPayload;
  savedDocId?: string;
}

/** Присвоява анонимната чернова към влезлия потребител. */
export async function claimDraft(pointer: DraftPointer): Promise<ClaimResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      reason?: ClaimReason;
      route?: string;
      flow?: DraftFlow;
      doc_key?: string;
      step_idx?: number;
      payload?: DraftPayload;
      saved_doc_id?: string;
    }>("draft-claim", {
      body: { draft_id: pointer.draftId, claim_token: pointer.claimToken },
    });
    if (error) return { ok: false, reason: "network" };
    if (!data?.ok) return { ok: false, reason: data?.reason ?? "network" };
    return {
      ok: true,
      route: isSafeRoute(data.route) ? data.route : pointer.route,
      flow: data.flow ?? pointer.flow,
      docKey: data.doc_key ?? pointer.docKey,
      stepIdx: typeof data.step_idx === "number" ? data.step_idx : pointer.stepIdx,
      payload: data.payload ?? readPayload(pointer.draftId) ?? undefined,
      savedDocId: data.saved_doc_id,
    };
  } catch {
    return { ok: false, reason: "network" };
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

/**
 * Прочита еднократно старите локални чернови (с лични данни) и връща тяхното
 * съдържание, след което ги ИЗТРИВА от localStorage. Съдържанието се пренася в
 * sessionStorage / сървъра от викащия екран.
 */
export function takeLegacyDrafts(): LegacyDraft[] {
  if (typeof window === "undefined") return [];
  const out: LegacyDraft[] = [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === LEGACY_BUILD_KEY || k.startsWith(LEGACY_WIZARD_PREFIX)) keys.push(k);
    }
  } catch {
    return [];
  }
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      localStorage.removeItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") continue;
      const flow: DraftFlow = key === LEGACY_BUILD_KEY ? "build" : "wizard";
      out.push({
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
      });
    } catch { /* повреден запис — пропускаме */ }
  }
  return out;
}

/** Изтрива всички стари ключове без да чете съдържанието (privacy cleanup). */
export function purgeLegacyDrafts(): number {
  return takeLegacyDrafts().length;
}
