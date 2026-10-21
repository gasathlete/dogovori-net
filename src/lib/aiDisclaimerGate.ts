// Feature-scoped, versioned pre-start disclaimer gate.
//
// Call `ensureFeatureDisclaimer(feature)` and await it BEFORE starting the
// action (before any network call or state reset). Acceptance is stored per
// (feature, version) for the current browser session only. Cancel rejects
// with {cancelled:true}; callers return silently and call no backend.
//
// The disclaimer is information only: it never replaces auth, authorization,
// RLS, payment entitlement, rate limits or privacy checks, which still run.

export const DISCLAIMER_VERSION = "2026-10-21";

export const DISCLAIMER_FEATURES = [
  "generation",
  "editing",
  "analysis",
  "assistant",
  "download",
  "product",
] as const;
export type DisclaimerFeature = (typeof DISCLAIMER_FEATURES)[number];

export const DISCLAIMER_BODY =
  "Договори.нет предоставя инструменти за подготовка и обработка на документи. Автоматично създаденото съдържание може да съдържа неточности и не замества индивидуална правна консултация. Проверете внимателно преди подписване.";

/** Конкретни реални ограничения по функция. */
export const DISCLAIMER_LIMITS: Readonly<Record<DisclaimerFeature, { title: string; limits: readonly string[] }>> = {
  generation: {
    title: "Преди да създадете документ",
    limits: [
      "Текстът се създава автоматично по въведените от Вас данни и по образец от каталога, който е в преработка.",
      "Създаването използва операция от месечния лимит на плана Ви.",
      "Проверете имената, сумите, сроковете и датите в готовия документ.",
    ],
  },
  editing: {
    title: "Преди да редактирате документа",
    limits: [
      "Автоматичните предложения за промяна може да не отчитат всички обстоятелства по Вашия случай.",
      "Промяната се прилага само след Ваше потвърждение.",
    ],
  },
  analysis: {
    title: "Преди проверката на текста",
    limits: [
      "Проверяваме само поставен текст. Качването на PDF/DOCX файлове временно не е налично.",
      "Заменете ЕГН, IBAN и други лични идентификатори с [ЕГН] или [IBAN] преди изпращане.",
      "Проверката използва операция от месечния лимит и може да пропусне рискове.",
    ],
  },
  assistant: {
    title: "Преди да питате DogovaryAI",
    limits: [
      "Отговорите са автоматични и са обща информация.",
      "Не въвеждайте ЕГН, IBAN или други лични данни в съобщенията.",
      "Броят съобщения е ограничен според плана Ви.",
    ],
  },
  download: {
    title: "Преди да свалите документа",
    limits: [
      "Каталогът е в преработка. Сваленият файл е образец, който може да изисква адаптация.",
      "Свалянето използва операция от месечния лимит на плана Ви.",
    ],
  },
  product: {
    title: "Преди да започнете",
    limits: [
      "Обработваме само поставения от Вас текст. Резултатът е обвързан с точно този текст.",
      "Покупка е възможна само когато плащанията са отворени. Нищо не се таксува преди потвърдено плащане.",
    ],
  },
};

const KEY_PREFIX = "dogovori:disclaimer:";
const keyFor = (f: DisclaimerFeature) => `${KEY_PREFIX}${f}:${DISCLAIMER_VERSION}`;

export function hasFeatureDisclaimer(feature: DisclaimerFeature): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(keyFor(feature)) === "1";
  } catch {
    return false;
  }
}

export function setFeatureDisclaimer(feature: DisclaimerFeature) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(keyFor(feature), "1");
  } catch {
    /* ignore */
  }
}

export interface DisclaimerRequestDetail {
  feature: DisclaimerFeature;
  id: string;
}

let seq = 0;
const pending = new Map<DisclaimerFeature, Promise<void>>();

/**
 * Resolves after explicit acceptance (or immediately if already accepted for
 * this feature+version in this session). Concurrent calls for the same
 * feature share one dialog, so there are no repeated/cyclic prompts.
 */
export function ensureFeatureDisclaimer(feature: DisclaimerFeature): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hasFeatureDisclaimer(feature)) return Promise.resolve();
  const existing = pending.get(feature);
  if (existing) return existing;

  const id = `d${++seq}`;
  const p = new Promise<void>((resolve, reject) => {
    const onResolved = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; accepted: boolean }>).detail;
      if (!d || d.id !== id) return;
      window.removeEventListener("ai-disclaimer:resolved", onResolved);
      pending.delete(feature);
      if (d.accepted) {
        setFeatureDisclaimer(feature);
        resolve();
      } else {
        reject({ cancelled: true });
      }
    };
    window.addEventListener("ai-disclaimer:resolved", onResolved);
    import("@/lib/bufferedEvents").then(({ dispatchBuffered }) =>
      dispatchBuffered("ai-disclaimer:request", { feature, id } satisfies DisclaimerRequestDetail),
    );
  });
  pending.set(feature, p);
  return p;
}

export function isDisclaimerCancel(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { cancelled?: unknown }).cancelled === true;
}

/** Backwards-compatible download gate. */
export function ensureAIDisclaimerAccepted(): Promise<void> {
  return ensureFeatureDisclaimer("download");
}
export const hasAIDisclaimerSession = () => hasFeatureDisclaimer("download");
export const setAIDisclaimerSession = () => setFeatureDisclaimer("download");
