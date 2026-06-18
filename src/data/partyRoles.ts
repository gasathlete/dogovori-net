/**
 * Centralised party-role inference.
 *
 * Given a contract/document name, returns the conventional Bulgarian
 * legal role pair (Strana A, Strana Б). Used by the wizard, the
 * generic sub-wizard builder, the live preview and the PDF/DOCX
 * exporters to ensure the signing block always carries the correct
 * role labels — a critical legal requirement.
 *
 * Keep this file as the single source of truth for keyword → role
 * mapping. Update here and the rest of the platform follows.
 */

export type PartyRoles = { a: string; b: string };

interface Rule {
  /** Regex tested against the lowercased document/contract name. */
  test: RegExp;
  roles: PartyRoles;
  /** Optional negative regex — if it matches, the rule is skipped. */
  skipIf?: RegExp;
}

/**
 * Returns true when the document name describes a unilateral act
 * (declaration, will, application, complaint, single-party protocol).
 * These never reach the bilateral signing block and have no "Party B".
 */
export function isUnilateralDocument(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return /^(деклараци|саморъчно завещани|нотариално завещани|завещани|жалба|заявление|молба|оплакване|искане|уведомление|известие|нотариална покана|покана за|протокол за бракуване|протокол за инвентаризац|протокол за самооценк)/.test(n);
}

// Order matters — more specific rules first. The first matching rule wins.
const RULES: Rule[] = [
  // Unilateral acts → single party (B left empty by convention).
  { test: /^\s*(деклараци)/, roles: { a: "Декларатор", b: "" } },
  { test: /^\s*(саморъчно завещани|нотариално завещани|завещани)/, roles: { a: "Завещател", b: "" } },
  { test: /^\s*(жалба|оплакване|сигнал до)/, roles: { a: "Жалбоподател", b: "" } },
  { test: /^\s*(заявление|молба|искане)/, roles: { a: "Заявител", b: "" } },
  { test: /^\s*(уведомление|известие|нотариална покана|покана за)/, roles: { a: "Уведомител", b: "" } },
  { test: /^\s*протокол за (бракуване|инвентаризац|самооценк)/, roles: { a: "Съставител", b: "" } },

  // Receipt / acknowledgement of received sum, deposit, earnest money, goods, documents.
  { test: /^\s*разписка(\s|$)|^\s*протокол за получаване/, roles: { a: "Получател", b: "Платец" } },

  // Notarial / pre-contract for property sale → Продавач/Купувач
  { test: /(предварителен|окончателен|нотариал).*(покупко|продажб)/, roles: { a: "Продавач", b: "Купувач" } },

  // Sale / purchase (incl. capital, shares, vehicles, goods, property)
  { test: /(покупко|продажб|продаж|изкупуван)/, roles: { a: "Продавач", b: "Купувач" },
    skipIf: /(комисион|консигнац)/ },

  // Commission sale / consignment
  { test: /(комисион|консигнац)/, roles: { a: "Комитент", b: "Комисионер" } },

  // Donation
  { test: /(дарен)/, roles: { a: "Дарител", b: "Надарен" } },

  // Loan of money / credit
  { test: /(заем за послужване|заем на вещ)/, roles: { a: "Заемодател", b: "Заемател" } },
  { test: /(заем|кредит|потребителски кредит|ипотечен)/, roles: { a: "Заемодател", b: "Заемополучател" },
    skipIf: /(поръчителств)/ },

  // Surety
  { test: /(поръчителств)/, roles: { a: "Кредитор", b: "Поръчител" } },

  // Pledge / mortgage
  { test: /(особен залог|залог)/, roles: { a: "Залогодател", b: "Заложен кредитор" } },
  { test: /(ипотек)/, roles: { a: "Ипотекарен длъжник", b: "Ипотекарен кредитор" } },

  // Agricultural lease
  { test: /(аренд)/, roles: { a: "Арендодател", b: "Арендатор" } },

  // Rent / lease (real estate, vehicles, equipment)
  { test: /(наем|пренаем|лизинг)/, roles: { a: "Наемодател", b: "Наемател" } },

  // Employment
  { test: /(трудов договор|труд|работодател|служител|назначаван)/, roles: { a: "Работодател", b: "Служител" } },

  // Civil / services / works
  { test: /(изработк|изработван|подизпълнен|сервиз|поддръжк|ремонт)/, roles: { a: "Възложител", b: "Изпълнител" } },
  { test: /(консулт|услуг|поръчк|граждански договор)/, roles: { a: "Възложител", b: "Изпълнител" },
    skipIf: /(превоз|спедиц|комисион|поръчителств)/ },

  // Transport / forwarding / courier
  { test: /(превоз|спедиц|логист|куриер)/, roles: { a: "Възложител", b: "Превозвач" } },

  // Brokerage / agency / intermediation
  { test: /(брокер|посредни|агентск|представителств)/, roles: { a: "Доверител", b: "Посредник" } },

  // Licence / franchise / IP
  { test: /(лиценз|франчайз)/, roles: { a: "Лицензодател", b: "Лицензополучател" } },
  { test: /(авторск|сродни права|интелектуална собственост)/, roles: { a: "Правоносител", b: "Ползвател" } },

  // NDA / confidentiality
  { test: /(nda|поверителн|конфиденциалн|неразкриван)/, roles: { a: "Разкриваща страна", b: "Получаваща страна" } },

  // Power of attorney
  { test: /(пълномощн|упълномощав)/, roles: { a: "Упълномощител", b: "Пълномощник" } },

  // Assignment of claim
  { test: /(цеси|прехвърлян на вземан|прехвърляне на вземане)/, roles: { a: "Цедент", b: "Цесионер" } },

  // Insurance
  { test: /(застрахов)/, roles: { a: "Застраховател", b: "Застрахован" } },

  // Distribution / supply
  { test: /(дистрибут)/, roles: { a: "Доставчик", b: "Дистрибутор" } },
  { test: /(доставк|снабдяван)/, roles: { a: "Доставчик", b: "Клиент" } },

  // Sponsorship
  { test: /(спонсорств|спонсор)/, roles: { a: "Спонсор", b: "Спонсориран" } },

  // Partnership / joint venture
  { test: /(съдружие|партньорств|съвместн|joint venture|консорциум)/, roles: { a: "Партньор А", b: "Партньор Б" } },

  // Medical
  { test: /(медицинск|лечебн|пациент)/, roles: { a: "Лечебно заведение", b: "Пациент" } },

  // Training / education
  { test: /(обучен|образоват|преподаван)/, roles: { a: "Обучител", b: "Обучаем" } },

  // Sports / artist engagement
  { test: /(спортист|атлет|артист|изпълнителск)/, roles: { a: "Организатор", b: "Изпълнител" } },
];

/**
 * Returns the inferred party-role pair for a contract/document name,
 * or null when no rule matches confidently.
 */
export function inferPartyRoles(documentName: string | null | undefined): PartyRoles | null {
  if (!documentName) return null;
  const n = documentName.toLowerCase();
  for (const rule of RULES) {
    if (rule.skipIf && rule.skipIf.test(n)) continue;
    if (rule.test.test(n)) return { ...rule.roles };
  }
  return null;
}

/** Genitive form of role name as used in the wizard preview/signature block. */
function toGenitive(role: string): string {
  // Already genitive (ends with "я" or "а" after consonant) — leave it.
  if (/[яа]$/.test(role)) return role;
  // Adjective-like ending in "ен/ел/ор/ач" → append "я".
  if (/(ел|ор|ач|ент|ик|ник)$/i.test(role)) return role + "я";
  return role;
}

/**
 * Returns roles in the form used for "за [X]" wording (genitive),
 * matching the project's existing convention of "Наемодателя/Наемателя".
 */
export function inferPartyRolesGenitive(documentName: string | null | undefined): PartyRoles | null {
  const r = inferPartyRoles(documentName);
  if (!r) return null;
  return { a: toGenitive(r.a), b: toGenitive(r.b) };
}

/**
 * Heuristic: returns true when the supplied parties pair clearly does not
 * match what would be expected for this document name. Used as a defensive
 * guard in the wizard / exporters so a misconfigured sector default cannot
 * leak "Наемодател/Наемател" into a sale contract's signature block.
 */
export function partiesAreCompatible(
  documentName: string | null | undefined,
  parties: PartyRoles | null | undefined,
): boolean {
  if (!parties || !parties.a) return false;
  // Unilateral documents (declarations, wills, applications) have a single
  // party — accept any A label when B is empty; these never reach the
  // bilateral signing block.
  if (!parties.b) return true;
  const expected = inferPartyRoles(documentName);
  if (!expected) return true; // no opinion → trust caller
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я]+/gi, "");
  const matches = (have: string, want: string) =>
    norm(have).startsWith(norm(want).slice(0, Math.min(6, norm(want).length)));
  const direct = matches(parties.a, expected.a) && matches(parties.b, expected.b);
  const reversed = matches(parties.a, expected.b) && matches(parties.b, expected.a);
  return direct || reversed;
}

