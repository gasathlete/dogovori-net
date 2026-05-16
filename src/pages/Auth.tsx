import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";
import { recordConsents } from "@/lib/consents";

export default function AuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/account";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Signup consent checkboxes
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptAge, setAcceptAge] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");

  const signupReady = acceptTerms && acceptPrivacy && acceptAge;
  // Google OAuth: returning users (login tab) don't need to re-accept; new users (signup tab) must.
  const googleReady = tab === "login" ? true : signupReady;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error("Грешка при вход", { description: translateAuthError(error.message) });
    toast.success("Добре дошли!");
    navigate(redirect);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupReady) {
      toast.error("Моля, потвърдете задължителните полета");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + redirect,
        data: { display_name: name },
      },
    });
    setBusy(false);
    if (error) return toast.error("Грешка при регистрация", { description: translateAuthError(error.message) });

    // Record consents (works only when session exists; otherwise silently no-op until verified).
    if (data?.session) {
      recordConsents([
        { consent_type: "terms", granted: true },
        { consent_type: "privacy", granted: true },
        { consent_type: "age_18", granted: true },
        ...(acceptMarketing ? [{ consent_type: "marketing" as const, granted: true }] : []),
      ]).catch(() => undefined);

      // Send welcome email — requires JWT.
      supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'welcome',
          recipientEmail: email,
          idempotencyKey: `welcome-${email}`,
          templateData: { name },
        },
      }).catch((e) => console.warn('welcome email failed', e));
    } else {
      // Email-verification flow: stash consents to record after first sign-in.
      try {
        sessionStorage.setItem(
          "pending_consents",
          JSON.stringify({ marketing: acceptMarketing, ts: Date.now() }),
        );
      } catch { /* storage unavailable */ }
    }

    toast.success("Регистрацията е успешна!");
    navigate(redirect);
  };

  const handleGoogle = async () => {
    if (tab === "signup" && !signupReady) {
      toast.error("Преди регистрация с Google, моля приемете задължителните условия");
      return;
    }
    setBusy(true);
    try {
      sessionStorage.setItem("post_login_redirect", redirect);
      if (tab === "signup") {
        sessionStorage.setItem(
          "pending_consents",
          JSON.stringify({ marketing: acceptMarketing, terms: true, privacy: true, age_18: true, ts: Date.now() }),
        );
      }
    } catch { /* storage unavailable */ }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
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
    if (error) return toast.error("Грешка", { description: translateAuthError(error.message) });
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
                  <p className="mt-1 text-[10px] text-muted-foreground">Минимум 8 символа.</p>
                </div>

                <div className="space-y-2 rounded-md border border-border/60 bg-card/30 p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="c-age"
                      checked={acceptAge}
                      onCheckedChange={(v) => setAcceptAge(!!v)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="c-age" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
                      Потвърждавам, че съм навършил/а <strong>18 години</strong>. <span className="text-gold">*</span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="c-terms"
                      checked={acceptTerms}
                      onCheckedChange={(v) => setAcceptTerms(!!v)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="c-terms" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
                      Прочетох и приемам{" "}
                      <Link to="/terms" target="_blank" className="text-gold hover:underline">
                        Общите условия
                      </Link>{" "}
                      на Dogovori.net. <span className="text-gold">*</span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="c-privacy"
                      checked={acceptPrivacy}
                      onCheckedChange={(v) => setAcceptPrivacy(!!v)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="c-privacy" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
                      Прочетох и приемам{" "}
                      <Link to="/privacy" target="_blank" className="text-gold hover:underline">
                        Политиката за поверителност
                      </Link>{" "}
                      и обработката на личните ми данни съгласно GDPR. <span className="text-gold">*</span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="c-mkt"
                      checked={acceptMarketing}
                      onCheckedChange={(v) => setAcceptMarketing(!!v)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="c-mkt" className="cursor-pointer text-[11px] font-normal leading-relaxed text-muted-foreground">
                      Желая да получавам новини, оферти и съвети по email (по избор; можете да оттеглите по всяко време).
                    </Label>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={busy || !signupReady}
                  className="w-full bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Създай профил
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Документите, генерирани от платформата, са образци, създадени с изкуствен интелект, и не представляват правен съвет.
                </p>
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
            disabled={busy || !signupReady}
            className="w-full border-gold/40 hover:bg-gold/10 hover:text-gold disabled:opacity-50"
            title={!signupReady ? "Първо приемете задължителните условия по-горе" : undefined}
          >
            Продължи с Google
          </Button>
          {!signupReady && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              За да продължите с Google, първо приемете задължителните условия в раздел „Регистрация".
            </p>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-gold">← Към началото</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
