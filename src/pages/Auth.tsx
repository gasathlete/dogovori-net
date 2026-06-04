import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";
import { recordConsents } from "@/lib/consents";
import { Seo } from "@/components/Seo";
import { GoogleConsentDialog } from "@/components/auth/GoogleConsentDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

const RISKY_BG_EMAIL_DOMAINS = ["abv.bg", "mail.bg", "dir.bg"];
function isRiskyBgEmail(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at < 0) return false;
  const domain = value.slice(at + 1).trim().toLowerCase();
  return RISKY_BG_EMAIL_DOMAINS.includes(domain);
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Only allow same-origin relative paths to prevent open-redirect attacks.
  // Must start with "/" followed by a non-"/" char (rejects "//evil.com" and "/\evil.com").
  const rawRedirect = params.get("redirect") || "/account";
  const redirect = /^\/[^/\\]/.test(rawRedirect) ? rawRedirect : "/account";

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

  // Manual confirmation flow (resend + OTP code)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const openConfirmDialog = () => {
    setConfirmEmail(email);
    setConfirmCode("");
    setConfirmSent(false);
    setConfirmOpen(true);
  };

  const handleResendCode = async () => {
    if (!confirmEmail) return toast.error("Въведете email");
    setConfirmBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: confirmEmail,
      options: { emailRedirectTo: window.location.origin + redirect },
    });
    setConfirmBusy(false);
    if (error) return toast.error("Не успяхме да изпратим код", { description: translateAuthError(error.message) });
    setConfirmSent(true);
    toast.success("Изпратихме нов 6-цифрен код на имейла ви");
  };

  const handleVerifyCode = async () => {
    if (!confirmEmail || confirmCode.length < 6) return toast.error("Въведете 6-цифрения код");
    setConfirmBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: confirmEmail,
      token: confirmCode.trim(),
      type: "signup",
    });
    setConfirmBusy(false);
    if (error) return toast.error("Невалиден код", { description: translateAuthError(error.message) });
    toast.success("Имейлът е потвърден!");
    setConfirmOpen(false);
    navigate(redirect);
  };

  const signupReady = acceptTerms && acceptPrivacy && acceptAge;
  // Google OAuth: returning users (login tab) don't need to re-accept; new users (signup tab) must.
  const googleReady = tab === "login" ? true : signupReady;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      sessionStorage.setItem("post_login_redirect", redirect);
    } catch { /* storage unavailable */ }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      try {
        sessionStorage.removeItem("post_login_redirect");
      } catch { /* storage unavailable */ }
      return toast.error("Грешка при вход", { description: translateAuthError(error.message) });
    }
    toast.success("Добре дошли!");
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
      <Seo
        title="Вход и регистрация — Dogovori.net"
        description="Влезте или си създайте безплатен профил в Dogovori.net, за да съставяте договори, да съхранявате документи и да управлявате абонамента си."
        canonical="/auth"
        noindex
      />
      <Header />
      <main className="container max-w-md py-12 md:py-20">
        <div className="rounded-2xl border border-gold/20 bg-gradient-card p-8 shadow-elegant anim-rise">
          <div className="eyebrow mb-3">
            <span className="h-1 w-1 rounded-full bg-gold" />
            dogovori.net
          </div>
          <h1 className="font-serif text-3xl font-bold text-balance">
            {tab === "login" ? "Добре дошли отново" : "Създайте профил"}
          </h1>
          <h2 className="sr-only">Вход и регистрация в Dogovori.net</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Влезте, за да теглите договори и да управлявате контрагентите си.
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")} className="mt-6">
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
                <Button type="submit" disabled={busy} className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Влез
                </Button>
                <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-gold">
                  Забравена парола?
                </button>
                <button
                  type="button"
                  onClick={openConfirmDialog}
                  className="ml-3 text-xs text-muted-foreground hover:text-gold"
                >
                  Не получих имейл за потвърждение
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
                      Съгласявам се да предоставя име и имейл на администратора на платформата за получаване на съобщения, известия за бонуси и награди в профила ми в dogovori.net.
                    </Label>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={busy || !signupReady}
                  className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
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

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/30" />
            <span className="h-1 w-1 rounded-full bg-gold/60" />
            или
            <span className="h-1 w-1 rounded-full bg-gold/60" />
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/30" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={busy || !googleReady}
            className="btn-sheen w-full border-gold/40 hover:bg-gold/10 hover:text-gold disabled:opacity-50"
            title={!googleReady ? "Първо приемете задължителните условия по-горе" : undefined}
          >
            Продължи с Google
          </Button>
          {tab === "signup" && !signupReady && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              За да се регистрирате с Google, първо приемете задължителните условия по-горе.
            </p>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-gold">← Към началото</Link>
          </p>
        </div>
      </main>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Потвърждение на имейл с код</DialogTitle>
            <DialogDescription>
              Ако не сте получили линка за потвърждение, ще ви изпратим 6-цифрен код. Въведете го тук, за да активирате профила си.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="confirm-email">Email</Label>
              <Input
                id="confirm-email"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                disabled={confirmBusy}
              />
            </div>
            <Button
              type="button"
              onClick={handleResendCode}
              disabled={confirmBusy || !confirmEmail}
              variant="outline"
              className="w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
            >
              {confirmBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {confirmSent ? "Изпрати кода отново" : "Изпрати ми код"}
            </Button>

            {confirmSent && (
              <p className="text-[11px] text-muted-foreground">
                Проверете и папката „Спам". Ако и след минута не получите код, проверете дали имейлът е изписан правилно или опитайте с друг адрес (Gmail работи най-надеждно).
              </p>
            )}

            <div>
              <Label htmlFor="confirm-code">6-цифрен код от имейла</Label>
              <Input
                id="confirm-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={confirmBusy}
                className="tracking-[0.4em] text-center font-mono text-lg"
              />
            </div>
            <Button
              type="button"
              onClick={handleVerifyCode}
              disabled={confirmBusy || confirmCode.length < 6}
              className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold"
            >
              {confirmBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Потвърди профила
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
