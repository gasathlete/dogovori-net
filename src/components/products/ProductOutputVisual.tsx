import { BrandMark } from "@/components/BrandLogo";
import { CHECK_FINDINGS, SAMPLE_DOC } from "@/components/products/previewData";
import type { OneTimeProductId } from "@/lib/products";

const OUTPUTS: Record<OneTimeProductId, readonly string[]> = {
  contract_check: ["Извадка от документа", "Тежест и последица", "Следваща стъпка"],
  contract_improve: ["Преди / След", "Три варианта на текста", "DOCX и PDF"],
  negotiation_package: ["План за преговори", "Действия и срокове", "Две писма"],
};

/** Native presentation only: never used in paid results or saved documents. */
export function ProductOutputVisual({ productId, detailed = false }: { productId: OneTimeProductId; detailed?: boolean }) {
  const finding = CHECK_FINDINGS[0];
  return (
    <figure className={detailed ? "brand-document brand-document-detailed" : "brand-document"}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border pb-3 text-xs text-muted-foreground">
        <span>Пример · {detailed ? SAMPLE_DOC.title : "резултат"}</span>
        <BrandMark decorative className="h-9 w-11" />
      </figcaption>
      {detailed && finding ? (
        <>
          <p className="mt-5 text-xs text-muted-foreground">{SAMPLE_DOC.parties} · измислени страни</p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-tight">{finding.title}</h2>
          <p className="mt-3 text-xs font-semibold text-gold">{finding.location} · {finding.severity} тежест</p>
          <blockquote className="my-4 border-l-2 border-gold pl-4 font-serif text-base leading-relaxed">{finding.excerpt}</blockquote>
          <p className="border-t border-border pt-3 text-sm leading-relaxed"><span className="font-semibold">Следваща стъпка: </span>{finding.nextStep}</p>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Демонстрация, не Вашият документ. Не заменя индивидуална правна консултация.</p>
        </>
      ) : (
        <ol className="mt-3 space-y-2 text-sm">
          {OUTPUTS[productId].map((line, i) => (
            <li key={line} className="flex items-baseline gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
              <span className="font-serif text-gold" aria-hidden="true">0{i + 1}</span><span>{line}</span>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}