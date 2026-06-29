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

import { trackEvent } from "@/lib/analytics";

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

const SESSION_ID_KEY = "funnel_session_id_v1";

function getFunnelSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

export function trackFunnelEvent(name: string, props?: Record<string, unknown>) {
  trackEvent(name, props);
  try {
    if (typeof window !== "undefined") {
      (window as any).dataLayer = (window as any).dataLayer || [];
      (window as any).dataLayer.push({ event: name, ...props });
    }
  } catch {
    /* ignore */
  }
  // Fire-and-forget DB write so the admin dashboard sees real numbers.
  // Failure is silent — never block the UI on analytics.
  try {
    if (typeof window === "undefined") return;
    const stepNum =
      typeof props?.step === "number"
        ? (props.step as number)
        : null;
    void import("@/integrations/supabase/client").then(({ supabase }) => {
      void supabase.from("funnel_events").insert({
        session_id: getFunnelSessionId(),
        name: String(name).slice(0, 80),
        step: stepNum !== null && stepNum >= 1 && stepNum <= 4 ? stepNum : null,
        path: window.location?.pathname?.slice(0, 200) ?? null,
        props: JSON.parse(JSON.stringify(props ?? {})),
      });
    });
  } catch {
    /* ignore */
  }
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
