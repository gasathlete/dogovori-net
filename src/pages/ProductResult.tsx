/**
 * Състоянието на платена продуктова покупка.
 *
 * Показваме състояние само когато плащането е доказано ДВОЙНО: платена поръчка
 * плюс привилегия за същата Stripe сесия, същия продукт и същия документ.
 * Никога не показваме „последната покупка“ вместо търсената.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Card } from "@/components/ui/card";
import { Loader2 } from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { isOneTimeProductId, getProduct, productPathById } from "@/lib/products";
import { fetchPaidProductPurchase, type PaidProductPurchase } from "@/lib/productEntitlements";

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

/** Плащането се записва от Stripe: изчакваме кратко и ограничено. */
const MAX_ATTEMPTS = 10;
const INTERVAL_MS = 2000;

function priceBg(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export default function ProductResult() {
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const sessionId = params.get("session_id");
  const [found, setFound] = useState<PaidProductPurchase | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !sessionId) {
      setState("missing");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      attemptsRef.current += 1;
      try {
        const result = await fetchPaidProductPurchase(user.id, sessionId);
        if (cancelled) return;
        if (result) {
          setFound(result);
          setState("ready");
          return;
        }
      } catch {
        if (cancelled) return;
        setState("error");
        return;
      }
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setState("missing");
        return;
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, authLoading, sessionId]);

  const seo = (
    <Seo
      title="Вашата покупка"
      description="Състояние на еднократна покупка за конкретен документ."
      noindex
    />
  );

  if (state === "loading") {
    return (
      <>
        {seo}
        <Header />
        <main className="flex min-h-[50dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
          <span className="sr-only">Проверяваме плащането…</span>
        </main>
      </>
    );
  }

  if (state !== "ready" || !found) {
    return (
      <>
        {seo}
        <Header />
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="text-2xl font-semibold">
            {state === "error" ? "Не успяхме да проверим плащането" : "Няма намерена покупка"}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {sessionId
              ? "Ако току-що платихте, изчакайте малко и опреснете страницата."
              : "Отворете страницата от връзката след плащане."}{" "}
            <Link to="/produkti" className="underline">Вижте продуктите</Link>
          </p>
        </main>
      </>
    );
  }

  const row = found.entitlement;
  const name = isOneTimeProductId(row.product_id) ? getProduct(row.product_id).name : "Продукт";

  return (
    <>
      {seo}
      <Header />
      <main className="mx-auto max-w-xl px-4 pb-28 pt-10 md:pb-16">
        <h1 className="text-2xl font-semibold md:text-3xl">{name}</h1>
        <Card className="mt-5 p-5">
          <p className="text-sm font-medium">
            {STATUS_TEXT[row.status] ?? "Обработваме поръчката Ви."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Платена сума: {priceBg(row.amount_cents)}, еднократно.
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
    </>
  );
}
