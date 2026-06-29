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
import { Loader2, CheckCircle2, AlertCircle, XCircle, Download } from "lucide-react";
import { downloadSignedPdf } from "@/lib/signedPdfAssembler";

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
  async function doSign() {
    if (!signature) { toast.error("Моля, подпишете"); return; }
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
    setBusy(true);
    const { data } = await supabase.functions.invoke("signer-action", {
      body: {
        token, action: "sign",
        signature_data_url: signature, signer_name: name, otp_code: otpCode,
        ses_equivalence_accepted: sesAccepted,
        signs_as_legal_entity: signsAsEntity,
        eik: signsAsEntity ? eik.trim() : null,
        signer_capacity: signsAsEntity ? signerCapacity.trim() : null,
        representative_declaration_accepted: signsAsEntity ? repDeclaration : false,
      },
    });
    setBusy(false);
    if (data?.ok) { toast.success("Подписано успешно"); load(); }
    else toast.error(data?.error ?? "Грешка");
  }
  async function doDecline() {
    setBusy(true);
    const { data } = await supabase.functions.invoke("signer-action", {
      body: { token, action: "decline", reason },
    });
    setBusy(false);
    if (data?.ok) { toast.success("Отказано"); load(); }
    else toast.error(data?.error ?? "Грешка");
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
  const docText = typeof env.document_snapshot === "string"
    ? env.document_snapshot
    : (env.document_snapshot?.body || JSON.stringify(env.document_snapshot, null, 2));

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
                <div>
                  <label className="text-sm font-medium block mb-1">Подпис</label>
                  <SignaturePad onCapture={setSignature} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">
                    Код от имейла {debugCode ? <span className="text-xs text-amber-600">(dev: {debugCode})</span> : null}
                  </label>
                  <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} />
                </div>

                {/* ZEDEUU чл. 13, ал. 4 — equivalence-to-handwritten consent */}
                <label className="flex items-start gap-2 text-xs leading-relaxed cursor-pointer rounded-md border border-border/60 bg-card/40 p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={sesAccepted}
                    onChange={(e) => setSesAccepted(e.target.checked)}
                  />
                  <span>
                    Съгласявам се този електронен подпис (усъвършенстван електронен
                    подпис по смисъла на Регламент (ЕС) 910/2014 — eIDAS) да има
                    правната сила на саморъчен подпис между страните по този документ
                    (чл. 13, ал. 4 ЗЕДЕУУ).
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signsAsEntity}
                    onChange={(e) => setSignsAsEntity(e.target.checked)}
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
                    <label className="flex items-start gap-2 text-xs leading-relaxed cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={repDeclaration}
                        onChange={(e) => setRepDeclaration(e.target.checked)}
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
