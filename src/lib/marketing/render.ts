import type { GeneratedContract } from "@/lib/exporterTypes";
import { fmtEur } from "@/lib/pricing";
import type { MarketingItem, MarketingTemplate } from "./templates";

export type MarketingValues = Record<string, string | MarketingItem[] | undefined>;

const ROMAN = ["I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.", "IX.", "X."];

export const emptyItem = (): MarketingItem => ({ description: "", qty: 1, unit: "бр.", unitPrice: 0 });

export const itemsTotal = (items: MarketingItem[]): number =>
  items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);

const asText = (v: MarketingValues[string]): string =>
  typeof v === "string" ? v.trim() : "";

function itemsBlock(items: MarketingItem[]): string {
  const rows = items
    .filter((i) => i.description.trim())
    .map((i, idx) => {
      const line = (Number(i.qty) || 0) * (Number(i.unitPrice) || 0);
      return `${idx + 1}. ${i.description} — ${i.qty} ${i.unit} × ${fmtEur(Number(i.unitPrice) || 0)} = ${fmtEur(line)}`;
    });
  if (!rows.length) return "";
  rows.push("");
  rows.push(`ОБЩО: ${fmtEur(itemsTotal(items))}`);
  return rows.join("\n");
}

export function marketingTitle(tpl: MarketingTemplate, values: MarketingValues): string {
  return tpl.titleTemplate.replace(/\{(\w+)\}/g, (_, key: string) => asText(values[key]) || "…");
}

/**
 * Превръща попълнения шаблон в структурата, която експортерите (PDF/DOCX)
 * вече разбират — така рекламните материали автоматично получават
 * персоналното брандиране на потребителя.
 */
export function renderMarketingDocument(
  tpl: MarketingTemplate,
  values: MarketingValues,
): GeneratedContract {
  const clauses: GeneratedContract["clauses"] = [];
  let n = 0;

  const push = (title: string, body: string) => {
    if (!body.trim()) return;
    clauses.push({ number: ROMAN[n] ?? `${n + 1}.`, title, body });
    n += 1;
  };

  for (const section of tpl.sections) {
    push(section.heading, asText(values[section.fromField]));
  }

  if (tpl.hasItems) {
    const items = Array.isArray(values.items) ? (values.items as MarketingItem[]) : [];
    const block = itemsBlock(items);
    if (block) {
      // Позициите винаги стоят преди условията, за да са първото нещо, което
      // клиентът вижда след въведението.
      clauses.splice(1, 0, { number: "•", title: "ПОЗИЦИИ", body: block });
      clauses.forEach((c, i) => {
        c.number = ROMAN[i] ?? `${i + 1}.`;
      });
    }
  }

  const recipient = asText(values.client);
  const preambleParts = [
    recipient ? `До: ${recipient}` : "",
    asText(values.validUntil) ? `Валидна до: ${asText(values.validUntil)}` : "",
    asText(values.dueDate) ? `Срок за плащане: ${asText(values.dueDate)}` : "",
    `Дата: ${new Date().toLocaleDateString("bg-BG")}`,
  ].filter(Boolean);

  return {
    title: marketingTitle(tpl, values),
    preamble: preambleParts.join("\n"),
    clauses,
    closing: tpl.closing,
  };
}
