import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { Loader2, ShieldCheck, CheckCircle2, AlertTriangle, PenTool, Lock } from "@/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { sha256Hex, makeAttachedSignatureCardPng } from "@/lib/attachedSignatureCard";

type SharedDoc = {
  title: string;
  kind: "contract" | "template" | "uploaded";
  payload?: any;
  source?: "pdf" | "docx" | "paste";
  mime_type?: string | null;
  original_url?: string | null;
  signed_pdf_url?: string | null;
  extracted_text?: string | null;
  signed_at: string | null;
  signer_name: string | null;
  expires_at: string;
};

function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0a0a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [canvas]);

  const point = (e: React.PointerEvent) => {
    const r = canvas!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas!.width, y: ((e.clientY - r.top) / r.height) * canvas!.height };
  };

  const start = (e: React.PointerEvent) => {
    if (!canvas) return;
    setDrawing(true);
    setHasInk(true);
    const ctx = canvas.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing || !canvas) return;
    setDrawing(false);
    onCapture(canvas.toDataURL("image/png"));
  };
  const clear = () => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onCapture("");
  };

  return (
    <div>
      <canvas
        ref={setCanvas}
        width={600}
        height={180}
        className="w-full touch-none rounded-md border border-border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{hasInk ? "Подписано" : "Подпишете в полето с пръст или мишка"}</span>
        <button type="button" onClick={clear} className="text-gold underline-offset-4 hover:underline">
          Изчисти
        </button>
      </div>
    </div>
  );
}

function ContractView({ payload }: { payload: any }) {
  const c = payload as { title: string; preamble?: string; clauses?: { number: string; title: string; body: string }[]; closing?: string };
  return (
    <article className="prose prose-invert max-w-none rounded-xl border border-border/60 bg-card/40 p-6 sm:p-8">
      <h1 className="text-center font-serif text-2xl">{c.title}</h1>
      {c.preamble && <p className="whitespace-pre-line text-sm">{c.preamble}</p>}
      {c.clauses?.map((cl) => (
        <section key={cl.number} className="mt-4">
          <h2 className="font-serif text-base">{cl.number} {cl.title}</h2>
          <p className="whitespace-pre-line text-sm">{cl.body}</p>
        </section>
      ))}
      {c.closing && <p className="mt-6 whitespace-pre-line text-sm italic">{c.closing}</p>}
    </article>
  );
}

export default function SharedDocument() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [sigMethod, setSigMethod] = useState<"drawn" | "uploaded" | "qes">("drawn");
  const [qesFile, setQesFile] = useState<File | null>(null);
  const [qesFileBase64, setQesFileBase64] = useState<string | null>(null);
  const [qesSha256, setQesSha256] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  const fetchDoc = async (pwd?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("get-shared-document", {
        body: pwd ? { token, password: pwd } : { token },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let body: any = null;
        try { if (ctx?.json) body = await ctx.json(); } catch {}
        const code = body?.error ?? "load_failed";
        if (code === "password_required") {
          setNeedsPassword(true);
          setError(null);
          setDoc(null);
        } else if (code === "password_invalid") {
          setNeedsPassword(true);
          setError(null);
          toast.error("Грешна парола");
        } else {
          setError(code);
        }
      } else if (data?.error) {
        if (data.error === "password_required") {
          setNeedsPassword(true);
          setError(null);
        } else {
          setError(data.error);
        }
      } else {
        setDoc(data as SharedDoc);
        setNeedsPassword(false);
      }
    } catch {
      setError("network_error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchDoc();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitPassword = async () => {
    if (password.length < 4) { toast.error("Въведете паролата"); return; }
    setVerifying(true);
    await fetchDoc(password);
    setVerifying(false);
  };

  const onQesFileChange = async (f: File | null) => {
    setQesFile(f);
    setQesFileBase64(null);
    setQesSha256(null);
    setSignatureDataUrl("");
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast.error("Файлът е твърде голям (макс 15MB)"); return; }
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    setQesFileBase64(btoa(bin));
    let hash: string | null = null;
    try { hash = await sha256Hex(f); } catch { hash = null; }
    setQesSha256(hash);
    setSignatureDataUrl(
      makeAttachedSignatureCardPng({ signerName: signerName.trim() || "—", fileName: f.name, sha256: hash }),
    );
  };


  const handleSign = async () => {
    if (!signerName.trim()) {
      toast.error("Въведете името си");
      return;
    }
    if (sigMethod === "qes" && (!qesFile || !qesFileBase64)) {
      toast.error("Прикачете файла с подписа");
      return;
    }
    if (!signatureDataUrl) {
      toast.error(sigMethod === "uploaded" ? "Качете изображение с подпис" : "Подпишете в полето");
      return;
    }
    setSigning(true);
    // За КЕП картата се преизгражда с актуалното име, за да не остане стар надпис.
    const finalSignatureDataUrl = sigMethod === "qes" && qesFile
      ? makeAttachedSignatureCardPng({
          signerName: signerName.trim(),
          fileName: qesFile.name,
          sha256: qesSha256,
        })
      : signatureDataUrl;
    try {
      const { data, error } = await supabase.functions.invoke("sign-shared-document", {
        body: {
          token,
          signer_name: signerName.trim(),
          signature_data_url: finalSignatureDataUrl,
          signature_method: sigMethod,
          qes_file_base64: sigMethod === "qes" ? qesFileBase64 : null,
          qes_file_name: sigMethod === "qes" ? qesFile?.name : null,
          qes_file_mime: sigMethod === "qes" ? (qesFile?.type || "application/octet-stream") : null,
          ...(password ? { password } : {}),
        },
      });
      if (error || data?.error) {
        toast.error("Неуспешен подпис. Моля, опитайте отново.");
      } else {
        toast.success("Документът е подписан");
        setDoc((d) => d ? { ...d, signed_at: data.signed_at, signer_name: signerName.trim(), signed_pdf_url: data.signed_pdf_url ?? d.signed_pdf_url } : d);
      }
    } finally {
      setSigning(false);
    }
  };


  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }
  if (error) {
    const map: Record<string, string> = {
      not_found: "Линкът не съществува.",
      expired: "Линкът е изтекъл.",
      revoked: "Линкът е оттеглен от собственика.",
      document_missing: "Документът вече не е наличен.",
      invalid_token: "Невалиден линк.",
    };
    return (
      <div className="container max-w-xl py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-3 font-serif text-2xl">Не можем да отворим документа</h1>
        <p className="mt-2 text-sm text-muted-foreground">{map[error] ?? "Възникна грешка."}</p>
      </div>
    );
  }
  if (needsPassword && !doc) {
    return (
      <div className="min-h-dvh bg-background">
        <Seo title="Защитен документ — Dogovori.net" description="Този споделен документ е защитен с парола." canonical="/share" noindex />
        <div className="container max-w-md py-16">
          <div className="rounded-2xl border border-gold/30 bg-card/40 p-6 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/15">
              <Lock className="h-6 w-6 text-gold" />
            </div>
            <h1 className="mt-3 font-serif text-xl">Защитен документ</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Собственикът е защитил този линк с парола. Моля, въведете я по-долу.
            </p>
            <div className="mt-4 space-y-2 text-left">
              <Label htmlFor="share-password">Парола</Label>
              <Input
                id="share-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }}
                placeholder="••••••••"
              />
              <Button
                onClick={submitPassword}
                disabled={verifying || password.length < 4}
                className="w-full bg-gradient-gold text-navy"
              >
                {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Отвори документа
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!doc) return null;


  return (
    <div className="min-h-dvh bg-background">
      <Seo title="Споделен документ — Dogovori.net" description="Защитен преглед на споделен документ от Dogovori.net — отворете го по получената връзка, прегледайте съдържанието и при нужда го подпишете електронно." canonical="/share" noindex />
      <header className="sticky top-0 z-30 border-b border-border/60 bg-navy/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Logo />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Изтича: {new Date(doc.expires_at).toLocaleString("bg-BG")}
          </span>
        </div>
      </header>

      <main className="container max-w-3xl space-y-6 py-8">
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-4 w-4 text-gold" />
          Споделено за преглед и подпис от собственика. Действията са защитени и логнати.
          <span className="mt-1 block italic opacity-80">
            EN: Shared for review and e-signature by the owner. All actions are secured and audit-logged.
          </span>
        </div>

        {doc.kind === "uploaded" ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
              {doc.extracted_text ? (
                <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-6 font-sans text-sm leading-relaxed text-foreground/90">
                  {doc.extracted_text}
                </pre>
              ) : doc.original_url ? (
                <iframe
                  src={doc.original_url}
                  title={doc.title}
                  className="h-[75vh] w-full bg-white"
                />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">Съдържанието на документа не е налично.</div>
              )}
            </div>
            {doc.original_url && (
              <a
                href={doc.original_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 text-xs text-gold underline-offset-4 hover:underline"
              >
                Отвори оригиналния файл
              </a>
            )}
          </div>
        ) : (
          <ContractView payload={doc.payload} />
        )}

        {!doc.signed_at && signatureDataUrl && (
          <div className="rounded-xl border-2 border-dashed border-gold/60 bg-gold/5 p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">
              Преглед на подписа върху документа
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <div className="font-serif text-base">{signerName || "Име на подписващия"}</div>
                <div className="text-xs text-muted-foreground">
                  Дата: {new Date().toLocaleString("bg-BG")}
                  {sigMethod === "qes" && qesFile ? ` · приложен файл: ${qesFile.name}` : ""}
                </div>
              </div>
              <img
                src={signatureDataUrl}
                alt="Преглед на подпис"
                className="max-h-24 rounded-md border border-border/60 bg-white p-2"
              />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Това е визуализация на подписа върху финалния PDF. Натиснете „Подпиши документа“ за да финализирате.
            </p>
          </div>
        )}

        {doc.signed_at ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="mt-2 font-serif text-base">
              Подписано от {doc.signer_name} на {new Date(doc.signed_at).toLocaleString("bg-BG")}
            </p>
            {doc.signed_pdf_url && (
              <a
                href={doc.signed_pdf_url}
                target="_blank"
                rel="noopener"
                className="mt-3 inline-flex items-center gap-2 text-sm text-gold underline-offset-4 hover:underline"
              >
                Изтегли подписания PDF
              </a>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card/40 p-6">
            <h2 className="flex items-center gap-2 font-serif text-lg">
              <PenTool className="h-5 w-5 text-gold" /> Подпиши електронно
            </h2>
            <div className="mt-4 grid gap-3">
              <div>
                <Label htmlFor="signer">Вашите три имена</Label>
                <Input id="signer" value={signerName} maxLength={120}
                  onChange={(e) => setSignerName(e.target.value)} placeholder="Иван Иванов Иванов" />
              </div>
              <div className="space-y-2">
                <Label>Метод на подпис</Label>
                <div className="grid grid-cols-3 gap-1 rounded-md border border-border/60 bg-muted/40 p-1 text-xs">
                  {([
                    { k: "drawn", l: "Начертай" },
                    { k: "uploaded", l: "Качи изображение" },
                    { k: "qes", l: "Прикачи файл с подпис" },
                  ] as const).map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => {
                        setSigMethod(o.k);
                        setSignatureDataUrl("");
                        setQesFile(null);
                        setQesFileBase64(null);
                      }}
                      className={`px-2 py-1.5 rounded ${sigMethod === o.k ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>

                {sigMethod === "drawn" && <SignaturePad onCapture={setSignatureDataUrl} />}

                {sigMethod === "uploaded" && (
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) { setSignatureDataUrl(""); return; }
                        if (f.size > 1_000_000) { toast.error("Изображението е твърде голямо (макс 1MB)"); return; }
                        const r = new FileReader();
                        r.onload = () => setSignatureDataUrl(String(r.result));
                        r.readAsDataURL(f);
                      }}
                      className="block w-full text-xs"
                    />
                    {signatureDataUrl && (
                      <img loading="lazy" decoding="async" src={signatureDataUrl} alt="Качен подпис" className="max-h-32 border rounded bg-white p-2" />
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
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>
                          Прикачен: <span className="font-medium text-foreground">{qesFile.name}</span> ({Math.round(qesFile.size / 1024)} KB)
                        </div>
                        {qesSha256 && (
                          <div className="font-mono text-[10px] break-all">SHA-256: {qesSha256}</div>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Ако сте подписали документа с квалифициран електронен подпис във външно
                      приложение, качете подписания файл. <strong className="text-foreground">Платформата
                      не проверява сертификата и обвързаността му с документа</strong> — файлът се пази
                      като приложено доказателство заедно със SHA-256 отпечатъка си.
                    </p>

                  </div>
                )}
              </div>
              <Button onClick={handleSign} disabled={signing} className="bg-gradient-gold text-navy">
                {signing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenTool className="mr-2 h-4 w-4" />}
                Подпиши документа
              </Button>
              <p className="text-[11px] text-muted-foreground">
                С натискане потвърждавате, че сте оторизиран да подпишете и приемате условията.
                Това е обикновен електронен подпис по ЗЕДЕУУ — платформата не издава и не проверява квалифициран електронен подпис (КЕП).
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
