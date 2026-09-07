/**
 * Stage 2a — общ контекст („envelope") за всяко продуктово събитие.
 *
 * Цел: един надежден продуктов път, който може да се съедини детерминистично,
 * без никакви лични данни.
 *
 *   browser_id      траен псевдонимен идентификатор на браузъра (localStorage,
 *                   съществуващият ключ `funnel_session_id_v1` — НЕ се мигрира).
 *   tab_session_id  истинска сесия: нов идентификатор за всеки таб (sessionStorage).
 *   journey_id      едно съзнателно преминаване през фунията за конкретен документ.
 *   run_id          един опит върху документ (старт → попълване → резултат).
 *
 * Всички идентификатори са случайни, непрозрачни UUID-подобни низове. Тук НИКОГА
 * не се записва съдържание на документ, потребителски вход, имейл, ЕГН, IBAN или
 * query параметри от адреса — само нормализиран `doc_key` (slug / вид документ).
 */

export const FUNNEL_SCHEMA_VERSION = 2;
export const FUNNEL_RELEASE = "s2funnel-v2a";

const BROWSER_ID_KEY = "funnel_session_id_v1";
const TAB_SESSION_KEY = "funnel_tab_session_v1";
const DOC_CONTEXT_KEY = "funnel_doc_context_v1";

/** Стабилни резерви в паметта на модула, когато storage не е достъпен. */
let memoryBrowserId: string | null = null;
let memoryTabSessionId: string | null = null;
let memoryDocContext: DocumentContext | null = null;

export interface DocumentContext {
  journey_id: string;
  run_id: string;
  doc_key: string;
}

export interface FunnelContext {
  schema_version: number;
  release: string;
  browser_id: string;
  tab_session_id: string;
  journey_id?: string;
  run_id?: string;
  doc_key?: string;
}

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Разрешен технически ключ: 1–120 знака от Unicode букви/цифри плюс `_ . : / -`.
 * Целият (trim-нат) вход трябва да е валиден — НИКОГА не се отрязва префикс от
 * опасен или прекалено дълъг вход.
 */
const SAFE_DOC_KEY = /^[\p{L}\p{N}_.:/-]{1,120}$/u;
/** Прилича на имейл — отхвърля се дори без `@` да е в разрешените знаци. */
const EMAIL_LIKE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[a-z]{2,}/iu;
/** Самостоятелен 10-цифрен низ (ЕГН-подобен). */
const EGN_LIKE = /^\d{10}$/;
/** IBAN-подобен низ (2 букви + 2 цифри + 11–30 буквено-цифрови). */
const IBAN_LIKE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i;

/**
 * Нормализира ключа на документа до кратък технически етикет (без свободен текст).
 * Опасен, празен или прекалено дълъг вход дава празен низ → извикващият получава
 * непрозрачен контекст (`unknown`).
 */
export function normalizeDocKey(input?: string | null): string {
  if (!input) return "";
  const trimmed = String(input).trim();
  if (!SAFE_DOC_KEY.test(trimmed)) return "";
  if (EMAIL_LIKE.test(trimmed)) return "";
  if (EGN_LIKE.test(trimmed)) return "";
  if (IBAN_LIKE.test(trimmed)) return "";
  return trimmed.toLowerCase();
}

/* -------------------- browser_id (траен) -------------------- */

export function getBrowserId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = localStorage.getItem(BROWSER_ID_KEY);
    if (existing) {
      memoryBrowserId = existing;
      return existing;
    }
    const next = memoryBrowserId ?? uuid();
    memoryBrowserId = next;
    localStorage.setItem(BROWSER_ID_KEY, next);
    return next;
  } catch {
    // Private mode / quota — един и същи идентификатор до края на живота на страницата.
    if (!memoryBrowserId) memoryBrowserId = uuid();
    return memoryBrowserId;
  }
}

/* -------------------- tab_session_id (истинска сесия) -------------------- */

export function getTabSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = sessionStorage.getItem(TAB_SESSION_KEY);
    if (existing) {
      memoryTabSessionId = existing;
      return existing;
    }
    const next = memoryTabSessionId ?? uuid();
    memoryTabSessionId = next;
    sessionStorage.setItem(TAB_SESSION_KEY, next);
    return next;
  } catch {
    if (!memoryTabSessionId) memoryTabSessionId = uuid();
    return memoryTabSessionId;
  }
}

/* -------------------- документен контекст -------------------- */

function readDocContext(): DocumentContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DOC_CONTEXT_KEY);
    if (!raw) return memoryDocContext;
    const parsed = JSON.parse(raw) as Partial<DocumentContext> | null;
    if (!parsed || typeof parsed.journey_id !== "string" || typeof parsed.run_id !== "string") {
      return memoryDocContext;
    }
    return {
      journey_id: parsed.journey_id,
      run_id: parsed.run_id,
      doc_key: typeof parsed.doc_key === "string" ? parsed.doc_key : "",
    };
  } catch {
    return memoryDocContext;
  }
}

function writeDocContext(ctx: DocumentContext): DocumentContext {
  memoryDocContext = ctx;
  try {
    sessionStorage.setItem(DOC_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* остава само в паметта — контекстът пак е стабилен за таба */
  }
  return ctx;
}

function newDocContext(docKey: string): DocumentContext {
  return writeDocContext({ journey_id: uuid(), run_id: uuid(), doc_key: docKey });
}

/**
 * Изрично ново преминаване (клик върху CTA за създаване). Винаги нов journey/run,
 * дори за същия документ — два съзнателни старта са два различни факта.
 */
export function startDocumentJourney(docKey?: string | null): DocumentContext {
  return newDocContext(normalizeDocKey(docKey) || "unknown");
}

/**
 * Продължаване: използва наличния контекст само ако нормализираният `doc_key`
 * съвпада; иначе започва нов. Без `doc_key` — непрозрачен „unknown" контекст.
 */
export function ensureDocumentJourney(docKey?: string | null): DocumentContext {
  const key = normalizeDocKey(docKey) || "unknown";
  const current = readDocContext();
  if (current && current.doc_key === key) return current;
  return newDocContext(key);
}

/** Текущият контекст без да се създава нов (за пасивни събития). */
export function getDocumentContext(): DocumentContext | null {
  return readDocContext();
}

/** Пълният envelope, добавян към всяко събитие. */
export function getCurrentFunnelContext(): FunnelContext {
  const base: FunnelContext = {
    schema_version: FUNNEL_SCHEMA_VERSION,
    release: FUNNEL_RELEASE,
    browser_id: getBrowserId(),
    tab_session_id: getTabSessionId(),
  };
  const doc = readDocContext();
  if (doc) {
    base.journey_id = doc.journey_id;
    base.run_id = doc.run_id;
    if (doc.doc_key) base.doc_key = doc.doc_key;
  }
  return base;
}

/** Само за тестове. */
export function __resetFunnelContextForTests() {
  memoryBrowserId = null;
  memoryTabSessionId = null;
  memoryDocContext = null;
  try {
    localStorage.removeItem(BROWSER_ID_KEY);
    sessionStorage.removeItem(TAB_SESSION_KEY);
    sessionStorage.removeItem(DOC_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}

/** Само за тестове: имената на ключовете, за да не се дублират литерали. */
export const FUNNEL_CONTEXT_KEYS = {
  browserId: BROWSER_ID_KEY,
  tabSession: TAB_SESSION_KEY,
  docContext: DOC_CONTEXT_KEY,
} as const;
