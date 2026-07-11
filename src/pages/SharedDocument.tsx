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

  const makeQesPlaceholderPng = (text: string): string => {
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
  };

  const onQesFileChange = async (f: File | null) => {
    setQesFile(f);
    setQesFileBase64(null);
    setSignatureDataUrl("");
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast.error("Файлът е твърде голям (макс 15MB)"); return; }
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    setQesFileBase64(btoa(bin));
    setSignatureDataUrl(makeQesPlaceholderPng(`${f.name}`));
  };

  const handleSign = async () => {
    if (!signerName.trim()) {
      toast.error("Въведете името си");
      return;
    }
    if (sigMethod === "qes" && (!qesFile || !qesFileBase64)) {
      toast.error("Прикачете подписания файл с КЕП");
      return;
    }
    if (!signatureDataUrl) {
      toast.error(sigMethod === "uploaded" ? "Качете изображение с подпис" : "Подпишете в полето");
      return;
    }
    setSigning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sign-shared-document", {
        body: {
          token,
          signer_name: signerName.trim(),
          signature_data_url: signatureDataUrl,
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
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
            {doc.source === "paste" ? (
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
              <div className="p-6 text-sm text-muted-foreground">Оригиналният файл не е наличен.</div>
            )}
          </div>
        ) : (
          <ContractView payload={doc.payload} />
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
              <SignaturePad onCapture={setSignatureDataUrl} />
              <Button onClick={handleSign} disabled={signing} className="bg-gradient-gold text-navy">
                {signing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenTool className="mr-2 h-4 w-4" />}
                Подпиши документа
              </Button>
              <p className="text-[11px] text-muted-foreground">
                С натискане потвърждавате, че сте оторизиран да подпишете и приемате условията.
                Електронният подпис няма стойност на квалифициран електронен подпис (КЕП).
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
