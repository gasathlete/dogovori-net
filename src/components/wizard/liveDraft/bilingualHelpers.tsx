export const BILINGUAL_PLACEHOLDER_EN =
  "The parallel English text will be inserted alongside the Bulgarian section in the final bilingual document.";

/** Map common Bulgarian skeleton headings to professional English equivalents. */
export const TITLE_EN: Record<string, string> = {
  "Предмет на договора": "Subject of the Agreement",
  "Предмет на трудовия договор": "Subject of the Employment Agreement",
  "Предмет на пълномощното": "Scope of the Power of Attorney",
  "Предмет на поканата": "Subject of the Notice",
  "Предмет": "Subject",
  "Срок на договора": "Term",
  "Срок и действие": "Term and Effect",
  "Срок и място на работа": "Term and Place of Work",
  "Срок и погасяване": "Term and Repayment",
  "Срок и отмяна": "Term and Revocation",
  "Срок за доброволно изпълнение": "Voluntary Performance Period",
  "Срокове за изпълнение": "Performance Deadlines",
  "Срокове и приемане": "Deadlines and Acceptance",
  "Работно време и почивки": "Working Hours and Rest Periods",
  "Възнаграждение и плащане": "Remuneration and Payment",
  "Трудово възнаграждение": "Salary",
  "Наемна цена и плащане": "Rent and Payment",
  "Стойност и плащане": "Value and Payment",
  "Цена и плащане": "Price and Payment",
  "Навло и плащане": "Freight and Payment",
  "Размер и характер на задължението": "Amount and Nature of the Obligation",
  "Лихва": "Interest",
  "Права и задължения на страните": "Rights and Obligations of the Parties",
  "Задължения на превозвача": "Obligations of the Carrier",
  "Задължения на възложителя": "Obligations of the Principal",
  "Обем на представителната власт": "Scope of Representation",
  "Отговорност и неустойки": "Liability and Penalties",
  "Отговорност и застраховка": "Liability and Insurance",
  "Неустойки": "Penalties",
  "Неустойки и последици при неизпълнение": "Penalties and Consequences of Default",
  "Неустойки и прекратяване": "Penalties and Termination",
  "Обезпечение": "Security",
  "Прекратяване": "Termination",
  "Прекратяване на трудовия договор": "Termination of the Employment Agreement",
  "Платен годишен отпуск": "Paid Annual Leave",
  "Качество и гаранции": "Quality and Warranties",
  "Приемане на работата": "Acceptance of the Work",
  "Авторски и интелектуални права": "Intellectual Property Rights",
  "Конфиденциалност (NDA)": "Confidentiality (NDA)",
  "Управление": "Governance",
  "Форсмажор (непреодолима сила)": "Force Majeure",
  "Подсъдност": "Jurisdiction",
  "Частична недействителност (Severability)": "Severability",
  "Заключителни разпоредби": "Final Provisions",
  "Отчет": "Reporting",
  "Последици при неизпълнение": "Consequences of Default",
};

export function translateTitleToEn(title: string): string {
  const trimmed = title.trim();
  if (TITLE_EN[trimmed]) return TITLE_EN[trimmed];
  // Strip leading numbering like "I. " or "Чл. 1." before lookup.
  const stripped = trimmed.replace(/^([IVXLCM]+\.\s*|Чл\.\s*\d+\.\s*)/i, "").trim();
  if (TITLE_EN[stripped]) return TITLE_EN[stripped];
  return trimmed;
}

export const PARTY_ROLE_EN: Record<string, string> = {
  "Възложител": "Principal",
  "Изпълнител": "Contractor",
  "Наемодател": "Lessor",
  "Наемател": "Lessee",
  "Продавач": "Seller",
  "Купувач": "Buyer",
  "Работодател": "Employer",
  "Служител": "Employee",
  "Заемодател": "Lender",
  "Заемополучател": "Borrower",
  "Упълномощител": "Principal",
  "Пълномощник": "Attorney-in-Fact",
  "Превозвач": "Carrier",
  "Заявител": "Applicant",
  "Получател": "Recipient",
  "Страна А": "Party A",
  "Страна Б": "Party B",
};

export function translatePartyRole(role: string): string {
  return PARTY_ROLE_EN[role.trim()] || role;
}

export function renderPartyIdentifierEn(type?: string): string {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t.includes("физическо")) return ", Personal ID [........]";
  if (t.includes("ет") || t.includes("самоосигуряващо")) return ", Company ID [........], represented by [Authorised Person]";
  if (t.includes("юридическо")) return ", Company ID [........], represented by [Authorised Person], VAT No [........]";
  return ` — ${type}`;
}

export function BilingualPreviewNote({
  documentTitle,
  answeredCount,
  fromTemplate = false,
}: {
  documentTitle: string;
  answeredCount: number;
  fromTemplate?: boolean;
}) {
  return (
    <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
      <p className="font-semibold text-foreground/90">
        Двуезичен преглед на „{documentTitle}" — българският {fromTemplate ? "текст от бланката" : "скелет"} вляво, паралелен английски превод вдясно.
      </p>
      <p className="mt-1.5">
        Финалният документ генерира пълен паралелен английски (BG / EN) с правни клаузи и
        двуколонен експорт в PDF и DOCX.
        {answeredCount > 0 && (
          <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
        )}
      </p>
    </div>
  );
}

