// Owner-facing status page for one envelope: /signing/:id
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, Copy, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadSignedPdf } from "@/lib/signedPdfAssembler";

interface Signer {
  id: string; name: string; email: string; role: string | null; order_idx: number;
  status: string; signed_at: string | null; declined_at: string | null;
  viewed_at: string | null; sign_token: string;
}
interface Envelope {
  id: string; title: string; status: string; order_mode: string;
  expires_at: string; completed_at: string | null; created_at: string;
  document_snapshot: any;
}

export default function SigningEnvelope() {
  const { id = "" } = useParams();
  const [env, setEnv] = useState<Envelope | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: e }, { data: s }] = await Promise.all([
      supabase.from("signing_requests").select("*").eq("id", id).maybeSingle(),
      supabase.from("signing_request_signers")
        .select("id, name, email, role, order_idx, status, signed_at, declined_at, viewed_at, sign_token, request_id")
        .eq("request_id", id).order("order_idx"),
    ]);
    setEnv(e as any); setSigners((s as any) ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  function copyLink(token: string) {
    const url = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Линкът е копиран");
  }

  async function cancel() {
    if (!confirm("Откажи цялата заявка?")) return;
    await supabase.from("signing_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  if (loading) return <div className="min-h-dvh grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  if (!env) return <div className="container py-12">Не е намерено.</div>;

  return (
    <div className="min-h-dvh">
      <Seo title={`Подпис: ${env.title}`} description="Статус на електронно подписване" noindex />
      <Header />
      <main className="container max-w-4xl py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif">{env.title}</h1>
            <p className="text-sm text-muted-foreground">
              Създадено: {new Date(env.created_at).toLocaleString("bg-BG")} ·
              Изтича: {new Date(env.expires_at).toLocaleDateString("bg-BG")} ·
              Режим: {env.order_mode === "sequential" ? "последователно" : "успоредно"}
            </p>
          </div>
          <span className="text-sm rounded-full px-3 py-1 border bg-card capitalize">{env.status}</span>
        </div>

        <section className="border rounded-lg divide-y">
          {signers.map((s) => (
            <div key={s.id} className="p-4 flex items-center gap-4">
              <div className="w-8 text-center text-muted-foreground">{s.order_idx + 1}</div>
              <div className="flex-1">
                <div className="font-medium">{s.name} <span className="text-muted-foreground font-normal">— {s.email}</span></div>
                <div className="text-xs text-muted-foreground">
                  {s.role ?? "Подписващ"} ·
                  {s.status === "signed" ? ` Подписано: ${new Date(s.signed_at!).toLocaleString("bg-BG")}` :
                   s.status === "declined" ? ` Отказано: ${new Date(s.declined_at!).toLocaleString("bg-BG")}` :
                   s.viewed_at ? ` Видяно: ${new Date(s.viewed_at).toLocaleString("bg-BG")}` : " Не е отворено"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.status === "signed" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  : s.status === "declined" ? <XCircle className="h-5 w-5 text-destructive" />
                  : <Clock className="h-5 w-5 text-muted-foreground" />}
                {s.status !== "signed" && s.status !== "declined" && (
                  <Button size="sm" variant="outline" onClick={() => copyLink(s.sign_token)}>
                    <Copy className="h-3 w-3 mr-1" /> Линк
                  </Button>
                )}
              </div>
            </div>
          ))}
        </section>

        {env.status === "completed" && (
          <div className="border rounded-lg p-4 bg-emerald-50 text-emerald-900 flex items-center justify-between gap-4">
            <div className="text-sm">
              Всички страни са подписали{env.completed_at ? ` на ${new Date(env.completed_at).toLocaleString("bg-BG")}` : ""}.
            </div>
            <Button onClick={() => downloadSignedPdf(
              { title: env.title, document_snapshot: env.document_snapshot, completed_at: env.completed_at, envelopeId: env.id, order_mode: env.order_mode },
              signers as any,
            )}>
              <Download className="h-4 w-4 mr-2" /> Изтегли подписания PDF
            </Button>
          </div>
        )}

        {env.status !== "completed" && env.status !== "cancelled" && (
          <div>
            <Button variant="destructive" size="sm" onClick={cancel}>Откажи заявката</Button>
          </div>
        )}

        <Link to="/account" className="text-sm text-gold hover:underline">← Към профила</Link>
      </main>
    </div>
  );
}
