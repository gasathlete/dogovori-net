/**
 * Канонична документна фуния — единствен източник на истината за имената,
 * семантиката и идемпотентността на продуктовите събития.
 *
 * Семантика (какво ОЗНАЧАВА събитието, а не къде се вика):
 *
 *   document_selected     съзнателно действие: потребителят избира/започва конкретен
 *                         документ (клик върху карта, първи отговор във въпросника).
 *                         НИКОГА при page render, SEO изглед, prefetch или auto-effect.
 *   wizard_step_completed завършена стъпка от въпросника (step_idx / total_steps).
 *   generation_started    стартиран опит за генериране (всеки опит е отделно събитие).
 *   generation_succeeded  документът е генериран.
 *   generation_failed     технически провал (мрежа, сървър, невалиден AI отговор).
 *   generation_blocked    продуктова преграда (потвърждение, квота, вход, чувствително).
 *   auth_prompt_shown     показан вход/регистрация в контекст на действие.
 *   signup_completed      нов профил със сесия (веднъж на потребител).
 *   result_viewed         екранът с готовия документ е показан.
 *   paywall_shown         показан paywall (строг документ, квота, Pro диалог).
 *   checkout_started      стартиран Stripe checkout.
 *   checkout_completed    покупката е отразена в профила.
 *   document_saved        документът е запазен в профила.
 *   document_downloaded   успешно сваляне (PDF/DOCX).
 *   download_failed       неуспешно сваляне.
 *   draft_created         създадена е анонимна чернова (при първо реално действие).
 *   draft_autosaved       черновата е записана на сървъра (веднъж на сесия+чернова).
 *   draft_restore_offered предложено е продължаване на заварена чернова.
 *   draft_restored        черновата е върната в екрана (refresh / нов таб).
 *   draft_claim_started   след вход започва присвояване на анонимната чернова.
 *   draft_claim_succeeded черновата е присвоена → потребителят продължава оттам.
 *   draft_claim_blocked   присвояването е отказано (expired/already_claimed/
 *                         invalid_token/unauthorized/rate_limited/network).
 *   draft_sync_blocked    сървърният запис е отказан с типизирана причина
 *                         (веднъж на чернова+причина; съдържанието остава в таба).
 *   draft_expired         черновата е изтекла и е изчистена от браузъра.
 *
 * Съхранение: съществуващите табла (/admin/generation, /admin/funnel,
 * growth_snapshot SQL) четат историческите имена (`doc_start`, `doc_generate_*`…).
 * За да няма счупени консуматори и разкъсани времеви редове, тези събития се
 * записват със СЪЩОТО историческо име в `funnel_events.name`, а каноничното
 * име винаги пътува в `props.event`. Новите събития се записват с
 * каноничното си име директно.
 */

export const CANONICAL_EVENTS = [
  "document_selected",
  "wizard_step_completed",
  "generation_started",
  "generation_succeeded",
  "generation_failed",
  "generation_blocked",
  "auth_prompt_shown",
  "signup_completed",
  "result_viewed",
  "paywall_shown",
  "checkout_started",
  "checkout_completed",
  "document_saved",
  "document_downloaded",
  "download_failed",
  "draft_created",
  "draft_autosaved",
  "draft_restore_offered",
  "draft_restored",
  "draft_claim_started",
  "draft_claim_succeeded",
  "draft_claim_blocked",
  "draft_sync_blocked",
  "draft_expired",
] as const;

export type CanonicalEvent = (typeof CANONICAL_EVENTS)[number];

/** Канонично име → име, под което редът се записва в `funnel_events.name`. */
export const STORED_NAME: Record<CanonicalEvent, string> = {
  document_selected: "doc_start",
  wizard_step_completed: "doc_fill_step",
  generation_started: "doc_generate_started",
  generation_succeeded: "doc_generate_success",
  generation_failed: "doc_generate_fail",
  generation_blocked: "doc_generate_blocked",
  auth_prompt_shown: "auth_prompt_shown",
  signup_completed: "signup_completed",
  result_viewed: "result_viewed",
  paywall_shown: "paywall_shown",
  checkout_started: "checkout_started",
  checkout_completed: "upgrade_completed",
  document_saved: "document_saved",
  document_downloaded: "doc_download_success",
  download_failed: "doc_download_fail",
  // Activation continuity — нови събития, записват се с каноничното си име.
  draft_created: "draft_created",
  draft_autosaved: "draft_autosaved",
  draft_restore_offered: "draft_restore_offered",
  draft_restored: "draft_restored",
  draft_claim_started: "draft_claim_started",
  draft_claim_succeeded: "draft_claim_succeeded",
  draft_claim_blocked: "draft_claim_blocked",
  draft_sync_blocked: "draft_sync_blocked",
  draft_expired: "draft_expired",
};

/** Обратна карта: съхранено (историческо или канонично) име → канонично. */
export function canonicalEventName(stored: string): CanonicalEvent | null {
  if ((CANONICAL_EVENTS as readonly string[]).includes(stored)) return stored as CanonicalEvent;
  for (const [canon, s] of Object.entries(STORED_NAME) as Array<[CanonicalEvent, string]>) {
    if (s === stored) return canon;
  }
  return null;
}

/**
 * Събития, които се отчитат ЕДНОКРАТНО за (сесия, документ[, стъпка]).
 * Всеки опит за генериране и всяко сваляне са отделни бизнес факти и НЕ се
 * дедупликират тук — процентът провали трябва да ги вижда всичките.
 */
export const ONCE_PER_SESSION_DOC: ReadonlySet<CanonicalEvent> = new Set<CanonicalEvent>([
  "document_selected",
  "wizard_step_completed",
  "result_viewed",
  "auth_prompt_shown",
  "paywall_shown",
  "draft_created",
  "draft_autosaved",
  "draft_restore_offered",
  "draft_restored",
]);

/* -------------------- Идемпотентност (клиентска страна) -------------------- */

const ONCE_KEY = "funnel_once_v1";
const ONCE_TTL_MS = 24 * 60 * 60 * 1000;
const ONCE_MAX_ENTRIES = 400;

type OnceStore = Record<string, number>;

function readOnce(): OnceStore {
  try {
    const raw = localStorage.getItem(ONCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as OnceStore) : {};
  } catch {
    return {};
  }
}

function writeOnce(store: OnceStore) {
  try {
    localStorage.setItem(ONCE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — дедупликацията остава best effort */
  }
}

/**
 * Съставя стабилен ключ за дедупликация. Частите се нормализират, за да е
 * еднакъв ключът независимо от реда на извикване или регистъра на doc_key.
 */
export function buildDedupKey(parts: Array<string | number | undefined | null>): string {
  return parts
    .map((p) => (p === undefined || p === null ? "" : String(p).trim().toLowerCase()))
    .join("|")
    .slice(0, 200);
}

/**
 * Връща true само ПЪРВИЯ път за даден ключ в рамките на TTL. Всяко следващо
 * извикване със същия ключ връща false (събитието не трябва да се изпраща).
 * Паметта е в localStorage, така че важи за всички табове на браузъра.
 */
export function claimOnce(key: string, now: number = Date.now()): boolean {
  if (typeof window === "undefined") return true;
  const store = readOnce();
  const seenAt = store[key];
  if (typeof seenAt === "number" && now - seenAt < ONCE_TTL_MS) return false;

  // Почистване: изтекли записи + ограничение на размера (най-старите отпадат).
  const fresh: OnceStore = {};
  for (const [k, ts] of Object.entries(store)) {
    if (typeof ts === "number" && now - ts < ONCE_TTL_MS) fresh[k] = ts;
  }
  fresh[key] = now;
  const keys = Object.keys(fresh);
  if (keys.length > ONCE_MAX_ENTRIES) {
    keys
      .sort((a, b) => fresh[a] - fresh[b])
      .slice(0, keys.length - ONCE_MAX_ENTRIES)
      .forEach((k) => delete fresh[k]);
  }
  writeOnce(fresh);
  return true;
}

/** Само за тестове / изчистване на данни. */
export function resetOnceStore() {
  try {
    localStorage.removeItem(ONCE_KEY);
  } catch {
    /* ignore */
  }
}

/* -------------------- Санитизация на свойствата (no-PII) -------------------- */

/**
 * Разрешени етикети: технически идентификатори (slug, код, uuid) или кратки
 * наименования на вид документ (кирилица/латиница, цифри, интервали, тире).
 * Свободен текст с пунктуация (напр. съобщение за грешка, имейл, адрес) отпада.
 */
const SAFE_LABEL = /^[\p{L}\p{N}_\-./:@ ()№]{1,120}$/u;
const EMAIL_LIKE = /@[\p{L}\p{N}-]+\.[\p{L}]{2,}/u;
const EGN_LIKE = /\b\d{10}\b/;
const IBAN_LIKE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/;

export function sanitizeFunnelProps(props?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
      continue;
    }
    if (typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      const s = v.trim().slice(0, 120);
      if (!s) continue;
      if (EMAIL_LIKE.test(s) || EGN_LIKE.test(s) || IBAN_LIKE.test(s)) continue;
      if (SAFE_LABEL.test(s)) out[k] = s;
      continue;
    }
    // Обекти/масиви (напр. A/B варианти) — само плитки, кратки стойности.
    if (typeof v === "object") {
      try {
        const json = JSON.stringify(v);
        if (json.length <= 300 && !EMAIL_LIKE.test(json) && !EGN_LIKE.test(json)) out[k] = JSON.parse(json);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}
