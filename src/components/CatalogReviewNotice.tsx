import { CATALOG_REVIEW_STATUS } from "@/lib/templateReviewStatus";

export function CatalogReviewNotice({ catalog = false }: { catalog?: boolean }) {
  return (
    <div data-testid={catalog ? "catalog-review-notice" : "template-review-notice"} className="my-3 space-y-2">
      <span className="inline-flex rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-xs font-semibold text-gold">{CATALOG_REVIEW_STATUS.badge}</span>
      <p className="text-sm leading-relaxed text-muted-foreground">{catalog ? CATALOG_REVIEW_STATUS.notice : CATALOG_REVIEW_STATUS.warning}</p>
    </div>
  );
}
