/**
 * „Моите покупки“ — списък на платените еднократни продукти.
 *
 * Показва САМО проверени данни от собствените редове (RLS): продукт, точна
 * платена сума, обвързания документ и състоянието на обработката. Клиентът не
 * пише нищо и не показва резултат тук — резултатът се отваря по точното право.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getProduct, isOneTimeProductId } from "@/lib/products";
import { priceBg } from "@/lib/productPaidResult";
import { ArrowRight } from "@/icons";

interface PurchaseRow {
  id: string;
  product_id: string;
  status: string;
  amount_cents: number;
  environment: string;
  source_kind: string | null;
  source_char_count: number | null;
  source_page_count: number | null;
  source_hash: string;
  refinements_included: number;
  refinements_used: number;
  refinement_state: string;
  created_at: string;
}

const SELECT = [
  "id",
  "product_id",
  "status",
  "amount_cents",
  "environment",
  "source_kind",
  "source_char_count",
  "source_page_count",
  "source_hash",
  "refinements_included",
  "refinements_used",
  "refinement_state",
  "created_at",
].join(", ");

// Таблицата идва с продуктовите миграции; докато генерираните типове не я
// включват, четем през нетипизиран достъп и стесняваме резултата тук.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  paid: "Плащането е потвърдено",
  processing: "В обработка",
  ready: "Готово",
  failed: "Не завърши",
  refunded: "Възстановено",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("bg-BG", { dateStyle: "medium", timeStyle: "short" });
}

export default function MyPurchases() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = React.useState<readonly PurchaseRow[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!user) return;
    void (async () => {
      const { data, error } = await db
        .from("product_entitlements")
        .select(SELECT)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        setFailed(true);
        setRows([]);
        return;
      }
      setRows((data as PurchaseRow[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <>
      <Seo
        title="Моите покупки"
        description="Вашите еднократни покупки, обвързаният документ и състоянието на обработката."
        noindex
      />
      <Header />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 md:pb-16 md:pt-12">
        <h1 className="text-2xl font-semibold md:text-3xl">Моите покупки</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Всяка покупка е обвързана точно с документа, който сте качили. Резултатът се отваря само
          за същия документ.
        </p>

        {authLoading || rows === null ? (
          <p className="mt-6 text-sm text-muted-foreground">Зареждаме покупките.</p>
        ) : failed ? (
          <Card className="mt-6 p-5">
            <p className="text-sm">
              Не успяхме да заредим покупките. Опитайте отново след малко.
            </p>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="mt-6 p-5">
            <p className="text-sm">Още няма покупки.</p>
            <Button asChild className="mt-4 min-h-11">
              <Link to="/produkti">Вижте продуктите</Link>
            </Button>
          </Card>
        ) : (
          <ul className="mt-6 space-y-4">
            {rows.map((row) => {
              const name = isOneTimeProductId(row.product_id)
                ? getProduct(row.product_id).name
                : "Продукт";
              const label = STATUS_LABELS[row.status] ?? "В обработка";
              const isNegotiation = row.product_id === "negotiation_package";
              return (
                <li key={row.id}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold">{name}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {priceBg(row.amount_cents)} с ДДС, еднократно · {formatDate(row.created_at)}
                        </p>
                      </div>
                      <Badge variant={row.status === "ready" ? "default" : "outline"}>{label}</Badge>
                    </div>

                    <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-sm text-muted-foreground">Вид файл</dt>
                        <dd className="text-sm font-medium">
                          {row.source_kind ? row.source_kind.toUpperCase() : "—"}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-sm text-muted-foreground">Обем на текста</dt>
                        <dd className="text-sm font-medium">
                          {typeof row.source_char_count === "number"
                            ? `${row.source_char_count.toLocaleString("bg-BG")} знака`
                            : "—"}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-sm text-muted-foreground">Страници</dt>
                        <dd className="text-sm font-medium">
                          {typeof row.source_page_count === "number" ? row.source_page_count : "—"}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-sm text-muted-foreground">Отпечатък</dt>
                        <dd className="text-sm font-medium">{row.source_hash.slice(0, 12)}</dd>
                      </div>
                      {isNegotiation && (
                        <div className="flex items-baseline justify-between gap-2 sm:col-span-2">
                          <dt className="text-sm text-muted-foreground">Уточнение по преговора</dt>
                          <dd className="text-sm font-medium">
                            използвано {row.refinements_used} от {row.refinements_included}
                          </dd>
                        </div>
                      )}
                    </dl>

                    <Button asChild variant="outline" className="mt-4 min-h-11 w-full sm:w-auto">
                      <Link to={`/produkti/rezultat?entitlement_id=${row.id}`}>
                        {row.status === "ready" ? "Отвори резултата" : "Виж състоянието"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
