import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { useAuth } from "@/hooks/useAuth";
import { formatEur, staticCall, staticEnvironment, type StaticCatalogItem, type StaticCatalogResponse } from "@/lib/staticCatalog";

type Consents = { terms: boolean; perf: boolean; loss: boolean };

function Item({ item, open }: { item: StaticCatalogItem; open: boolean }) {
  const [c, setC] = useState<Consents>({ terms: false, perf: false, loss: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const all = c.terms && c.perf && c.loss;
  const buy = async () => {
    setBusy(true); setErr("");
    try {
      const r = await staticCall<{ url: string }>({ action: "checkout", environment: staticEnvironment(), assetId: item.id, requestId: crypto.randomUUID(),
        termsAccepted: true, immediatePerformanceConsent: true, withdrawalLossAcknowledged: true });
      window.location.assign(r.url);
    } catch { setErr("Плащането не може да започне в момента. Опитайте отново по-късно."); setBusy(false); }
  };
  const box = (k: keyof Consents, text: React.ReactNode) => (
    <div className="flex items-start gap-2">
      <Checkbox id={`${item.id}-${k}`} checked={c[k]} onCheckedChange={(v) => setC({ ...c, [k]: v === true })} className="mt-0.5 h-5 w-5" />
      <Label htmlFor={`${item.id}-${k}`} className="text-sm font-normal leading-snug">{text}</Label>
    </div>
  );
  return (
    <article className="space-y-4 rounded-xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{item.product_key.replace(/-/g, " ")}</h2>
        <p className="text-lg font-semibold text-foreground">{formatEur(item.amount_cents)} <span className="text-sm font-normal text-muted-foreground">с ДДС</span></p>
      </header>
      <p className="text-sm text-muted-foreground">
        Сваляте точно файла <strong className="text-foreground">{item.filename}</strong>, версия {item.version}
        {" "}({item.mime_type === "application/pdf" ? "PDF" : "DOCX"}). Контролна сума: <code className="break-all">{item.sha256.slice(0, 16)}…</code>
      </p>
      <p className="text-sm text-muted-foreground">Документът е готова бланка. Не въвеждате лични данни при покупката.</p>
      {open ? (
        <div className="space-y-3">
          {box("terms", <>Приемам <Link to="/terms" className="underline">Общите условия</Link> и <Link to="/refund" className="underline">правилата за възстановяване</Link>.</>)}
          {box("perf", "Искам файлът да ми бъде предоставен веднага след плащането.")}
          {box("loss", "Разбирам, че след предоставяне на файла губя правото си на отказ от покупката.")}
          <Button onClick={buy} disabled={!all || busy} className="min-h-11">{busy ? "Пренасочваме…" : `Купете за ${formatEur(item.amount_cents)}`}</Button>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
      ) : <LaunchPurchaseBanner compact source="other" />}
    </article>
  );
}

export default function StaticCatalogStore() {
  const { user, loading } = useAuth();
  const env = staticEnvironment();
  const [data, setData] = useState<StaticCatalogResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "closed" | "error">("loading");

  useEffect(() => {
    document.title = "Готови документи за сваляне | Dogovori.net";
    if (loading) return;
    if (!user || !env) { setState("closed"); return; }
    staticCall<StaticCatalogResponse>({ action: "catalog", environment: env })
      .then((r) => { setData(r); setState("ready"); })
      .catch((e) => setState(e?.code === "sandbox_forbidden" ? "closed" : "error"));
  }, [user, loading, env]);

  return (
    <main className="container mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Готови документи</h1>
        <p className="text-muted-foreground">Проверени бланки, които сваляте веднага след плащане. Покупките Ви остават в <Link to="/pokupki" className="underline">Моите покупки</Link>.</p>
      </header>
      {state === "loading" && <p role="status" className="text-muted-foreground">Зареждаме…</p>}
      {state === "closed" && (
        <div className="space-y-4">
          {!user && !loading && <p className="text-muted-foreground"><Link to="/auth" className="underline">Влезте в профила си</Link>, за да видите наличните документи.</p>}
          <LaunchPurchaseBanner source="other" />
        </div>
      )}
      {state === "error" && <p role="alert" className="text-destructive">Каталогът не може да се зареди в момента. Опитайте отново по-късно.</p>}
      {state === "ready" && data && (data.items.length === 0
        ? <div className="space-y-4"><p className="text-muted-foreground">В момента няма документи, готови за продажба.</p><LaunchPurchaseBanner source="other" /></div>
        : <div className="space-y-5">{data.items.map((i) => <Item key={i.id} item={i} open={data.checkout_open} />)}</div>)}
    </main>
  );
}
