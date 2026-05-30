import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error("Грешка", { description: translateAuthError(error.message) });
    toast.success("Паролата е обновена");
    navigate("/account");
  };

  return (
    <div className="min-h-screen">
      <Seo
        title="Нова парола — Dogovori.net"
        description="Задайте нова парола за Вашия акаунт в Dogovori.net и продължете към профила си с пълен достъп до договорите и шаблоните."
        canonical="/reset-password"
        noindex
      />
      <Header />
      <main className="container max-w-md py-20">
        <div className="rounded-2xl border border-border/60 bg-gradient-card p-8 shadow-soft">
          <h1 className="font-serif text-2xl font-bold">Нова парола</h1>
          <form onSubmit={handle} className="mt-4 space-y-3">
            <div>
              <Label htmlFor="np">Парола</Label>
              <Input id="np" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-gradient-gold text-navy hover:shadow-gold">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Запази
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
