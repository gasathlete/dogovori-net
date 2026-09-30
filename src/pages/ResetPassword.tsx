import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "@/icons";
import { translateAuthError } from "@/lib/authErrors";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState("");
  const [needsNonce, setNeedsNonce] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Check URL for error params (expired / invalid link)
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const search = new URLSearchParams(window.location.search);
    const errDesc =
      hashParams.get("error_description") || search.get("error_description");
    const errCode = hashParams.get("error") || search.get("error");
    if (errDesc || errCode) {
      setLinkError(errDesc || errCode || "Невалиден или изтекъл линк.");
      return;
    }

    // Listen for PASSWORD_RECOVERY event triggered after the hash is parsed
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });

    // Also check existing session in case the event fired before mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    // A timeout never creates an authenticated recovery session.
    const t = setTimeout(() => {
      supabase.auth.getSession().then(({ data, error }) => {
        if (error || !data.session) setLinkError("Невалиден или изтекъл линк.");
        else setReady(true);
      });
    }, 3000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      return toast.error("Паролата трябва да е поне 8 символа");
    }
    if (busy || !ready || linkError || (needsNonce && !nonce.trim())) return;
    setBusy(true);
    try {
      // Verify with Auth immediately before the mutation; local session metadata is not proof.
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        setReady(false);
        setLinkError("Невалиден или изтекъл линк.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password, ...(needsNonce ? { nonce: nonce.trim() } : {}) });
      if (error) {
        if (error.code === "reauthentication_needed" || error.code === "reauthentication_not_valid") {
          setNeedsNonce(true);
          toast.error("Потвърдете промяната с код", { description: "Поискайте код за потвърждение и го въведете по-долу." });
        } else toast.error("Грешка", { description: translateAuthError(error.message) });
        return;
      }
    } catch {
      toast.error("Няма връзка със сървъра. Опитайте отново.");
      return;
    } finally {
      setBusy(false);
    }
    toast.success("Паролата е обновена");
    navigate("/account");
  };

  const requestCode = async () => {
    if (sendingCode || busy) return;
    setSendingCode(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) toast.error("Кодът не е изпратен", { description: translateAuthError(error.message) });
      else toast.success("Проверете имейла или телефона си за кода.");
    } catch { toast.error("Няма връзка със сървъра. Опитайте отново."); }
    finally { setSendingCode(false); }
  };

  return (
    <div className="min-h-dvh">
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
          <h2 className="sr-only">Възстановяване на парола в Dogovori.net</h2>

          {linkError ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Линкът за възстановяване е невалиден или изтекъл. Поискайте нов от страницата за вход.
              </p>
              <Button
                onClick={() => navigate("/auth?tab=login")}
                className="w-full bg-gradient-gold text-navy hover:shadow-gold"
              >
                Към вход
              </Button>
            </div>
          ) : (
            <form onSubmit={handle} className="mt-4 space-y-3">
              <div>
                <Label htmlFor="np">Нова парола</Label>
                <Input
                  id="np"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              {needsNonce ? (
                <div className="space-y-2">
                  <Label htmlFor="password-nonce">Код за потвърждение</Label>
                  <Input id="password-nonce" autoComplete="one-time-code" inputMode="numeric" required value={nonce} onChange={e => setNonce(e.target.value)} />
                  <Button type="button" variant="outline" className="w-full" disabled={sendingCode || busy} onClick={requestCode}>
                    {sendingCode ? "Изпращаме..." : "Изпрати код"}
                  </Button>
                </div>
              ) : null}
              <Button
                type="submit"
                disabled={busy || !ready || (needsNonce && !nonce.trim())}
                className="w-full bg-gradient-gold text-navy hover:shadow-gold"
              >
                {busy || !ready ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {ready ? "Запази" : "Подготвяме..."}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

