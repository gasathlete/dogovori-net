import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ORDER_STATE_LABEL, downloadStaticOrder, formatEur, returnBanner, staticCall, type StaticOrder } from "@/lib/staticCatalog";

export default function StaticPurchases() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState<StaticOrder[] | null>(null);
  const [error, setError] = useState("");
  const [dlError, setDlError] = useState("");
  const polls = useRef(0);

  const load = useCallback(async () => {
    try { setOrders((await staticCall<{ orders: StaticOrder[] }>({ action: "orders" })).orders); setError(""); }
    catch { setError("Покупките не могат да се заредят в момента."); }
  }, []);

  useEffect(() => { document.title = "Моите покупки | Dogovori.net"; if (!loading && user) void load(); }, [user, loading, load]);

  const focus = orders?.find((o) => o.id === params.get("order"));
  // Poll briefly while the webhook confirms; state never comes from the return URL.
  useEffect(() => {
    if (!params.get("order") || params.get("cancelled") || focus?.state === "paid" || focus?.state === "refunded" || polls.current >= 10) return;
    const t = setTimeout(() => { polls.current += 1; void load(); }, 3000);
    return () => clearTimeout(t);
  }, [orders, focus, params, load]);

  const banner = returnBanner(params, focus);
  const tone = { info: "border-border bg-muted text-foreground", success: "border-primary/40 bg-primary/10 text-foreground", error: "border-destructive/40 bg-destructive/10 text-foreground" };

  return (
    <main className="container mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-semibold text-foreground">Моите покупки</h1>
      {banner && <p role="status" className={`rounded-lg border p-4 text-sm ${tone[banner.tone]}`}>{banner.text}</p>}
      {!loading && !user && <p className="text-muted-foreground"><Link to="/auth" className="underline">Влезте в профила си</Link>, за да видите покупките си.</p>}
      {error && <p role="alert" className="text-destructive">{error} <button className="underline" onClick={() => void load()}>Опитайте отново</button></p>}
      {user && orders?.length === 0 && <p className="text-muted-foreground">Все още нямате покупки. <Link to="/gotovi-dokumenti" className="underline">Разгледайте готовите документи</Link>.</p>}
      {dlError && <p role="alert" className="text-destructive">{dlError}</p>}
      <ul className="space-y-3">
        {orders?.map((o) => (
          <li key={o.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium text-foreground">{o.product_key?.replace(/-/g, " ") ?? "Документ"} {o.version && <span className="text-muted-foreground">· версия {o.version}</span>}</p>
              <p className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString("bg-BG")} · {formatEur(o.amount_cents)} · {ORDER_STATE_LABEL[o.state]}</p>
            </div>
            {o.state === "paid" && (
              <Button variant="outline" className="min-h-11" onClick={() => { setDlError(""); downloadStaticOrder(o.id).catch(() => setDlError("Свалянето не е разрешено в момента. Опитайте отново.")); }}>
                Свалете {o.filename ? `(${o.filename.endsWith(".pdf") ? "PDF" : "DOCX"})` : ""}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
