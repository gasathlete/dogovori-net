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

/** Всички затворени. Отваряне само с изрично решение и проверка преди пускане. */
const AVAILABLE: Readonly<Record<PrelaunchFeature, boolean>> = Object.freeze({
  blank_download: false,
  document_generation: false,
  document_review: false,
  assistant: false,
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

export const PRELAUNCH_COPY = {
  title: "Предварителна заявка",
  body:
    "Ще Ви информираме, когато изпълним необходимите законови изисквания, за да може сайтът да Ви помага. Ако желаете, оставете имейл, за да получите преференциални условия, когато услугата е готова.",
  emailLabel: "Имейл",
  consentLabel:
    "Съгласявам се Договори.нет да съхранява този имейл, за да ме уведоми, когато услугата е готова. Мога да оттегля съгласието си по всяко време.",
  submit: "Изпратете заявката",
  close: "Затворете",
  success: "Заявката е приета. Сега не изпращаме имейли.",
  unavailable:
    "В момента не можем да приемем заявката. Нищо не е записано. Опитайте по-късно.",
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
  if (isFeatureAvailable(feature)) return true;
  return isPrelaunchFeature(feature) && ctx.hasActiveEntitlement === true;
}

/** Липсващи доказателства по функция. Не са правни изводи. */
export const PRELAUNCH_BLOCKERS: Readonly<Record<PrelaunchFeature, readonly string[]>> = Object.freeze({
  blank_download: ["юридически преглед на бланките", "път без AI с тест (download-blank ползва AI)", "условия за цифрово съдържание"],
  document_generation: ["DPA с AI доставчик", "AI Act прозрачност", "юридически преглед"],
  document_review: ["DPA с AI доставчик и нулево съхранение", "миграции 0039–0041 и pgTAP", "ROPA/DPIA"],
  assistant: ["DPA с AI доставчик", "AI Act прозрачност"],
  one_time_product: ["sandbox плащане, дублиран webhook и реверс", "DPA с AI доставчик", "условия за покупка"],
  subscription: ["sandbox плащане и реверс", "условия за цифрово съдържание", "фактура и ДДС"],
});
