/**
 * Състоянието на платена продуктова покупка.
 *
 * Тук няма измислено съдържание: показва се точно това, което е записано —
 * платено, в обработка, готово или неуспешно. Самото изготвяне на резултата
 * идва на следващ етап.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Loader2 } from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { isOneTimeProductId, getProduct, productPathById } from "@/lib/products";
import {
  fetchEntitlementBySession,
  fetchLatestEntitlement,
  type ProductEntitlement,
} from "@/lib/productEntitlements";

const STATUS_TEXT: Record<string, string> = {
  paid: "Плащането е получено. Подготвяме обработката.",
  processing: "Обработваме документа Ви.",
  ready: "Резултатът е готов.",
  refinement_processing: "Обработваме уточнението Ви.",
  refinement_ready: "Уточнението е готово.",
  failed: "Обработката не завърши. Свържете се с нас — плащането е записано.",
  refunded: "Плащането е върнато.",
  exhausted: "Включените уточнения са използвани.",
};

export default function ProductResult() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const sessionId = params.get("session_id");
  const [row, setRow] = useState<ProductEntitlement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      const found = sessionId
        ? await fetchEntitlementBySession(user.id, sessionId)
        : await fetchLatestEntitlement(user.id);
      if (!active) return;
      setRow(found);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, sessionId]);

  if (loading) {
    return (
      <main className="flex min-h-[50dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </main>
    );
  }

  if (!row) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Няма намерена покупка</h1>
        <p className="mt-3 text-muted-foreground">
          Ако току-що платихте, изчакайте няколко секунди и опреснете страницата.{" "}
          <Link to="/produkti" className="underline">Вижте продуктите</Link>
        </p>
      </main>
    );
  }

  const name = isOneTimeProductId(row.product_id)
    ? getProduct(row.product_id).name
    : "Продукт";

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-10 md:pb-16">
      <h1 className="text-2xl font-semibold md:text-3xl">{name}</h1>
      <Card className="mt-5 p-5">
        <p className="text-sm font-medium">{STATUS_TEXT[row.status] ?? "Обработваме поръчката Ви."}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Платена сума: {(row.amount_cents / 100).toFixed(2)} €, еднократно.
        </p>
        {isOneTimeProductId(row.product_id) && (
          <p className="mt-4 text-sm">
            <Link to={productPathById(row.product_id)} className="underline">
              Какво включва {name}
            </Link>
          </p>
        )}
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">
        Ще намерите покупката и в{" "}
        <Link to="/account?tab=documents" className="underline">своя профил</Link>.
      </p>
    </main>
  );
}
