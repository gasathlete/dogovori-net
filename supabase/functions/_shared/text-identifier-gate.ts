/**
 * Серверна преграда за ограничени идентификатори в ТЕКСТ.
 *
 * Условията за ползване на Lovable забраняват обработка на държавни
 * идентификатори (ЕГН, лична карта, паспорт) и номера на финансови сметки
 * (IBAN, банкова сметка). Браузърната преграда (src/lib/privacyGate.ts) намалява
 * случайното изпращане от интерфейса, но не е техническа гаранция: всеки с
 * валиден токен може да извика функция или да запише в базата директно.
 *
 * ВАЖНО и честно: тази проверка се изпълнява СЛЕД като байтовете вече са
 * достигнали средата (заявката е приета, за да бъде прочетена). Тя НЕ е
 * окончателна съответстваща архитектура — тя е ограничаване: спира по-нататъшна
 * обработка, съхранение в модел, тарифиране и плащане. Окончателното решение
 * изисква отделен контролиран бекенд.
 *
 * Разпознаването е с образци и НЕ е съвършено: възможни са както пропуски, така
 * и излишни задействания. Нарочно е консервативно (fail-closed): при съмнение
 * спира. Никъде не се връща и не се записва самата стойност — само вид.
 */

export type RestrictedIdentifierKind = "egn" | "iban" | "bank_account" | "id_document";

export const RESTRICTED_IDENTIFIER_LABELS: Record<RestrictedIdentifierKind, string> = {
  egn: "ЕГН",
  iban: "IBAN",
  bank_account: "номер на банкова сметка",
  id_document: "номер на лична карта или паспорт",
};

export const RESTRICTED_IDENTIFIER_BLOCKED_CODE = "restricted_identifier_blocked";

export function restrictedIdentifierMessage(
  kinds: readonly RestrictedIdentifierKind[],
): string {
  const found = kinds.map((k) => RESTRICTED_IDENTIFIER_LABELS[k]).join(", ");
  const suffix = found ? ` (${found})` : "";
  return `Открихме ограничени лични данни в текста${suffix}. Не можем да ги обработваме. Заменете ги при Вас — например [ЕГН], [IBAN], [номер на лична карта] — и изпратете отново. Истинските данни попълнете в готовия документ на Вашето устройство.`;
}

const EGN_BARE_RE = /\d{10}/g;
const EGN_LABELLED_RE = /(?:ЕГН|егн|Егн|E\.?G\.?N|ЛНЧ|лнч)\s*(?:№|:|\.|-)?\s*([\d\s-]{6,})/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){10,26}\b/g;
const IBAN_LABELLED_RE = /(?:IBAN|ИБАН)\s*(?:№|:|-)?\s*([A-Z0-9 -]{8,})/gi;
const BANK_ACCOUNT_RE =
  /(?:банкова\s*сметка|разплащателна\s*сметка|сметка|account\s*number|acc\.?\s*no)\s*(?:№|:|-)?\s*([A-Z0-9][A-Z0-9 -]{7,})/gi;
const ID_DOCUMENT_RE =
  /(?:лична\s*карта|л\.?\s?к\.?|паспорт|passport|id\s*card)\s*(?:№|:|-)?\s*([A-Z0-9]{5,})/gi;

const MAX_DEPTH = 6;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Достоверно ЕГН по структура: 10 цифри с възможна дата, БЕЗ изискване за вярна
 * контролна сума. Грешна контролна сума не прави стойността безопасна — тя пак
 * е държавен идентификатор или много близко до него.
 */
export function isPlausibleEgnDigits(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(d)) return false; // 0000000000 и подобни не са стойност
  const month = Number(d.slice(2, 4));
  const day = Number(d.slice(4, 6));
  const monthOk =
    (month >= 1 && month <= 12) ||
    (month >= 21 && month <= 32) ||
    (month >= 41 && month <= 52);
  if (!monthOk) return false;
  return day >= 1 && day <= 31;
}

/** Връща само ВИДОВЕТЕ намерени ограничени идентификатори — никога стойности. */
export function findRestrictedIdentifierKinds(
  input: string | null | undefined,
): RestrictedIdentifierKind[] {
  const text = typeof input === "string" ? input : String(input ?? "");
  if (!text) return [];
  const kinds = new Set<RestrictedIdentifierKind>();

  for (const m of text.matchAll(EGN_BARE_RE)) {
    if (isPlausibleEgnDigits(m[0])) {
      kinds.add("egn");
      break;
    }
  }
  if (!kinds.has("egn")) {
    for (const m of text.matchAll(EGN_LABELLED_RE)) {
      if (digitsOnly(m[1]).length >= 6) {
        kinds.add("egn");
        break;
      }
    }
  }

  for (const m of text.matchAll(IBAN_RE)) {
    const compact = m[0].replace(/[ -]/g, "");
    if (compact.length >= 15 && /\d/.test(compact.slice(4))) {
      kinds.add("iban");
      break;
    }
  }
  if (!kinds.has("iban")) {
    for (const m of text.matchAll(IBAN_LABELLED_RE)) {
      if (digitsOnly(m[1]).length >= 6) {
        kinds.add("iban");
        break;
      }
    }
  }

  for (const m of text.matchAll(BANK_ACCOUNT_RE)) {
    if (digitsOnly(m[1]).length >= 6) {
      kinds.add("bank_account");
      break;
    }
  }

  for (const m of text.matchAll(ID_DOCUMENT_RE)) {
    if (digitsOnly(m[1]).length >= 5) {
      kinds.add("id_document");
      break;
    }
  }

  return [...kinds];
}

/** Обхожда произволна структура (тяло на заявка, отговори на въпросник). */
export function findRestrictedIdentifierKindsDeep(
  value: unknown,
  depth = 0,
): RestrictedIdentifierKind[] {
  if (depth > MAX_DEPTH) return [];
  if (typeof value === "string") return findRestrictedIdentifierKinds(value);
  if (typeof value === "number" || typeof value === "bigint") {
    return findRestrictedIdentifierKinds(String(value));
  }
  if (Array.isArray(value)) {
    const out = new Set<RestrictedIdentifierKind>();
    for (const item of value) {
      for (const k of findRestrictedIdentifierKindsDeep(item, depth + 1)) out.add(k);
    }
    return [...out];
  }
  if (value && typeof value === "object") {
    const out = new Set<RestrictedIdentifierKind>();
    for (const item of Object.values(value as Record<string, unknown>)) {
      for (const k of findRestrictedIdentifierKindsDeep(item, depth + 1)) out.add(k);
    }
    return [...out];
  }
  return [];
}

export function hasRestrictedIdentifiers(value: unknown): boolean {
  return findRestrictedIdentifierKindsDeep(value).length > 0;
}

/**
 * Единственият отговор при задействане: 422 със стабилен код и вид, без стойност.
 */
export function restrictedIdentifierBlockedResponse(
  corsHeaders: Record<string, string>,
  kinds: readonly RestrictedIdentifierKind[],
  status = 422,
): Response {
  return new Response(
    JSON.stringify({
      error: restrictedIdentifierMessage(kinds),
      message: restrictedIdentifierMessage(kinds),
      code: RESTRICTED_IDENTIFIER_BLOCKED_CODE,
      restricted_kinds: [...kinds],
    }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Удобна обвивка: ако има намерено — готов отговор; иначе `null`.
 * Извиква се ПРЕДИ резервация на квота, създаване на задача, платежна сесия или
 * извикване на модел.
 */
export function restrictedIdentifierBlock(
  value: unknown,
  corsHeaders: Record<string, string>,
  status = 422,
): Response | null {
  const kinds = findRestrictedIdentifierKindsDeep(value);
  if (kinds.length === 0) return null;
  return restrictedIdentifierBlockedResponse(corsHeaders, kinds, status);
}

/** Само видовете, безопасни за журнал (без стойности). */
export function restrictedIdentifierLogFields(
  kinds: readonly RestrictedIdentifierKind[],
): { code: string; restricted_kinds: string[] } {
  return { code: RESTRICTED_IDENTIFIER_BLOCKED_CODE, restricted_kinds: [...kinds] };
}
