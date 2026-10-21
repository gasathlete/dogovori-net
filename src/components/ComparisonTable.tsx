import { Link } from "react-router-dom";
import { ONE_TIME_PRODUCTS, productPath, productPriceLabel } from "@/lib/products";
import { Check, Minus } from "@/icons";

/** Compare our canonical outputs, never unsupported competitor/legal claims. */
const ROWS = [
  { label: "Подробен разбор с извадки", available: [true, true, true] },
  { label: "Поправки в три варианта", available: [false, true, true] },
  { label: "Поправен документ в DOCX и PDF", available: [false, true, true] },
  { label: "План, срокове и две писма", available: [false, false, true] },
  { label: "Едно допълнително прецизиране", available: [false, false, true] },
] as const;

export function ComparisonTable() {
  return (
    <section className="mt-12" aria-labelledby="product-comparison-heading">
      <h3 id="product-comparison-heading" className="font-serif text-2xl font-bold">Кой резултат Ви е необходим?</h3>
      <p className="mt-3 text-sm text-muted-foreground">Един документ, различен обхват. Цените са с ДДС; резултатите не заменят индивидуална правна консултация.</p>
      <div className="mt-6 hidden sm:block">
        <table className="w-full text-left text-sm"><caption className="sr-only">Сравнение на трите еднократни продукта</caption><thead><tr className="border-y border-border bg-secondary"><th scope="col" className="p-4">Получавате</th>{ONE_TIME_PRODUCTS.map((p) => <th key={p.id} scope="col" className="p-4"><Link className="link-ink font-serif text-lg" to={productPath(p)}>{p.shortName}</Link><span className="mt-1 block text-gold">{productPriceLabel(p.id)}</span></th>)}</tr></thead><tbody>{ROWS.map((row) => <tr key={row.label} className="border-b border-border"><th scope="row" className="p-4 font-medium">{row.label}</th>{row.available.map((yes, i) => <td key={i} className="p-4">{yes ? <><Check aria-hidden="true" className="size-5 text-gold" /><span className="sr-only">Включено</span></> : <><Minus aria-hidden="true" className="size-5 text-muted-foreground" /><span className="sr-only">Не е включено</span></>}</td>)}</tr>)}</tbody></table>
      </div>
      <div className="mt-6 space-y-5 sm:hidden">{ONE_TIME_PRODUCTS.map((p, i) => <article key={p.id} className="border-t-2 border-gold pt-4"><h4 className="flex items-baseline justify-between gap-3 font-serif text-xl font-bold"><Link to={productPath(p)} className="link-ink">{p.shortName}</Link><span>{productPriceLabel(p.id)}</span></h4><ul className="mt-3 space-y-2">{ROWS.filter((r) => r.available[i]).map((r) => <li key={r.label} className="flex gap-3 text-sm"><Check aria-hidden="true" className="size-4 shrink-0 text-gold" />{r.label}</li>)}</ul></article>)}</div>
    </section>
  );
}