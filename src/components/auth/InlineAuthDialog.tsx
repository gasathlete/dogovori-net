import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { translateAuthError } from "@/lib/authErrors";
import { drainBufferedEvents } from "@/lib/bufferedEvents";
import { INLINE_AUTH_EVENT, takeInlineAuthSuccess, type InlineAuthDetail } from "@/lib/inlineAuth";
import { trackAuthPromptShown } from "@/lib/docFunnel";
import { FREE_OFFER_RULE } from "@/lib/pricing";
import { buildAuthRedirectUrl, currentReturnPath } from "@/lib/safeRoute";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, Sparkles } from "@/icons";

/**
 * Олекотен модал за вход/регистрация вътре в текущия екран.
 *
 * Слуша `dogovori:inline-auth` и НЕ извършва навигация: попълнените данни в
 * уизарда остават в паметта и в локалната чернова, а след успешен вход
 * операцията, заради която е поискана автентикацията, продължава автоматично.
 */
export function InlineAuthDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [action, setAction] = useState<string | undefined>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  // Задължително съгласие за съхранение на име/имейл и вътрешни известия.
  const [notifications, setNotifications] = useState(true);
  // Отделен, изрично заявен отказ от имейл маркетинг.
  const [marketingRefused, setMarketingRefused] = useState(false);
  const successRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const show = (detail: Partial<InlineAuthDetail>) => {
      successRef.current = takeInlineAuthSuccess();
      setAction(detail?.action);
      setMode(detail?.mode === "login" ? "login" : "signup");
      setEmailSent(false);
      setOpen(true);
      // auth_prompt_shown се отчита тук — единственото място, където подканата
      // реално се показва (дедупликирано по doc_key + намерение + източник).
      if (detail?.silent) return;
      trackAuthPromptShown({
        doc_key: detail?.docKey,
        source: detail?.source ?? "inline",
        action: detail?.intent ?? detail?.action ?? "generic",
        mode: detail?.mode ?? "signup",
      });
    };
    const handler = (e: Event) => show(((e as CustomEvent).detail ?? {}) as Partial<InlineAuthDetail>);
    window.addEventListener(INLINE_AUTH_EVENT, handler as EventListener);
    drainBufferedEvents(INLINE_AUTH_EVENT, (d) => show(((d as Partial<InlineAuthDetail>) ?? {})));
    return () => window.removeEventListener(INLINE_AUTH_EVENT, handler as EventListener);
  }, []);

  const finish = () => {
    const cb = successRef.current;
    successRef.current = null;
    setOpen(false);
    setPassword("");
    // Малко по-дълго изчакване, за да успее onAuthStateChange да обнови
    // React състоянието преди повторното извикване на защитеното действие.
    if (cb) setTimeout(cb, 250);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        toast.error("Неуспешен вход", { description: translateAuthError(error.message) });
        return;
      }
      toast.success("Добре дошли отново");
      finish();
      return;
    }
    if (password.length < 8) {
      setBusy(false);
      toast.error("Паролата трябва да съдържа поне 8 символа");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Имейл линкът връща към текущия екран, но само като доверен origin +
      // изчистен относителен път (без hash, без ab_/utm_ параметри).
      options: { emailRedirectTo: buildAuthRedirectUrl(currentReturnPath()) },
    });
    setBusy(false);
    if (error) {
      toast.error("Неуспешна регистрация", { description: translateAuthError(error.message) });
      return;
    }
    if (data.session) {
      toast.success("Профилът е създаден");
      finish();
      return;
    }
    setEmailSent(true);
  };

  const google = async () => {
    if (mode === "signup" && !notifications) {
      toast.error("Моля, потвърдете задължителното съгласие за име и имейл.");
      return;
    }
    setBusy(true);
    try {
      // Пълното OAuth пренасочване връща потребителя на същия адрес —
      // черновата в уизарда се възстановява автоматично.
      sessionStorage.setItem("post_login_redirect", currentReturnPath());
      sessionStorage.setItem(
        "pending_consents",
        JSON.stringify({
          marketing: false,
          marketing_refused: marketingRefused,
          operational_notifications: mode === "signup" ? notifications : true,
          terms: true,
          privacy: true,
          age_18: true,
          ts: Date.now(),
        }),
      );
    } catch { /* хранилището е недостъпно */ }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      setBusy(false);
      toast.error("Неуспешен вход с Google", { description: String(result.error) });
      return;
    }
    if (result.redirected) return;
    setBusy(false);
    toast.success("Успешен вход");
    finish();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm border-gold/30 bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">
            {mode === "login" ? "Вход в профила" : "Създаване на профил"}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {action
              ? `За „${action}“ е необходим профил. Въведените данни остават запазени.`
              : "Въведените от вас данни остават запазени — продължавате оттам, откъдето сте спрели."}
          </DialogDescription>
        </DialogHeader>

        {emailSent ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-emerald-600 dark:text-emerald-400">
              Изпратихме съобщение за потвърждение на <strong>{email}</strong>. След потвърждение се
              връщате на тази страница с попълнените данни.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setMode("login")}>
              Вече потвърдих — вход
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="inline-auth-email">Електронна поща</Label>
              <Input
                id="inline-auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inline-auth-password">Парола</Label>
              <Input
                id="inline-auth-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {mode === "signup" && (
              <div className="space-y-2 rounded-md border border-border/60 bg-card/30 p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="inline-c-notify"
                    checked={notifications}
                    onCheckedChange={(v) => setNotifications(!!v)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="inline-c-notify" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
                    Съгласявам се да предоставя име и имейл, които се съхраняват в профила ми и се
                    използват за вътрешни известия по документите и за проверката при подписване.{" "}
                    <span className="text-gold">*</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="inline-c-mkt-refuse"
                    checked={marketingRefused}
                    onCheckedChange={(v) => setMarketingRefused(!!v)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="inline-c-mkt-refuse" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
                    Изрично отказвам да получавам имейл маркетинг. <span className="text-muted-foreground">(по желание)</span>
                  </Label>
                </div>
              </div>
            )}
            <Button type="submit" className="w-full gap-2" disabled={busy || (mode === "signup" && !notifications)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {mode === "login" ? "Вход и продължаване" : "Създай профил и продължи"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={google} disabled={busy}>
              Продължи с Google
            </Button>
            <button
              type="button"
              className="w-full text-center text-[13px] text-muted-foreground underline-offset-2 hover:text-gold hover:underline"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Нямам профил — регистрация" : "Вече имам профил — вход"}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              {FREE_OFFER_RULE} · без карта · GDPR
            </p>
            <p className="text-center text-[11px] text-muted-foreground">
              Със създаването на профил приемате{" "}
              <Link to="/terms" className="underline hover:text-gold" onClick={() => setOpen(false)}>
                Общите условия
              </Link>{" "}
              и{" "}
              <Link to="/privacy" className="underline hover:text-gold" onClick={() => setOpen(false)}>
                Политиката за поверителност
              </Link>
              .
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
