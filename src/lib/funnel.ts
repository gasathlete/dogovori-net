/**
 * Marketing funnel infrastructure.
 *
 * Four canonical steps:
 *   1 — Landing      (/)
 *   2 — Educate      (/kak-rabotim or landing scroll)
 *   3 — Analyze      (/analiz — aha-moment, blur paywall)
 *   4 — Convert      (/plans — decision page)
 *
 * Session-side state (analysis result + step history) lives in sessionStorage
 * with a 24 h TTL so the user can come back and Step 4 can personalize itself.
 */

import { getCategoryConsent, trackEvent } from "@/lib/analytics";
import { claimOnce } from "@/lib/funnelEvents";
import { getBrowserId, getCurrentFunnelContext } from "@/lib/funnelContext";


export type FunnelStep = 1 | 2 | 3 | 4;

export interface AnalysisRisk {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  /** Full body is only shown after sign-up (paywall) */
  body: string;
  premium: boolean;
}

export interface AnalysisSession {
  id: string;
  createdAt: number;
  expiresAt: number;
  source: "upload" | "paste" | "interview";
  documentKind?: string;
  /** 0–100 — higher = riskier */
  score: number;
  risks: AnalysisRisk[];
  /** Recommended plan based on risk count */
  recommendedPlan: "free" | "professional" | "entrepreneur";
}

const SESSION_KEY = "funnel_analysis_v1";
const STEP_KEY = "funnel_step_v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export function saveAnalysisSession(s: AnalysisSession) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* quota — ignore */
  }
}

export function loadAnalysisSession(): AnalysisSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnalysisSession;
    if (Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAnalysisSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function newAnalysisSession(
  source: AnalysisSession["source"],
  documentKind: string | undefined,
  risks: AnalysisRisk[],
): AnalysisSession {
  const score = Math.min(
    100,
    risks.reduce(
      (s, r) => s + (r.severity === "high" ? 30 : r.severity === "medium" ? 18 : 8),
      0,
    ),
  );
  const recommendedPlan: AnalysisSession["recommendedPlan"] =
    risks.length >= 5 ? "entrepreneur" : risks.length >= 2 ? "professional" : "free";
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
    source,
    documentKind,
    score,
    risks,
    recommendedPlan,
  };
}

/* -------------------- Step tracking -------------------- */

export function markFunnelStep(step: FunnelStep) {
  if (typeof window === "undefined") return;
  try {
    const prev = Number(sessionStorage.getItem(STEP_KEY) || "0");
    if (step > prev) sessionStorage.setItem(STEP_KEY, String(step));
    trackFunnelEvent("funnel_step", { step });
  } catch {
    /* ignore */
  }
}

export function getCurrentFunnelStep(): FunnelStep {
  if (typeof window === "undefined") return 1;
  const v = Number(sessionStorage.getItem(STEP_KEY) || "1");
  return (v >= 1 && v <= 4 ? v : 1) as FunnelStep;
}

/**
 * Псевдонимен идентификатор на браузъра. Пази се в localStorage и НЕ се сменя при
 * вход/регистрация — така анонимният път (doc_start → generate) и
 * регистрираният (download, checkout) се свързват през една стойност,
 * а user_id се добавя от момента на автентикация нататък.
 *
 * Обратна съвместимост: колоната `funnel_events.session_id` продължава да носи
 * точно тази стойност; истинската сесия на таба е `props.tab_session_id`.
 */
export function getFunnelSessionId(): string {
  return getBrowserId();
}


/* -------------------- Идентичност (user_id attribution) -------------------- */

type SupabaseModule = typeof import("@/integrations/supabase/client");

let clientPromise: Promise<SupabaseModule> | null = null;
/** undefined = още не знаем; null = анонимен; string = user id. */
let cachedUid: string | null | undefined;
let identityInitialised = false;

const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_ONCE_KEY = "funnel_signup_recorded_v1";

function loadClient(): Promise<SupabaseModule> {
  if (!clientPromise) clientPromise = import("@/integrations/supabase/client");
  return clientPromise;
}

/**
 * Отчита `signup_completed` веднъж на потребител: нов профил (created_at в
 * последните 15 мин) със сесия в браузъра. Без PII — само методът на вход.
 */
function maybeTrackSignup(user: { id: string; created_at?: string; app_metadata?: Record<string, unknown> } | null | undefined) {
  if (!user?.id || typeof window === "undefined") return;
  try {
    const createdAt = user.created_at ? Date.parse(user.created_at) : NaN;
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > SIGNUP_WINDOW_MS) return;
    if (localStorage.getItem(SIGNUP_ONCE_KEY) === user.id) return;
    localStorage.setItem(SIGNUP_ONCE_KEY, user.id);
    const provider = typeof user.app_metadata?.provider === "string" ? (user.app_metadata.provider as string) : "unknown";
    trackFunnelEvent("signup_completed", { event: "signup_completed", method: provider.slice(0, 32) });
  } catch {
    /* ignore */
  }
}

/**
 * Абонира се за промените в автентикацията, за да има синхронно достъпен
 * user_id при всяко събитие и за да улови момента на регистрация.
 * Безопасно за многократно извикване; вика се при boot и при първото събитие.
 */
export function initFunnelIdentity(): void {
  if (identityInitialised || typeof window === "undefined") return;
  identityInitialised = true;
  void loadClient()
    .then(({ supabase }) => {
      supabase.auth.onAuthStateChange((event, session) => {
        cachedUid = session?.user?.id ?? null;
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") maybeTrackSignup(session?.user);
      });
      return supabase.auth.getSession().then(({ data }) => {
        if (cachedUid === undefined) cachedUid = data.session?.user?.id ?? null;
        maybeTrackSignup(data.session?.user);
      });
    })
    .catch(() => {
      cachedUid = cachedUid ?? null;
    });
}

/** Текущият user id (или null), със заявка към клиента само при първия път. */
async function resolveUid(supabase: SupabaseModule["supabase"]): Promise<string | null> {
  if (cachedUid !== undefined) return cachedUid;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id ?? null;
    if (cachedUid === undefined) cachedUid = uid;
    return uid;
  } catch {
    return null;
  }
}

/** Само за тестове. */
export function __resetFunnelIdentityForTests() {
  clientPromise = null;
  cachedUid = undefined;
  identityInitialised = false;
}

export interface TrackFunnelOptions {
  /**
   * Ключ за идемпотентност. Ако е зададен, събитието се изпраща само първия
   * път за (сесия, име, ключ) — както към GA, така и към базата (където има и
   * уникален индекс като втора защита при няколко таба).
   */
  dedupKey?: string;
}

/**
 * Изпраща продуктово събитие към GA, dataLayer и `public.funnel_events`.
 *
 * Съгласие: и трите пътя са зад съгласието за категория „analytics" (банерът
 * обещава точно това). Без съгласие функцията не прави НИКАКЪВ страничен ефект
 * и връща false. Оперативната истина остава в оперативните таблици и логове.
 *
 * @returns true, ако събитието е изпратено; false, ако е дедупликирано или
 *          няма съгласие за аналитика.
 */
export function trackFunnelEvent(
  name: string,
  props?: Record<string, unknown>,
  options?: TrackFunnelOptions,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!getCategoryConsent("analytics")) return false;
  } catch {
    return false;
  }
  // Пътят се хваща СИНХРОННО: до момента на асинхронния DB запис потребителят
  // вече може да е навигирал другаде и записът щеше да сочи грешна страница.
  let path: string | null = null;
  try {
    const raw = window.location?.pathname;
    path = typeof raw === "string" ? raw.slice(0, 200) : null;
  } catch {
    path = null;
  }
  const sessionId = getFunnelSessionId();
  const storedName = String(name).slice(0, 80);
  const dedupKey = options?.dedupKey ? String(options.dedupKey).slice(0, 200) : undefined;
  if (dedupKey && !claimOnce(`${sessionId}|${storedName}|${dedupKey}`)) return false;

  // Envelope-ът се налага ПОСЛЕ, за да не може call site да пренапише
  // идентичността или версията на схемата.
  const finalProps: Record<string, unknown> = { ...(props ?? {}), ...getCurrentFunnelContext() };
  if (dedupKey) finalProps.dedup_key = dedupKey;


  trackEvent(storedName, finalProps);
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event: storedName, ...finalProps });
  } catch {
    /* ignore */
  }
  // Fire-and-forget DB write so the admin dashboard sees real numbers.
  // Failure is silent — never block the UI on analytics.
  try {
    const stepNum = typeof finalProps.step === "number" ? (finalProps.step as number) : null;
    initFunnelIdentity();
    void loadClient().then(async ({ supabase }) => {
      // user_id се праща, когато е известен; сървърният тригер го налага от
      // JWT-а при всеки автентикиран запис, така че липсата му тук е безопасна.
      const uid = await resolveUid(supabase);
      const row: Record<string, unknown> = {
        session_id: sessionId,
        name: storedName,
        step: stepNum !== null && stepNum >= 1 && stepNum <= 4 ? stepNum : null,
        path,
        props: JSON.parse(JSON.stringify(finalProps)),
      };
      if (uid) row.user_id = uid;
      // NB: PostgREST builders are lazy thenables — `void builder` never runs.
      // The explicit .then() is what actually dispatches the request.
      return supabase
        .from("funnel_events")
        .insert(row as never)
        .then(() => undefined, () => undefined);
    });
  } catch {
    /* ignore */
  }
  return true;
}

/* -------------------- Mock analyzer (Phase A) --------------------
 * Returns deterministic-ish demo risks so we can ship Step 3 without
 * blocking on the full AI pipeline. Real AI call is a drop-in replacement.
 */

const DEMO_RISK_POOL: Omit<AnalysisRisk, "premium">[] = [
  {
    id: "r1",
    severity: "high",
    title: "Липсва клауза за неустойка при забавено плащане",
    body: "Без фиксирана неустойка губите ~14 дни процесуално време при евентуален съдебен иск. Препоръчваме 0.5%/ден до 10% максимум.",
  },
  {
    id: "r2",
    severity: "high",
    title: "Едностранно прекратяване без предизвестие",
    body: "Контрагентът може да напусне без причина. Добавете 30-дневно предизвестие и компенсация за прекъсване в средата на проект.",
  },
  {
    id: "r3",
    severity: "medium",
    title: "Юрисдикция не е изрично уговорена",
    body: "При спор ще се прилага общата подсъдност — често в полза на ответника. Уговорете компетентен съд в София.",
  },
  {
    id: "r4",
    severity: "medium",
    title: "Конфиденциалност без срок след прекратяване",
    body: "Без post-term NDA know-how-ът Ви е незащитен веднага след края на сделката. Стандарт е 3–5 години.",
  },
  {
    id: "r5",
    severity: "low",
    title: "Липсва клауза за форсмажор по образец ICC 2020",
    body: "При пандемия/война рискувате двусмислица. Препоръчваме препратка към ICC Force Majeure Clause 2020.",
  },
  {
    id: "r6",
    severity: "high",
    title: "Интелектуална собственост не е изрично прехвърлена",
    body: "По подразбиране авторските права остават у изпълнителя. За работа по поръчка задължително включете изрично прехвърляне.",
  },
  {
    id: "r7",
    severity: "medium",
    title: "Несъответствие с GDPR Чл. 28 (договор за обработка)",
    body: "Ако има обмен на лични данни, нужен е DPA. Без него — глоба до 4% от оборота.",
  },
];

export function mockAnalyze(documentKind?: string): AnalysisRisk[] {
  // 5–7 risks, first one always free, rest blurred
  const n = 5 + Math.floor(Math.random() * 3);
  const picked = [...DEMO_RISK_POOL].sort(() => Math.random() - 0.5).slice(0, n);
  return picked.map((r, i) => ({ ...r, premium: i > 0 }));
}
