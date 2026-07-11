import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Users, Mail, Phone, MapPin, Loader2, ShieldCheck, ShieldAlert, AlertTriangle } from "@/icons";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Contact = {
  id: string; name: string; type: "individual" | "legal";
  egn?: string | null; eik?: string | null; vat_number?: string | null;
  address?: string | null; mol?: string | null; email?: string | null; phone?: string | null; notes?: string | null;
};
type SavedDoc = { id: string; title: string; kind: "contract" | "template"; created_at: string };
type UploadedContract = { id: string; title: string; source: string; created_at: string };
type RiskAnalysis = { uploaded_contract_id: string; score: number; contract_type: string };

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<Contact | null>(null);
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [uploaded, setUploaded] = useState<UploadedContract[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, RiskAnalysis>>({});

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [c, d, u] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
        supabase.from("saved_documents").select("id,title,kind,created_at").eq("contact_id", id).order("created_at", { ascending: false }),
        supabase.from("uploaded_contracts").select("id,title,source,created_at").eq("contact_id", id).order("created_at", { ascending: false }),
      ]);
      if (c.error) toast.error(c.error.message);
      setContact((c.data as any) ?? null);
      setDocs((d.data as any) ?? []);
      const ups = (u.data as any) ?? [];
      setUploaded(ups);
      if (ups.length) {
        const { data: ra } = await supabase
          .from("risk_analyses")
          .select("uploaded_contract_id,score,contract_type")
          .in("uploaded_contract_id", ups.map((x: any) => x.id));
        const map: Record<string, RiskAnalysis> = {};
        for (const r of ((ra as any) ?? []) as RiskAnalysis[]) {
          if (!map[r.uploaded_contract_id]) map[r.uploaded_contract_id] = r;
        }
        setAnalyses(map);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-dvh">
        <Header />
        <main className="container flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </main>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="min-h-dvh">
        <Header />
        <main className="container py-10">
          <p className="text-sm text-muted-foreground">Контрагентът не е намерен.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/account?tab=contacts")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Към контрагенти
          </Button>
        </main>
      </div>
    );
  }

  const total = docs.length + uploaded.length;

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="container py-6 md:py-10">
        <Link to="/account?tab=contacts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="h-3 w-3" /> Към контрагенти
        </Link>

        <div className="mt-3 rounded-xl border border-border/60 bg-gradient-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {contact.type === "individual" ? "Физическо лице" : "Юридическо лице"}
              </div>
              <h1 className="mt-1 break-words font-serif text-2xl font-bold sm:text-3xl">{contact.name}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                {contact.egn && <span>ЕГН: <span className="text-foreground">{contact.egn}</span></span>}
                {contact.eik && <span>ЕИК: <span className="text-foreground">{contact.eik}</span></span>}
                {contact.vat_number && <span>ДДС №: <span className="text-foreground">{contact.vat_number}</span></span>}
                {contact.mol && <span>МОЛ: <span className="text-foreground">{contact.mol}</span></span>}
                {contact.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{contact.email}</span>}
                {contact.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}
                {contact.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{contact.address}</span>}
              </div>
              {contact.notes && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{contact.notes}</p>
              )}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-xs uppercase tracking-wider text-gold">
              <FileText className="h-3.5 w-3.5" /> {total} документа
            </span>
          </div>
        </div>

        {/* Uploaded contracts */}
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold">Качени договори</h2>
          {uploaded.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-gradient-card p-6 text-center text-sm text-muted-foreground">
              Няма качени договори, закачени към този контрагент.
            </div>
          ) : (
            <div className="grid gap-3">
              {uploaded.map((u) => {
                const a = analyses[u.id];
                const score = a?.score;
                const sevCls = score == null ? "border-border/40 text-muted-foreground"
                  : score >= 8 ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
                  : score >= 5 ? "border-amber-300/40 text-amber-200 bg-amber-300/10"
                  : "border-red-400/40 text-red-300 bg-red-400/10";
                const Icon = score == null ? AlertTriangle : score >= 8 ? ShieldCheck : score >= 5 ? AlertTriangle : ShieldAlert;
                return (
                  <Link
                    key={u.id}
                    to={`/uploaded/${u.id}`}
                    className="block rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="break-words font-serif text-base font-bold">{u.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {u.source.toUpperCase()} · качен {new Date(u.created_at).toLocaleDateString("bg-BG")}
                          {a?.contract_type && <> · {a.contract_type}</>}
                        </div>
                      </div>
                      <div className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs ${sevCls}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {score != null ? <><strong>{score}</strong>/10</> : "Без анализ"}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Saved documents */}
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold">Създадени документи</h2>
          {docs.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-gradient-card p-6 text-center text-sm text-muted-foreground">
              Няма създадени документи за този контрагент.
            </div>
          ) : (
            <div className="grid gap-3">
              {docs.map((d) => (
                <Link
                  key={d.id}
                  to={`/document/${d.id}`}
                  className="block rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                >
                  <div className="break-words font-serif text-base font-bold">{d.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {d.kind === "contract" ? "Договор" : "Бланка"} · {new Date(d.created_at).toLocaleDateString("bg-BG")}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
