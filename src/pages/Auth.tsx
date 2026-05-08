import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/account";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error("Грешка при вход", { description: error.message });
    toast.success("Добре дошли!");
    navigate(redirect);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + redirect,
        data: { display_name: name },
      },
    });
    setBusy(false);
    if (error) return toast.error("Грешка при регистрация", { description: error.message });
    toast.success("Регистрацията е успешна!");
    navigate(redirect);
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + redirect,
    });
    if (result.error) {
      setBusy(false);
      return toast.error("Грешка с Google", { description: String(result.error) });
    }
    if (result.redirected) return;
    setBusy(false);
    navigate(redirect);
  };

  const handleReset = async () => {
    if (!email) return toast.error("Въведете email за възстановяване");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (error) return toast.error("Грешка", { description: error.message });
    toast.success("Изпратихме ви линк за нова парола");
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container max-w-md py-12 md:py-20">
        <div className="rounded-2xl border border-border/60 bg-gradient-card p-8 shadow-soft">
          <h1 className="font-serif text-3xl font-bold">Профил</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Влезте, за да теглите договори и да управлявате контрагентите си.
          </p>

          <Tabs defaultValue="login" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="lemail">Email</Label>
                  <Input id="lemail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="lpw">Парола</Label>
                  <Input id="lpw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-gold text-navy hover:shadow-gold">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Влез
                </Button>
                <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-gold">
                  Забравена парола?
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="sname">Име</Label>
                  <Input id="sname" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="semail">Email</Label>
                  <Input id="semail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="spw">Парола</Label>
                  <Input id="spw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-gold text-navy hover:shadow-gold">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Създай профил
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            или
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            Продължи с Google
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-gold">← Към началото</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
