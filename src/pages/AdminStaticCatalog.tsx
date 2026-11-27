import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { staticCall, type StaticEnv } from "@/lib/staticCatalog";

interface AssetRow { id: string; environment: StaticEnv; product_key: string; template_slug: string | null; source_ref: string | null; version: string; sha256: string; reviewer: string | null; review_ref: string; ready: boolean; errors: string[]; }
interface Readiness { reviewer: "lawyer" | "owner_operator" | null; checkout: { sandbox: boolean; live: boolean }; assets: AssetRow[]; }
const FIELDS = { productKey: "Ключ на продукта", templateSlug: "Каноничен шаблон (slug)", sourceRef: "Източник / произход на текста", version: "Версия",
  stripePriceId: "Stripe цена", amountCents: "Цена в евроцентове", reviewRef: "Номер на прегледа", evidenceNote: "Бележка към прегледа" } as const;
type F = Record<keyof typeof FIELDS, string>;
const CAPACITY = { lawyer: "юрист", owner_operator: "собственик/оператор (не е независим юрист)" };

export default function AdminStaticCatalog() {
  const [r, setR] = useState<Readiness | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [msg, setMsg] = useState("");
  const [env, setEnv] = useState<StaticEnv>("sandbox");
  const [f, setF] = useState<F>({ productKey: "", templateSlug: "", sourceRef: "", version: "", stripePriceId: "", amountCents: "", reviewRef: "", evidenceNote: "" });
  const [file, setFile] = useState<File | null>(null);
  const [attest, setAttest] = useState(false);

  const load = async () => {
    try { setR(await staticCall<Readiness>({ action: "readiness" })); setLoadErr(""); }
    catch (e) { setLoadErr((e as { code?: string }).code === "staff_required" ? "Достъпът е само за служители." : "Данните не могат да се заредят (staging таблиците може да липсват в тази среда)."); }
  };
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    if (!file) return setMsg("Изберете файл.");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    try {
      const res = await staticCall<{ ok: boolean; sha256?: string; errors?: string[] }>({ action: "register_asset", environment: env, ...f,
        amountCents: Number(f.amountCents), filename: file.name, mimeType: file.type, contentBase64: btoa(bin), reviewerAttestation: attest }, "register");
      setMsg(res.ok ? `Записано и прието от Вас. SHA-256: ${res.sha256}` : `Отказано: ${res.errors?.join(", ")}`);
      if (res.ok) void load();
    } catch (e) { setMsg(`Отказано: ${(e as { code?: string }).code ?? "unavailable"}`); }
  };

  const decide = async (assetId: string, decision: "accepted" | "rejected") => {
    const ref = window.prompt("Номер на прегледа за това решение");
    if (!ref) return;
    try { await staticCall({ action: "review", assetId, decision, reviewRef: ref, reviewerAttestation: true }); void load(); }
    catch (e) { setMsg(`Решението не е записано: ${(e as { code?: string }).code}`); }
  };

  return (
    <main className="container mx-auto max-w-4xl space-y-10 px-4 py-10">
      <header className="space-y-1">
        <Link to="/admin" className="text-sm underline">← Админ</Link>
        <h1 className="text-2xl font-semibold text-foreground">Готови документи — файлове и прегледи</h1>
        {r && <p className="text-sm text-muted-foreground">Плащане: тестово {r.checkout.sandbox ? "отворено" : "затворено"} · реално {r.checkout.live ? "отворено" : "затворено"}.
          {" "}Вашата роля на рецензент: {r.reviewer ? CAPACITY[r.reviewer] : "няма — не можете да качвате или приемате файлове"}.</p>}
        {loadErr && <p role="alert" className="text-sm text-destructive">{loadErr}</p>}
      </header>

      <section className="space-y-4" aria-labelledby="reg">
        <h2 id="reg" className="text-lg font-medium">Качване и приемане на версия</h2>
        <p className="text-sm text-muted-foreground">Записът носи Вашата самоличност и роля от регистъра на рецензентите. Кандидат-версии без човешки преглед не стават продаваеми.</p>
        <div className="flex gap-2">{(["sandbox", "live"] as const).map((e) => <Button key={e} size="sm" variant={env === e ? "default" : "outline"} onClick={() => setEnv(e)}>{e === "sandbox" ? "Тестова среда" : "Реална среда"}</Button>)}</div>
        {(Object.keys(FIELDS) as (keyof F)[]).map((k) => (
          <div key={k} className="space-y-1"><Label htmlFor={k}>{FIELDS[k]}</Label><Input id={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>))}
        <Input type="file" accept=".pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Файл" />
        <div className="flex items-start gap-2"><Checkbox id="att" checked={attest} onCheckedChange={(v) => setAttest(v === true)} />
          <Label htmlFor="att">Лично прегледах точно този файл и го приемам в качеството си, посочено по-горе, с този номер на преглед.</Label></div>
        <Button onClick={submit} disabled={!r?.reviewer}>Запишете</Button>
        {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
      </section>

      <section aria-labelledby="ready"><h2 id="ready" className="mb-3 text-lg font-medium">Готовност</h2>
        {r && r.assets.length === 0 && <p className="text-sm text-muted-foreground">Няма качени файлове. Клиентите виждат „няма документи, готови за продажба“.</p>}
        <ul className="space-y-2">{r?.assets.map((a) => <li key={a.id} className="space-y-2 rounded border border-border p-3 text-sm">
          <div><strong>{a.product_key}</strong> v{a.version} [{a.environment}] — {a.ready ? "Продаваем" : `Не е продаваем: ${a.errors.join(", ")}`}</div>
          <div className="break-all text-muted-foreground">Шаблон: {a.template_slug ?? "—"} · Източник: {a.source_ref ?? "—"} · Преглед: {a.review_ref} · {a.reviewer ?? "без прието решение"} · {a.sha256}</div>
          {r.reviewer && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => decide(a.id, "accepted")}>Приемете</Button>
            <Button size="sm" variant="outline" onClick={() => decide(a.id, "rejected")}>Оттеглете приемането</Button></div>}
        </li>)}</ul>
      </section>
      <p className="text-sm"><Link to="/pokupki" className="underline">Моите покупки</Link> · <Link to="/gotovi-dokumenti" className="underline">Клиентски изглед</Link></p>
    </main>
  );
}
