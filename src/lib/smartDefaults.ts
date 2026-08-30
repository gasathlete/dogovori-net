/**
 * Интелигентни подразбиращи се стойности (smart defaults) за най-често
 * използваните документи.
 *
 * Защо: най-голямото отпадане в уизарда е на ПЪРВОТО поле. Когато формата
 * вече съдържа разумна начална стойност, потребителят коригира, вместо да
 * започва „от белия лист“.
 *
 * Правила:
 * - Никога не предпопълваме лични данни (имена, ЕГН, адреси, IBAN).
 * - Никога не предпопълваме дати за падеж/краен срок/прекратяване.
 * - Стойностите са неутрални и правно безопасни (нормални пазарни условия).
 */

type FieldRule = { match: RegExp; value: string };

interface DocDefaults {
  /** Съвпадение по име на документа (без регистър). */
  doc: RegExp;
  rules: FieldRule[];
}

const DOC_DEFAULTS: DocDefaults[] = [
  {
    // Пълномощно за управление на МПС (в т.ч. в чужбина)
    doc: /пълномощно.*(мпс|автомобил|превозно средство)/i,
    rules: [
      { match: /(valid|срок|период).*(month|год|месец)|срок на (пълномощното|валидност)/i, value: "12 месеца" },
      { match: /notar|нотариал/i, value: "Да" },
      { match: /(abroad|чужбина|територия|държав)/i, value: "Държави от Европейския съюз" },
      { match: /(purpose|цел|обхват|правомощ)/i, value: "Управление на МПС, представителство пред контролни органи и застрахователи" },
      { match: /(substitut|преупълномощ)/i, value: "Не" },
    ],
  },
  {
    // Договор за наем на гараж / паркомясто
    doc: /наем.*(гараж|паркомясто|паркинг)/i,
    rules: [
      { match: /(rent_amount|наем|месечна ц|цена)/i, value: "80" },
      { match: /(deposit|депозит|гаранц)/i, value: "1 месечен наем" },
      { match: /(term|срок).*(наем|договор)|наемен срок/i, value: "12 месеца" },
      { match: /(payment_day|ден на плащане|дата на плащане)/i, value: "5-о число на месеца" },
      { match: /(utilit|консумативи|ток|електроенергия)/i, value: "За сметка на наемателя" },
      { match: /(notice|предизвест)/i, value: "1 месец" },
    ],
  },
  {
    // Учредителен акт на ЕООД
    doc: /(учредителен акт|дружествен договор).*(еоод|оод)|еоод.*учредителен/i,
    rules: [
      { match: /(capital|капитал)/i, value: "2" },
      { match: /(share|дял|части|номинал)/i, value: "2 дяла по 1 евро" },
      { match: /(term|срок).*(дружеств|договор)/i, value: "Безсрочен" },
      { match: /(manage|управител|представител)/i, value: "Едноличният собственик на капитала" },
      { match: /(activity|предмет на дейност|дейност)/i, value: "Консултантски услуги и всяка друга дейност, незабранена от закона" },
      { match: /(fiscal|финансова година|отчетен период)/i, value: "Календарна година" },
    ],
  },
];

/** Полета, които никога не предпопълваме (лични данни / критични дати). */
const NEVER = /egn|егн|iban|адрес|address|birth|раждан|name|име|passport|паспорт|карта|end|due|expir|termination|краен|падеж|прекратяване/i;

/**
 * Връща подразбиращи се стойности за подаден документ и списък от полета.
 * `fields` е сплеснатият списък от въпроси на уизарда.
 */
export function smartDefaultsFor(
  docName: string | null | undefined,
  fields: Array<{ id: string; label?: string; type?: string; options?: string[] }>,
): Record<string, string> {
  if (!docName) return {};
  const entry = DOC_DEFAULTS.find((d) => d.doc.test(docName));
  if (!entry) return {};

  const patch: Record<string, string> = {};
  for (const f of fields) {
    const key = `${f.id} ${f.label ?? ""}`;
    if (NEVER.test(key)) continue;
    if (f.type && !["text", "number", "textarea", "select", "radio"].includes(f.type)) continue;
    const rule = entry.rules.find((r) => r.match.test(key));
    if (!rule) continue;
    // За select/radio задаваме стойност само ако е сред опциите.
    if (f.options && f.options.length > 0 && !f.options.includes(rule.value)) continue;
    if (f.type === "number" && !/^\d+([.,]\d+)?$/.test(rule.value)) continue;
    patch[f.id] = rule.value;
  }
  return patch;
}
