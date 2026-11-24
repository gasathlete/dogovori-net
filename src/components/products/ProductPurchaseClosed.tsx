import { Button } from "@/components/ui/button";
import { openPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { PRODUCT_CLOSED_MESSAGES, type ProductPurchaseReason } from "@/lib/productPurchaseStatus";

/** „Скоро“ + „Извести ме при пускане“ (съществуващият механизъм с явно съгласие). */
export function ProductPurchaseClosed({ reason, productId, source }: {
  reason: ProductPurchaseReason; productId: string; source: "product_detail" | "product_start";
}) {
  return (
    <div data-testid="product-prelaunch-status" data-reason={reason} role="status" className="rounded border border-border px-4 py-3 text-sm">
      <p className="font-semibold text-foreground">Скоро</p>
      <p className="mt-1 leading-relaxed text-muted-foreground">{PRODUCT_CLOSED_MESSAGES[reason]} Не е извършено плащане.</p>
      <Button type="button" variant="outline" className="mt-3 min-h-11 w-full whitespace-normal"
        data-testid="product-notify-launch"
        onClick={() => openPrelaunchWaitlist("one_time_product", { source, productId })}>
        Извести ме при пускане
      </Button>
    </div>
  );
}
