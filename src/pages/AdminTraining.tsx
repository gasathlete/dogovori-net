import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";
import { ArrowLeft, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";

interface Training {
  id: string;
  user_id: string;
  document_key: string;
  document_version: string;
  acknowledged_at: string;
}

const REQUIRED_DOCS = [
  { key: "security_policy", version: "2026-06-25", label: "Security Policy" },
  { key: "breach_playbook", version: "2026-06-25", label: "Breach Playbook" },
  { key: "access_policy", version: "2026-06-25", label: "Access Policy" },
  { key: "ai_act_technical_file", version: "2026-06-25", label: "AI Act Technical File" },
];

export default function AdminTraining() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [mine, setMine] = useState<Training[]>([]);
  const [all, setAll] = useState<Training[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    if (!user) return;
    setBusy(true);
    const [r1, r2] = await Promise.all([
      supabase.from("staff_training").select("*").eq("user_id", user.id),
      supabase.from("staff_training").select("*").order("acknowledged_at", { ascending: false }).limit(200),
    ]);
    setBusy(false);
    if (r1.data) setMine(r1.data as Training[]);
    if (r2.data) setAll(r2.data as Training[]);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const acknowledge = async (key: string, version: string) => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("staff_training").insert({
      user_id: user.id,
      document_key: key,
      document_version: version,
    });
    setBusy(false);
    if (error && !error.message.includes("duplicate")) { toast.error(error.message); return; }
    toast.success("Записано");
    load();
  };

  if (loading || allowed === null) return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <div className="p-8">Forbidden</div>;

  const hasAck = (key: string, version: string) => mine.some((m) => m.document_key === key && m.document_version === version);

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh bg-background">
        <Header />
        <div className="container py-8">
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" /> Admin</Link></Button>
            <h1 className="text-3xl font-bold flex items-center gap-2"><BookOpen className="h-7 w-7 text-gold" /> Staff Training Register</h1>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <h2 className="mb-3 text-lg font-semibold">My acknowledgements</h2>
              <div className="space-y-2">
                {REQUIRED_DOCS.map((d) => {
                  const acked = hasAck(d.key, d.version);
                  return (
                    <div key={d.key} className="flex items-center justify-between rounded border border-border/50 p-3">
                      <div>
                        <div className="font-medium">{d.label}</div>
                        <div className="text-xs text-muted-foreground">v{d.version}</div>
                      </div>
                      {acked ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600">✓ Acknowledged</Badge>
                      ) : (
                        <Button size="sm" onClick={() => acknowledge(d.key, d.version)} disabled={busy}>Прочетох и приемам</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <h2 className="px-4 pt-4 text-lg font-semibold">Всички acknowledgements</h2>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Document</th>
                    <th className="px-3 py-2 text-left">Version</th>
                    <th className="px-3 py-2 text-left">When</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((r) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono text-xs">{r.user_id.slice(0, 8)}…</td>
                      <td className="px-3 py-2">{r.document_key}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.document_version}</td>
                      <td className="px-3 py-2 text-xs">{new Date(r.acknowledged_at).toLocaleString("bg-BG")}</td>
                    </tr>
                  ))}
                  {all.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground text-sm">Все още няма записи.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminMFAGuard>
  );
}
