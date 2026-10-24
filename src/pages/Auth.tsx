import { useAuthAction } from "@/hooks/useAuthAction";
import { MarketingOptIn } from "@/components/auth/MarketingOptIn";
import { trackMetric } from "@/lib/metrics";
import { useEffect, useState } from "react";
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
import { Loader2 } from "@/icons";
import { translateAuthError } from "@/lib/authErrors";
import { recordConsents } from "@/lib/consents";
import { Seo } from "@/components/Seo";
import { GoogleConsentDialog } from "@/components/auth/GoogleConsentDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "@/icons";
import { buildAuthRedirectUrl, safeReturnPath } from "@/lib/safeRoute";
import { BrandLogo } from "@/components/BrandLogo";

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
  // Само относителен път в същия origin (защита от open redirect) — правилото
  // е централизирано в `safeReturnPath`, същото важи за имейл линковете.
  const rawRedirectParam = params.get("redirect");
  // Smart funnel routing: if no explicit redirect AND user has a saved
  // analysis session, send them straight back to /analiz so they get the
  // dopamine hit of seeing their result unlocked.
  const hasAnalysisSession =
    typeof window !== "undefined" &&
    (sessionStorage.getItem("funnel_analysis_v1") ||
      localStorage.getItem("funnel_analysis_v1"));
  const rawRedirect =
    rawRedirectParam || (hasAnalysisSession ? "/analiz" : "/account");
  const redirect = safeReturnPath(rawRedirect, "/account");
  // Абсолютният адрес за имейл потвърждение се строи само от доверения origin.
  const emailRedirectTo = buildAuthRedirectUrl(redirect, "/account");


  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const { busy, run } = useAuthAction();

  // Signup consent checkboxes
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptAge, setAcceptAge] = useState(false);
  // Маркетинговото съгласие е по желание — стартира ИЗКЛЮЧЕНО и НЕ участва
  // в готовността за регистрация (GDPR: свободно, конкретно съгласие).
  // Неотметнато поле не записва нищо — нито съгласие, нито отказ.
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  // Задължително: име и имейл се пазят за вътрешни известия и проверката при подпис.
  const [acceptNotifications, setAcceptNotifications] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">(
    params.get("tab") === "signup" ? "signup" : "login",
  );

  // Manual confirmation flow (resend + OTP code)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const { busy: confirmBusy, run: runConfirmation } = useAuthAction();
  const [confirmSent, setConfirmSent] = useState(false);

  // Google consent dialog (login tab — prevents account creation without consents)
  const [googleConsentOpen, setGoogleConsentOpen] = useState(false);

  const openConfirmDialog = () => {
    setConfirmEmail(email);
    setConfirmCode("");
    setConfirmSent(false);
    setConfirmOpen(true);
  };

  const handleResendCode = async () => {
    if (!confirmEmail) return toast.error("Въведете email");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: confirmEmail,
      options: { emailRedirectTo },
    });
    if (error) return toast.error("Не успяхме да изпратим код", { description: translateAuthError(error.message) });
    setConfirmSent(true);
    toast.success("Изпратихме нов 6-цифрен код на имейла ви");
  };

  const handleVerifyCode = async () => {
    if (!confirmEmail || !/^\d{6}$/.test(confirmCode.trim())) return toast.error("Въведете 6-цифрения код");
    sessionStorage.setItem("post_login_redirect", redirect);
    const { error } = await supabase.auth.verifyOtp({
      email: confirmEmail,
      token: confirmCode.trim(),
      type: "signup",
    });
    if (error) return toast.error("Невалиден код", { description: translateAuthError(error.message) });
    toast.success("Имейлът е потвърден!");
    setConfirmOpen(false);
    // AuthProvider persists consent and owns navigation after SIGNED_IN.
  };

  useEffect(() => {
    setTab(params.get("tab") === "signup" ? "signup" : "login");
  }, [params]);

  const signupReady = acceptTerms && acceptPrivacy && acceptAge && acceptNotifications;
  const showBgEmailWarning = isRiskyBgEmail(email);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      sessionStorage.setItem("post_login_redirect", redirect);
    } catch { /* storage unavailable */ }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    if (password.length < 8) {
      toast.error("Паролата трябва да е поне 8 символа");
      return;
    }
    // Store explicit evidence before signup can emit a session.
    try {
      sessionStorage.setItem(
        "pending_consents",
        JSON.stringify({
          event_id: crypto.randomUUID(),
          marketing: acceptMarketing,
          operational_notifications: acceptNotifications,
          terms: true,
          privacy: true,
          age_18: true,
          display_name: name,
          ts: Date.now(),
        }),
      );
      sessionStorage.setItem("post_login_redirect", redirect);
    } catch {
      toast.error("Не успяхме да запазим избора Ви. Разрешете съхранението в браузъра и опитайте отново.");
      return;
    }
    const { error } = await supabase.auth.signUp({
      email, password, options: { emailRedirectTo, data: { display_name: name } },
    });
    if (error) {
      try { sessionStorage.removeItem("pending_consents"); sessionStorage.removeItem("post_login_redirect"); } catch { /* unavailable */ }
      return toast.error("Грешка при регистрация", { description: translateAuthError(error.message) });
    }

    trackMetric("registration_marketing_choice_submitted", { source: "auth", opted_in: acceptMarketing });
    toast.success("Провери си имейла", {
      description: "Изпратихме ти линк за потвърждение на регистрацията.",
    });
  };


  const startGoogleOAuth = async (marketing: boolean) => {
    try {
      sessionStorage.setItem("post_login_redirect", redirect);
      // Always stash consents — the write is idempotent per consent event, and
      // ensures new accounts created via Google have the required
      // terms/privacy/age records. Marketing is passed through only when the
      // user explicitly opted in, so existing Google users are never marked
      // as consenting.
      sessionStorage.setItem(
        "pending_consents",
        JSON.stringify({
          event_id: crypto.randomUUID(),
          marketing,
          operational_notifications: true,
          terms: true,
          privacy: true,
          age_18: true,
          ts: Date.now(),
        }),
      );
    } catch { throw new Error("consent_storage_unavailable"); }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      sessionStorage.removeItem("pending_consents"); sessionStorage.removeItem("post_login_redirect");
      return toast.error("Грешка с Google", { description: String(result.error) });
    }
    if (result.redirected) return;
    navigate(redirect);
  };

  const handleGoogle = async () => {
    if (tab === "signup") {
      if (!signupReady) {
        toast.error("Преди регистрация с Google, моля приемете задължителните условия");
        return;
      }
      await startGoogleOAuth(acceptMarketing);
      return;
    }
    // Login tab: open consent dialog before OAuth to close the gap where
    // Google would silently create a new account without consents.
    setGoogleConsentOpen(true);
  };

  const handleGoogleConsentConfirm = async (marketing: boolean) => {
    setGoogleConsentOpen(false);
    await run(() => startGoogleOAuth(marketing));
  };

  const handleReset = async () => {
    if (!email) return toast.error("Въведете email за възстановяване");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildAuthRedirectUrl("/reset-password"),
    });
    if (error) return toast.error("Грешка", { description: translateAuthError(error.message) });
    toast.success("Изпратихме ви линк за нова парола");
  };

  return (
    <div className="min-h-dvh">
      <Seo
        title="Вход и регистрация — Dogovori.net"
        description="Влезте или си създайте безплатен профил в Dogovori.net, за да съставяте договори, да съхранявате документи и да управлявате абонамента си."
        canonical="/auth"
        noindex
      />
      <Header />
      <main className="container max-w-md py-12 md:py-20">
        <div className="rounded-md border border-border bg-card p-4 sm:p-6">
          <BrandLogo className="mb-5" />
          <h1 className="font-serif text-3xl font-bold text-balance">
            {tab === "login" ? "Добре дошли отново" : "Създайте профил"}
          </h1>
          <h2 className="sr-only">Вход и регистрация в Dogovori.net</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {tab === "signup" ? "Безплатен профил, без карта. Платените услуги се избират отделно." : "Влезте, за да продължите с Вашите документи."}
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")} className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={(e) => { e.preventDefault(); void run(() => handleLogin(e)); }} className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="lemail">Email</Label>
                  <Input id="lemail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  {showBgEmailWarning && (
                    <Alert className="mt-2 border-yellow-500/40 bg-yellow-500/10 text-yellow-900 dark:text-yellow-200">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-[11px] leading-relaxed">
                        Българските пощи (abv.bg, mail.bg, dir.bg) често блокират имейли за потвърждение. Препоръчваме <strong>Gmail</strong> или <strong>вход с Google</strong> за по-сигурна доставка.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <div>
                  <Label htmlFor="lpw">Парола</Label>
                  <Input id="lpw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Влез
                </Button>
                <button type="button" disabled={busy} onClick={() => void run(handleReset)} className="text-xs text-muted-foreground hover:text-gold">
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
              <form onSubmit={(e) => { e.preventDefault(); void run(() => handleSignup(e)); }} className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="sname">Име</Label>
                  <Input id="sname" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="semail">Email</Label>
                  <Input id="semail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  {showBgEmailWarning && (
                    <Alert className="mt-2 border-yellow-500/40 bg-yellow-500/10 text-yellow-900 dark:text-yellow-200">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-[11px] leading-relaxed">
                        Българските пощи (abv.bg, mail.bg, dir.bg) често блокират имейли за потвърждение. Препоръчваме <strong>Gmail</strong> или <strong>вход с Google</strong> за по-сигурна доставка.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <div>
                  <Label htmlFor="spw">Парола</Label>
                  <Input
                    id="spw"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 8 символа"
                  />
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
                      id="c-notify"
                      checked={acceptNotifications}
                      onCheckedChange={(v) => setAcceptNotifications(!!v)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="c-notify" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
                      Съгласявам се да предоставя име и имейл, които се съхраняват в профила ми и се
                      използват за вътрешни известия по документите, както и за проверката при
                      подписване, за да можем да Ви уведомим при нужда. <span className="text-gold">*</span>
                    </Label>
                  </div>
                  <MarketingOptIn id="c-mkt" checked={acceptMarketing} onCheckedChange={setAcceptMarketing} disabled={busy} />
                </div>

                <Button
                  type="submit"
                  disabled={busy || !signupReady}
                  className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Регистрирай се безплатно
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

          <button
            type="button"
            onClick={() => void run(handleGoogle)}
            disabled={busy || (tab === "signup" && !signupReady)}
            className="group relative flex w-full items-center justify-center gap-3 rounded-md border-2 border-gold/50 bg-white px-4 py-3 text-[15px] font-semibold text-slate-800 shadow-[0_4px_14px_-4px_hsl(43_55%_54%/0.45)] transition-all hover:border-gold hover:shadow-[0_6px_20px_-4px_hsl(43_55%_54%/0.65)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            title={tab === "signup" && !signupReady ? "Първо приемете задължителните условия по-горе" : undefined}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
            <span>Продължи с Google</span>
            <span className="pointer-events-none absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          </button>
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
              onClick={() => void runConfirmation(handleResendCode)}
              disabled={confirmBusy || !confirmEmail}
              variant="outline"
              className="w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
            >
              {confirmBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {confirmSent ? "Изпрати кода отново" : "Изпрати ми код"}
            </Button>
            {isRiskyBgEmail(confirmEmail) && (
              <p className="text-[11px] text-yellow-700 dark:text-yellow-300">
                Ако кодът не пристигне до 5 минути, опитайте с <strong>Google вход</strong> или друг имейл — abv.bg / mail.bg / dir.bg често блокират изпращача ни.
              </p>
            )}

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
              onClick={() => void runConfirmation(handleVerifyCode)}
              disabled={confirmBusy || confirmCode.length < 6}
              className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold"
            >
              {confirmBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Потвърди профила
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <GoogleConsentDialog
        open={googleConsentOpen}
        onOpenChange={setGoogleConsentOpen}
        onConfirm={handleGoogleConsentConfirm}
        busy={busy}
      />
    </div>
  );
}
