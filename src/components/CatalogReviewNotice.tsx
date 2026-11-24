import { CATALOG_REVIEW_STATUS } from "@/lib/templateReviewStatus";

/**
 * One quiet line, no badge. Allowed only at the top of catalog/sector/category
 * pages (`catalog`) and once on a template detail page — never on cards,
 * footer, hero, demos or the story.
 */
export function CatalogReviewNotice({ catalog = false }: { catalog?: boolean }) {
  return (
    <p
      data-testid={catalog ? "catalog-review-notice" : "template-review-notice"}
      className="my-3 text-sm leading-relaxed text-muted-foreground"
    >
      {catalog ? CATALOG_REVIEW_STATUS.notice : CATALOG_REVIEW_STATUS.warning}
    </p>
  );
}
