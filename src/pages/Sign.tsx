// Signer-facing page reached via emailed link /sign/:token
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/Seo";
import { toast } from "sonner";
import { SignaturePad } from "@/components/SignaturePad";
import { Loader2, CheckCircle2, AlertCircle, XCircle, Download } from "@/icons";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadSignedPdf } from "@/lib/signedPdfAssembler";
import { snapshotToPlainText } from "@/lib/signingSnapshotToText";
import { trackSign } from "@/lib/docFunnel";

interface Peer { id: string; name: string; role: string | null; order_idx: number; status: string; signed_at: string | null }
interface Envelope { id: string; title: string; document_snapshot: any; status: string; order_mode: string; expires_at: string }
interface SignerInfo { id: string; name: string; email: string; role: string | null; status: string; order_idx: number; signed_at: string | null; declined_at: string | null }

export default function Sign() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [env, setEnv] = useState<Envelope | null>(null);
  const [signer, setSigner] = useState<SignerInfo | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [canSign, setCanSign] = useState(false);
  const [expired, setExpired] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [debugCode, setDebugCode] = useState<string | undefined>();
  const [signature, setSignature] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const [declineMode, setDeclineMode] = useState(false);
  const [reason, setReason] = useState("");

  // Signature method: drawn (canvas), uploaded (image), qes (qualified e-signature file)
  const [sigMethod, setSigMethod] = useState<"drawn" | "uploaded" | "qes">("drawn");
  const [qesFile, setQesFile] = useState<File | null>(null);
  const [qesFileBase64, setQesFileBase64] = useState<string | null>(null);

  // ZEDEUU / ZET — explicit SES-equivalence consent + optional legal-entity capacity.
  const [sesAccepted, setSesAccepted] = useState(false);
  const [signsAsEntity, setSignsAsEntity] = useState(false);
  const [eik, setEik] = useState("");
  const [signerCapacity, setSignerCapacity] = useState("");
  const [repDeclaration, setRepDeclaration] = useState(false);


  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("get-signing-request", { body: { token } });
    if (error || data?.error) {
      setErr(data?.error ?? error?.message ?? "Грешка"); setLoading(false); return;
    }
    setEnv(data.envelope); setSigner(data.signer); setPeers(data.peers); setCanSign(!!data.can_sign_now); setExpired(!!data.expired);
    setSignatures(data.signatures ?? []);
    setName(data.signer.name ?? "");
    setLoading(false);
  }
  useEffect(() => { load(); }, [token]);

  async function sendOtp() {
    setBusy(true);
    const { data } = await supabase.functions.invoke("signer-action", { body: { token, action: "send_otp" } });
    setBusy(false);
    if (data?.ok) { setOtpSent(true); setDebugCode(data.debug_code); toast.success("Код за потвърждение е изпратен на имейла"); }
    else toast.error(data?.error ?? "Грешка");
  }
  function makeQesPlaceholderPng(text: string): string {
    const c = document.createElement("canvas");
    c.width = 600; c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0a0a1a"; ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
    ctx.fillStyle = "#0a0a1a";
    ctx.font = "bold 22px serif";
    ctx.fillText("Подписано с КЕП (QES)", 20, 50);
    ctx.font = "16px serif";
    ctx.fillText(text.slice(0, 60), 20, 90);
    ctx.font = "14px serif";
    ctx.fillText(new Date().toLocaleString("bg-BG"), 20, 130);
    ctx.fillText("Файлът е приложен към заявката.", 20, 160);
    return c.toDataURL("image/png");
  }

  async function onQesFileChange(f: File | null) {
    setQesFile(f);
    setQesFileBase64(null);
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast.error("Файлът е твърде голям (макс 15MB)"); return; }
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    setQesFileBase64(btoa(bin));
  }

  async function doSign() {
    if (!name.trim()) { toast.error("Моля, въведете име"); return; }
    if (!otpCode.trim()) { toast.error("Въведете кода от имейла"); return; }
    if (!sesAccepted) { toast.error("Моля, потвърдете правната сила на електронния подпис"); return; }
    if (signsAsEntity) {
      if (!eik.trim() || !/^\d{9}(\d{4})?$/.test(eik.trim())) {
        toast.error("Въведете валиден ЕИК / БУЛСТАТ (9 или 13 цифри)"); return;
      }
      if (!signerCapacity.trim()) { toast.error("Посочете качеството, в което подписвате"); return; }
      if (!repDeclaration) { toast.error("Декларирайте представителната власт"); return; }
    }

    let sigDataUrl = signature;
    if (sigMethod === "qes") {
      if (!qesFile || !qesFileBase64) { toast.error("Прикачете подписания файл с КЕП"); return; }
      sigDataUrl = makeQesPlaceholderPng(`${name.trim()} — ${qesFile.name}`);
    } else {
      if (!sigDataUrl) { toast.error(sigMethod === "uploaded" ? "Качете изображение с подпис" : "Моля, подпишете"); return; }
    }

    setBusy(true);
    const { data } = await supabase.functions.invoke("signer-action", {
      body: {
        token, action: "sign",
        signature_data_url: sigDataUrl, signer_name: name, otp_code: otpCode,
        ses_equivalence_accepted: sesAccepted,
        signs_as_legal_entity: signsAsEntity,
        eik: signsAsEntity ? eik.trim() : null,
        signer_capacity: signsAsEntity ? signerCapacity.trim() : null,
        representative_declaration_accepted: signsAsEntity ? repDeclaration : false,
        signature_method: sigMethod,
        qes_file_base64: sigMethod === "qes" ? qesFileBase64 : null,
        qes_file_name: sigMethod === "qes" ? qesFile?.name : null,
        qes_file_mime: sigMethod === "qes" ? (qesFile?.type || "application/octet-stream") : null,
      },
    });
    setBusy(false);
    if (data?.ok) {
      trackSign("signed", { source: "sign_link", method: sigMethod });
      toast.success("Подписано успешно");
      load();
    } else {
      trackSign("fail", { source: "sign_link", method: sigMethod, reason: String(data?.error ?? "unknown").slice(0, 120) });
      toast.error(data?.error ?? "Грешка");
    }
  }

  async function doDecline() {
    setBusy(true);
    const { data } = await supabase.functions.invoke("signer-action", {
      body: { token, action: "decline", reason },
    });
    setBusy(false);
    if (data?.ok) {
      trackSign("declined", { source: "sign_link" });
      toast.success("Отказано");
      load();
    } else {
      toast.error(data?.error ?? "Грешка");
    }
  }

  if (loading) return <div className="min-h-dvh grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  if (err) return (
    <div className="min-h-dvh grid place-items-center p-6">
      <Seo title="Линк за подпис" description="Електронен подпис" noindex />
      <div className="max-w-md text-center space-y-3">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
        <h1 className="text-xl font-semibold">Линкът е невалиден или изтекъл</h1>
        <p className="text-muted-foreground text-sm">{err}</p>
      </div>
    </div>
  );
  if (!env || !signer) return null;

  const alreadySigned = signer.status === "signed";
  const alreadyDeclined = signer.status === "declined";
  const docText = snapshotToPlainText(env.document_snapshot);

  return (
    <div className="min-h-dvh bg-background">
      <Seo title={`Подпис: ${env.title}`} description="Електронен подпис на договор" noindex />
      <div className="container max-w-5xl py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-serif">{env.title}</h1>
          <p className="text-sm text-muted-foreground">
            Покана за подпис до <strong>{signer.name}</strong> ({signer.email})
            {signer.role ? ` — ${signer.role}` : ""}
          </p>
          <p className="text-xs italic text-muted-foreground/80">
            EN: Signing invitation for <strong>{signer.name}</strong>. By signing electronically you accept the document as legally binding.
          </p>
        </header>

        <section className="grid md:grid-cols-[1fr_320px] gap-6">
          <article className="prose prose-sm max-w-none border rounded-lg p-6 bg-card whitespace-pre-wrap font-serif text-foreground/90 max-h-[60vh] overflow-auto">
            {docText}
          </article>

          <aside className="space-y-4">
            <div className="border rounded-lg p-4 bg-card">
              <h2 className="font-semibold text-sm mb-3">Подписващи ({peers.length})</h2>
              <ol className="space-y-2 text-sm">
                {peers.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    {p.status === "signed" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : p.status === "declined" ? <XCircle className="h-4 w-4 text-destructive" />
                      : <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />}
                    <span className={p.id === signer.id ? "font-semibold" : ""}>{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.role ?? ""}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground mt-3">
                Режим: {env.order_mode === "sequential" ? "последователно" : "успоредно"}
              </p>
            </div>

            {alreadySigned && (
              <div className="border rounded-lg p-4 bg-emerald-50 text-emerald-800 text-sm space-y-3">
                <div>Подписали сте на {new Date(signer.signed_at!).toLocaleString("bg-BG")}.</div>
                {env.status === "completed" && signatures.length > 0 && (
                  <Button size="sm" onClick={() => downloadSignedPdf(
                    { title: env.title, document_snapshot: env.document_snapshot, completed_at: (env as any).completed_at, envelopeId: env.id, order_mode: env.order_mode },
                    signatures,
                  )}>
                    <Download className="h-4 w-4 mr-2" /> Изтегли подписания PDF
                  </Button>
                )}
                {env.status !== "completed" && (
                  <div className="text-xs">Изчакваме останалите страни. Ще получите имейл с финалния PDF.</div>
                )}
              </div>
            )}
            {alreadyDeclined && (
              <div className="border rounded-lg p-4 bg-destructive/10 text-destructive text-sm">
                Отказали сте подписването.
              </div>
            )}
            {expired && !alreadySigned && !alreadyDeclined && (
              <div className="border rounded-lg p-4 bg-amber-50 text-amber-900 text-sm">Изтекъл линк.</div>
            )}
          </aside>
        </section>

        {!alreadySigned && !alreadyDeclined && !expired && canSign && !declineMode && (
          <section className="border rounded-lg p-6 bg-card space-y-4">
            <h2 className="font-semibold">Електронен подпис</h2>

            {!otpSent ? (
              <Button onClick={sendOtp} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Изпрати код за потвърждение
              </Button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Имена</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium block">Метод на подпис</label>
                  <div className="grid grid-cols-3 gap-1 rounded-md border border-border/60 bg-muted/40 p-1 text-xs">
                    {([
                      { k: "drawn", l: "Начертай" },
                      { k: "uploaded", l: "Качи изображение" },
                      { k: "qes", l: "КЕП / QES файл" },
                    ] as const).map((o) => (
                      <button
                        key={o.k}
                        type="button"
                        onClick={() => { setSigMethod(o.k); setSignature(null); }}
                        className={`px-2 py-1.5 rounded ${sigMethod === o.k ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>

                  {sigMethod === "drawn" && <SignaturePad onCapture={setSignature} />}

                  {sigMethod === "uploaded" && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) { setSignature(null); return; }
                          if (f.size > 1_000_000) { toast.error("Изображението е твърде голямо (макс 1MB)"); return; }
                          const r = new FileReader();
                          r.onload = () => setSignature(String(r.result));
                          r.readAsDataURL(f);
                        }}
                        className="block w-full text-xs"
                      />
                      {signature && (
                        <img loading="lazy" decoding="async" src={signature} alt="Качен подпис" className="max-h-32 border rounded bg-white p-2" />
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Приемат се PNG / JPEG. Препоръчително — прозрачен фон, черно мастило.
                      </p>
                    </div>
                  )}

                  {sigMethod === "qes" && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept=".pdf,.p7s,.p7m,.asice,.asics,.sce,.scs,.xml"
                        onChange={(e) => onQesFileChange(e.target.files?.[0] ?? null)}
                        className="block w-full text-xs"
                      />
                      {qesFile && (
                        <div className="text-xs text-muted-foreground">
                          Прикачен: <span className="font-medium text-foreground">{qesFile.name}</span> ({Math.round(qesFile.size / 1024)} KB)
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Подпишете документа с Вашия КЕП (Borica, Evrotrust, InfoNotary, StampIT и др.)
                        във външно приложение и качете подписания файл (PDF с вграден подпис, .p7s,
                        .asice и т.н.). Файлът се пази като доказателство към заявката и се появява
                        в одитната следа.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">
                    Код от имейла {debugCode ? <span className="text-xs text-amber-600">(dev: {debugCode})</span> : null}
                  </label>
                  <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} />
                </div>

                {/* ZEDEUU чл. 13, ал. 4 — equivalence-to-handwritten consent */}
                <label className="flex items-start gap-3 text-xs leading-relaxed cursor-pointer rounded-md border border-border/60 bg-card/40 p-3">
                  <Checkbox
                    className="mt-0.5 shrink-0"
                    checked={sesAccepted}
                    onCheckedChange={(v) => setSesAccepted(v === true)}
                  />
                  <span>
                    Съгласявам се този електронен подпис (усъвършенстван електронен
                    подпис по смисъла на Регламент (ЕС) 910/2014 — eIDAS) да има
                    правната сила на саморъчен подпис между страните по този документ
                    (чл. 13, ал. 4 ЗЕДЕУУ).
                  </span>
                </label>

                <label className="flex items-center gap-3 text-xs cursor-pointer">
                  <Checkbox
                    className="shrink-0"
                    checked={signsAsEntity}
                    onCheckedChange={(v) => setSignsAsEntity(v === true)}
                  />
                  Подписвам от името на юридическо лице
                </label>

                {signsAsEntity && (
                  <div className="space-y-3 rounded-md border border-border/60 bg-card/40 p-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">ЕИК / БУЛСТАТ</label>
                      <Input value={eik} onChange={(e) => setEik(e.target.value)} placeholder="9 или 13 цифри" maxLength={13} />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Качество на подписващия</label>
                      <select
                        value={signerCapacity}
                        onChange={(e) => setSignerCapacity(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">— избери —</option>
                        <option value="manager">Управител</option>
                        <option value="board_member">Член на съвета</option>
                        <option value="attorney">Пълномощник</option>
                        <option value="employee">Служител с делегирани правомощия</option>
                        <option value="other">Друго</option>
                      </select>
                    </div>
                    <label className="flex items-start gap-3 text-xs leading-relaxed cursor-pointer">
                      <Checkbox
                        className="mt-0.5 shrink-0"
                        checked={repDeclaration}
                        onCheckedChange={(v) => setRepDeclaration(v === true)}
                      />
                      <span>
                        Декларирам, че имам представителна власт да обвържа юридическото
                        лице с този договор. Dogovori.net не проверява представителната
                        власт — отговорността е изцяло моя.
                      </span>
                    </label>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  За документи с високи правни залози (имоти, нотариална форма, кредити,
                  прехвърляне на дялове) препоръчваме квалифициран електронен подпис (QES).
                </p>

                <div className="flex gap-2">
                  <Button onClick={doSign} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Подпиши
                  </Button>
                  <Button variant="outline" onClick={() => setDeclineMode(true)}>Откажи</Button>
                </div>
              </div>
            )}
          </section>
        )}

        {!alreadySigned && !alreadyDeclined && !canSign && !expired && (
          <section className="border rounded-lg p-4 bg-amber-50 text-amber-900 text-sm">
            Изчаква се предишен подписващ да приключи (последователен режим).
          </section>
        )}

        {declineMode && (
          <section className="border rounded-lg p-6 bg-card space-y-4">
            <h2 className="font-semibold">Отказ от подписване</h2>
            <Textarea placeholder="Причина (по избор)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={doDecline} disabled={busy}>Потвърди отказа</Button>
              <Button variant="outline" onClick={() => setDeclineMode(false)}>Назад</Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
