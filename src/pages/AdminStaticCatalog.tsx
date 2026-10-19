import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface AssetRow { id: string; product_key: string; version: string; sha256: string; reviewer_ref: string; legal_acceptance_ref: string; ready: boolean; errors: string[]; }
interface OrderRow { id: string; amount_cents: number; created_at: string; state: "pending" | "paid" | "refunded" | "failed"; }

const STATE: Record<OrderRow["state"], string> = { pending: "Очаква потвърждение", paid: "Платено", refunded: "Възстановено — достъпът е спрян", failed: "Неуспешно" };

async function call(body: Record<string, unknown>, op?: string) {
  const { data, error } = await supabase.functions.invoke(`static-catalog${op ? `?op=${op}` : ""}`, { body });
  if (error) throw new Error(error.message);
  return data;
}

export default function AdminStaticCatalog() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ productKey: "", version: "", stripePriceId: "", amountCents: "", legalAcceptanceRef: "" });
  const [file, setFile] = useState<File | null>(null);
  const [attest, setAttest] = useState(false);

  const load = async () => {
    try { setAssets((await call({ action: "readiness" })).assets ?? []); setOrders((await call({ action: "orders" })).orders ?? []); }
    catch { setMsg("Данните не могат да се заредят. Достъпът е само за служители."); }
  };
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    if (!file) return setMsg("Изберете файл.");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ""; buf.forEach((b) => { bin += String.fromCharCode(b); });
    try {
      const r = await call({ action: "register_asset", ...f, amountCents: Number(f.amountCents), filename: file.name,
        mimeType: file.type, contentBase64: btoa(bin), reviewerAttestation: attest }, "register");
      setMsg(r.ok ? `Записано. SHA-256: ${r.sha256}` : `Отказано: ${r.errors.join(", ")}`);
      if (r.ok) void load();
    } catch { setMsg("Записът не беше приет от сървъра."); }
  };

  const download = async (id: string) => {
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/static-catalog`, { method: "POST",
      headers: { Authorization: `Bearer ${s.session?.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "download", orderId: id }) });
    if (!res.ok) return setMsg("Свалянето е отказано.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "document";
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <main className="container mx-auto max-w-4xl space-y-10 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Готови документи — тестова среда</h1>
      <section className="space-y-4" aria-labelledby="reg">
        <h2 id="reg" className="text-lg font-medium">Качване на файл</h2>
        {(["productKey", "version", "stripePriceId", "amountCents", "legalAcceptanceRef"] as const).map((k) => (
          <div key={k} className="space-y-1"><Label htmlFor={k}>{{ productKey: "Ключ на документа", version: "Версия", stripePriceId: "Stripe цена (тестова)", amountCents: "Цена в евроцентове", legalAcceptanceRef: "Номер на правното приемане" }[k]}</Label>
            <Input id={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>))}
        <Input type="file" accept=".pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Файл" />
        <div className="flex items-start gap-2"><Checkbox id="att" checked={attest} onCheckedChange={(v) => setAttest(v === true)} />
          <Label htmlFor="att">Потвърждавам, че лично съм прегледал(а) точно този файл и той е приет с посочения номер.</Label></div>
        <Button onClick={submit}>Запишете</Button>
        {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
      </section>
      <section aria-labelledby="ready"><h2 id="ready" className="mb-3 text-lg font-medium">Готовност</h2>
        <ul className="space-y-2">{assets.map((a) => <li key={a.id} className="rounded border border-border p-3 text-sm">
          <strong>{a.product_key}</strong> v{a.version} — {a.ready ? "Готов" : `Не е готов: ${a.errors.join(", ")}`}
          <div className="text-muted-foreground">Приемане: {a.legal_acceptance_ref} · {a.reviewer_ref} · {a.sha256.slice(0, 12)}…</div></li>)}</ul></section>
      <section aria-labelledby="ord"><h2 id="ord" className="mb-3 text-lg font-medium">Моите покупки</h2>
        <ul className="space-y-2">{orders.map((o) => <li key={o.id} className="flex items-center justify-between rounded border border-border p-3 text-sm">
          <span>{new Date(o.created_at).toLocaleDateString("bg-BG")} · {(o.amount_cents / 100).toFixed(2).replace(".", ",")} € · {STATE[o.state]}</span>
          {o.state === "paid" && <Button size="sm" variant="outline" onClick={() => download(o.id)}>Свалете отново</Button>}</li>)}</ul></section>
    </main>
  );
}
