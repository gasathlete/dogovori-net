/**
 * Разбивка на покупката преди и по време на изчакването.
 *
 * Показва САМО проверени данни от реда на покупката: кой продукт е платен,
 * точната сума, какъв файл е приет и колко голям е, плюс какво следва. Няма
 * проценти, няма обещани срокове и няма данни, които не са измерени.
 */
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getProduct, isOneTimeProductId } from "@/lib/products";
import { priceBg, type PaidEntitlementRow } from "@/lib/productPaidResult";
import { stagesFor } from "@/components/product-result/ProcessingProgress";

const KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  pdf: "PDF",
  docx: "DOCX",
});

function formatCount(value: number): string {
  return value.toLocaleString("bg-BG");
}

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("bg-BG", { dateStyle: "medium", timeStyle: "short" });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export function PurchaseBreakdown({
  entitlement,
  headline = "Какво е платено и върху какво работим",
}: {
  readonly entitlement: PaidEntitlementRow;
  readonly headline?: string;
}) {
  const name = isOneTimeProductId(entitlement.product_id)
    ? getProduct(entitlement.product_id).name
    : "Продукт";
  const kind = entitlement.source_kind ? KIND_LABELS[entitlement.source_kind] : null;
  const purchasedAt = formatDate(entitlement.created_at);
  const stages = stagesFor(entitlement.product_id);

  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{headline}</h2>
        <Badge variant="outline">Еднократно</Badge>
      </div>

      <dl className="mt-3">
        <Row label="Продукт" value={name} />
        <Row label="Платена сума" value={`${priceBg(entitlement.amount_cents)} с ДДС`} />
        {kind ? <Row label="Вид файл" value={kind} /> : null}
        {typeof entitlement.source_char_count === "number" ? (
          <Row label="Обем на текста" value={`${formatCount(entitlement.source_char_count)} знака`} />
        ) : null}
        {typeof entitlement.source_page_count === "number" ? (
          <Row label="Страници" value={formatCount(entitlement.source_page_count)} />
        ) : null}
        {purchasedAt ? <Row label="Дата на покупката" value={purchasedAt} /> : null}
        <Row label="Отпечатък на документа" value={entitlement.source_hash.slice(0, 12)} />
      </dl>

      <h3 className="mt-5 text-sm font-semibold">Какво минава документът</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Резултатът е обвързан точно с този файл. Ако документът се промени, не показваме стар
        резултат.
      </p>
      <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
        {stages.map((stage) => (
          <li key={stage}>{STAGE_TEXT[stage] ?? stage}</li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        Разпознатите лични данни се заменят с означения и към модела отива само заместеният текст.
      </p>
    </Card>
  );
}

const STAGE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  awaiting_generation: "Разчитаме текста на файла",
  review: "Проверяваме клаузите и намираме находките",
  corrections: "Подготвяме поправки с три варианта",
  negotiation: "Съставяме плана за преговори",
  messages: "Изготвяме двете писма",
  synthesis: "Подреждаме резултата за преглед",
});
