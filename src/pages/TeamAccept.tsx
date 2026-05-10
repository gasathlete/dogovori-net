import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function TeamAccept() {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = params.get("token");
    if (!token) { navigate("/"); return; }
    if (loading) return;
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/team/accept?token=${token}`)}`);
      return;
    }
    (async () => {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke("team-accept-invite", { body: { token } });
      if (error || !data?.ok) {
        toast.error(error?.message || "Не можахме да приемем поканата");
        navigate("/account");
      } else {
        toast.success("Добре дошли в екипа!");
        navigate("/team");
      }
      setBusy(false);
    })();
  }, [params, user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
        <p className="mt-3 text-sm text-muted-foreground">Обработваме поканата…</p>
      </div>
    </div>
  );
}
