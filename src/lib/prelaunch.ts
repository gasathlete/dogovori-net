/**
 * Предварителен режим (до доказано съответствие).
 *
 * Функциите тук са ЗАТВОРЕНИ по подразбиране. Всяка затворена функция в UI
 * отваря общата предварителна заявка вместо да извиква AI, плащане или сваляне.
 * Това е клиентска преграда — директните API извиквания се контролират
 * отделно (виж матрицата в .lovable/plan.md). Не твърди правно съответствие.
 */

export const PRELAUNCH_FEATURES = [
  "blank_download",
  "document_generation",
  "document_review",
  "assistant",
  "one_time_product",
  "subscription",
] as const;

export type PrelaunchFeature = (typeof PRELAUNCH_FEATURES)[number];

/**
 * Отворени са само функциите с реална положителна MAIN проверка (20.10.2026):
 * генериране + ревизия на генериран документ, асистент (регистриран и анонимен),
 * бланка. Анализът на качен документ (document_review) още не е проверен.
 * Плащанията остават затворени.
 */
const AVAILABLE: Readonly<Record<PrelaunchFeature, boolean>> = Object.freeze({
  blank_download: true,
  document_generation: true,
  document_review: false,
  assistant: true,
  one_time_product: false,
  subscription: false,
});

export function isPrelaunchFeature(value: unknown): value is PrelaunchFeature {
  return typeof value === "string" && (PRELAUNCH_FEATURES as readonly string[]).includes(value);
}

/** Fail-closed: непознато име = затворено. */
export function isFeatureAvailable(feature: string): boolean {
  return isPrelaunchFeature(feature) && AVAILABLE[feature] === true;
}

export const PRELAUNCH_WAITLIST_CONSENT_VERSION = "prelaunch_waitlist_v1";

/** Кратък индикатор за публичния тестов период. Без краен срок. */
export const TEST_PERIOD_LABEL = "Тестов период";

export const PRELAUNCH_COPY = {
  title: "Предварителна заявка",
  body:
    "Разглеждането и примерите са достъпни. По желание оставете имейл, за да Ви известим, когато стане достъпна тази услуга.",
  emailLabel: "Имейл",
  consentLabel:
    "Съгласявам се Договори.нет да съхранява този имейл, за да ме уведоми, когато услугата е готова. Имейлът се пази до 90 дни и след това се изтрива автоматично. Мога да оттегля съгласието си по всяко време.",
  submit: "Изпратете заявката",
  close: "Затворете",
  success: "Заявката е приета. Ще Ви известим, когато услугата стане достъпна.",
  unavailable:
    "Не успяхме да потвърдим заявката. Възможно е тя да не е записана. Опитайте отново по-късно.",
  invalid: "Въведете валиден имейл и отметнете съгласието.",
  revokeHint:
    "За оттегляне на съгласието и изтриване на имейла пишете ни чрез страницата „Контакти“.",
} as const;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function normalizeWaitlistEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export interface WaitlistArgs {
  _email: string;
  _feature: PrelaunchFeature;
  _consent: true;
  _consent_version: string;
}

/** Точният payload към RPC. `null` = нищо не се изпраща. */
export function buildWaitlistArgs(input: {
  email: string;
  feature: string;
  consent: boolean;
}): WaitlistArgs | null {
  if (input.consent !== true) return null;
  const email = normalizeWaitlistEmail(input.email);
  if (email === null || !isPrelaunchFeature(input.feature)) return null;
  return {
    _email: email,
    _feature: input.feature,
    _consent: true,
    _consent_version: PRELAUNCH_WAITLIST_CONSENT_VERSION,
  };
}

/**
 * Вече възникнали права (активен абонамент/платено право) НЕ се затварят —
 * затваря се само новото, недоказано действие.
 */
export function canUseFeature(
  feature: string,
  ctx: { hasActiveEntitlement: boolean },
): boolean {
  if (isNewRawProcessingFeature(feature)) return isFeatureAvailable(feature);
  if (isFeatureAvailable(feature)) return true;
  return isPrelaunchFeature(feature) && ctx.hasActiveEntitlement === true;
}

/**
 * НОВА обработка на суров текст/документ от потребителя чрез AI или ново
 * плащане. Активен абонамент или платено право НЕ е доказателство, че такава
 * нова обработка е готова — затова тук няма изключение за абонати.
 * Достъпът до вече получени резултати, история и сметка НЕ минава оттук и
 * никога не се затваря; правата не се отнемат и не се консумират.
 */
const NEW_RAW_PROCESSING: ReadonlySet<PrelaunchFeature> = new Set<PrelaunchFeature>([
  // Ново генериране изпраща въведените данни към AI — абонаментът не е
  // доказателство за готовност, затова няма изключение за абонати.
  "document_generation",
  "document_review",
  "assistant",
  "one_time_product",
  "subscription",
]);

export function isNewRawProcessingFeature(feature: string): boolean {
  return isPrelaunchFeature(feature) && NEW_RAW_PROCESSING.has(feature);
}

/** Разрешение за НОВА обработка/покупка — само доказано отворена функция. */
export function canStartNewProcessing(feature: string): boolean {
  return isFeatureAvailable(feature);
}

/** Общи етикети за недостъпни състояния — едни и същи навсякъде. */
export const PRELAUNCH_LABELS = {
  badge: "В подготовка",
  cta: "Предварителна заявка",
  purchaseUnavailable: "Покупките още не са активни.",
  processingUnavailable: "Новата обработка още не е отворена. Нищо не е изпратено.",
  sending: "Изпращаме…",
  retry: "Опитайте отново",
} as const;

/** Липсващи доказателства по функция. Не са правни изводи. */
export const PRELAUNCH_BLOCKERS: Readonly<Record<PrelaunchFeature, readonly string[]>> = Object.freeze({
  blank_download: ["Сегашният път за нова бланка използва AI; отделната доставка на готови файлове още няма регистриран окончателен приет файл и съответстваща цена."],
  document_generation: ["Окончателната конфигурация на доставчика, защитата на данните и проверката от начало до край не са потвърдени."],
  document_review: ["Окончателната конфигурация на доставчика, защитата на данните и проверката от начало до край не са потвърдени."],
  assistant: ["Окончателната конфигурация на доставчика, защитата на данните и проверката от начало до край не са потвърдени."],
  one_time_product: ["Новата обработка и окончателните условия за пускане не са потвърдени. За готовите файлове липсват регистрирани точни приети версии и съответстващи цени."],
  subscription: ["Окончателните условия за абонамент и проверката на целия абонаментен път не са потвърдени."],
});

export const GENERAL_ASSISTANCE_NOTE = "Образците и автоматичните предложения са обща помощ и може да изискват адаптация към конкретния случай. Не заменят индивидуална правна консултация.";

export function getPrelaunchStatus(feature: PrelaunchFeature) {
  return {
    title: feature === "blank_download"
      ? "Изтеглянето на нова бланка още не е достъпно; можете да разгледате образеца."
      : feature === "one_time_product" || feature === "subscription"
        ? "Покупките още не са активни."
        : "В подготовка",
    reason: PRELAUNCH_BLOCKERS[feature].join(" "),
    alternateHref: "/catalog",
    alternateLabel: "Разгледайте образците",
  };
}
