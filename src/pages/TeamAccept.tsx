import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

type Info = {
  ok: boolean;
  reason?: string;
  teamName?: string | null;
  email?: string;
  inviterName?: string | null;
  expiresAt?: string;
  expired?: boolean;
};

export default function TeamAccept() {
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const token = params.get("token") ?? "";

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("team-invitation-info", { body: { token } });
        if (error) throw new Error(error.message);
        setInfo(data as Info);
      } catch (e: any) {
        toast.error(e.message);
        setInfo({ ok: false, reason: "error" });
      } finally { setLoading(false); }
    })();
  }, [token, navigate]);

  async function accept() {
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/team/accept?token=${token}`)}`);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-accept-invite", { body: { token } });
      if (error || !data?.ok) throw new Error(error?.message || "Не можахме да приемем поканата");
      toast.success("Добре дошли в екипа!");
      navigate("/team");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  function decline() { navigate("/"); }

  return (
    <>
      <Header />
      <main className="container mx-auto flex min-h-[60vh] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-2xl border border-gold/30 bg-gradient-card p-8 text-center">
          {loading || authLoading ? (
            <div className="space-y-3">
              <Skeleton className="mx-auto h-12 w-12 rounded-full" />
              <Skeleton className="mx-auto h-6 w-2/3" />
              <Skeleton className="mx-auto h-4 w-3/4" />
            </div>
          ) : !info?.ok ? (
            <>
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="mt-4 font-serif text-2xl font-bold">
                {info?.reason === "already_accepted" ? "Поканата вече е приета"
                  : info?.reason === "not_found" ? "Невалидна покана"
                  : "Грешка"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Свържете се с администратора на екипа за нова покана.
              </p>
              <Button className="mt-6" variant="outline" onClick={() => navigate("/")}>Към началото</Button>
            </>
          ) : info.expired ? (
            <>
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="mt-4 font-serif text-2xl font-bold">Поканата е изтекла</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Поискайте нова покана от администратора на екипа.
              </p>
              <Button className="mt-6" variant="outline" onClick={() => navigate("/")}>Към началото</Button>
            </>
          ) : (
            <>
              <Users className="mx-auto h-12 w-12 text-gold" />
              <h1 className="mt-4 font-serif text-2xl font-bold">Покана за екип</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                <strong className="text-foreground">{info.inviterName || "Администратор"}</strong> ви кани в екип{" "}
                <strong className="text-foreground">{info.teamName || "—"}</strong>.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Изпратено до {info.email} · изтича {info.expiresAt ? new Date(info.expiresAt).toLocaleDateString("bg-BG") : ""}
              </p>
              {user && user.email && info.email && user.email.toLowerCase() !== info.email.toLowerCase() && (
                <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  Влезли сте като {user.email}. Излезте и влезте с {info.email}, за да приемете поканата.
                </p>
              )}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={accept} disabled={busy} className="bg-gradient-gold text-navy">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Приеми
                </Button>
                <Button variant="outline" onClick={decline} disabled={busy}>Откажи</Button>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
