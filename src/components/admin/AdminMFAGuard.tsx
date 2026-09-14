import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, KeyRound, Loader2, Copy, Check } from "@/icons";
import { toast } from "sonner";

/**
 * Гард за admin/moderator: ако нямат MFA factor — задължава ги да се регистрират
 * със TOTP още при първото влизане. След enroll показва "recovery" подсказка
 * (backup кодове да се пазят offline). Без MFA не пропуска под децата си.
 */
export function AdminMFAGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasMfa, setHasMfa] = useState(false);
  const [aal, setAal] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [recoveryShown, setRecoveryShown] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setAal(aalData?.currentLevel ?? null);
      if (verified) {
        setHasMfa(true);
        // ако са enroll-нати но aal == aal1 → налага им да challenge-нат
        if (aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2") {
          setEnrollOpen(true);
          await startChallenge(verified.id);
        }
      } else {
        setEnrollOpen(true);
        await beginEnroll();
      }
      setChecking(false);
    })();
  }, [user, loading]);

  const beginEnroll = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Dogovori.net admin (${new Date().toISOString().slice(0,10)})` });
    if (error) {
      // ако вече има unverified factor — изтрий и пробвай пак
      if (error.message?.includes("already exists")) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const unverified = factors?.totp?.find((f) => f.status !== "verified");
        if (unverified) await supabase.auth.mfa.unenroll({ factorId: unverified.id });
        const retry = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Dogovori.net admin (${new Date().toISOString().slice(0,10)})` });
        if (retry.error) { toast.error(retry.error.message); return; }
        setFactorId(retry.data.id);
        setQr(retry.data.totp.qr_code);
        setSecret(retry.data.totp.secret);
        return;
      }
      toast.error(error.message);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const startChallenge = async (fid: string) => {
    setFactorId(fid);
    const { error } = await supabase.auth.mfa.challenge({ factorId: fid });
    if (error) toast.error(error.message);
  };

  const verify = async () => {
    if (!factorId || code.length < 6) return;
    setVerifying(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
      if (error) throw error;
      toast.success("MFA активирано");
      setHasMfa(true);
      setAal("aal2");
      if (qr && !recoveryShown) {
        setRecoveryShown(true);
      } else {
        setEnrollOpen(false);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Грешен код");
    } finally {
      setVerifying(false);
      setCode("");
    }
  };

  if (loading || checking) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  const needsBlock = !hasMfa || aal !== "aal2";

  return (
    <>
      {!needsBlock && children}
      {needsBlock && (
        <div className="flex min-h-dvh items-center justify-center p-6">
          <div className="max-w-md space-y-4 rounded-xl border border-gold/40 bg-card p-8 text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-gold" />
            <h2 className="font-serif text-xl font-bold">Изисква се MFA</h2>
            <p className="text-sm text-muted-foreground">
              Admin панелът изисква двуфакторна автентикация (TOTP). Моля, завършете настройката, за да продължите.
            </p>
            <Button onClick={() => setEnrollOpen(true)} className="bg-gradient-to-r from-gold to-gold/80 text-black">
              <KeyRound className="mr-2 h-4 w-4" /> Настрой / Потвърди MFA
            </Button>
          </div>
        </div>
      )}

      <Dialog open={enrollOpen} onOpenChange={(o) => { if (!hasMfa) return; setEnrollOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-gold" />
              {recoveryShown ? "Запазете recovery информацията" : hasMfa ? "Потвърди MFA" : "Настройка на MFA"}
            </DialogTitle>
            <DialogDescription>
              {recoveryShown
                ? "Запазете тези данни на сигурно място. Без тях няма да можете да възстановите достъп при загубен телефон."
                : hasMfa
                ? "Въведете 6-цифрения код от вашето TOTP приложение (Authy, Google Authenticator, 1Password)."
                : "Сканирайте QR кода с TOTP приложение и въведете 6-цифрения код."}
            </DialogDescription>
          </DialogHeader>

          {!recoveryShown && !hasMfa && qr && (
            <div className="space-y-3">
              <div className="flex justify-center rounded-lg bg-white p-4">
                <img loading="lazy" decoding="async" src={qr} alt="MFA QR код" className="h-48 w-48" />
              </div>
              {secret && (
                <div className="text-xs text-muted-foreground">
                  Manual entry: <code className="rounded bg-muted px-1 py-0.5 font-mono">{secret}</code>
                </div>
              )}
            </div>
          )}

          {!recoveryShown && (
            <div className="space-y-2">
              <Label>6-цифрен код</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="text-center font-mono text-lg tracking-widest"
              />
            </div>
          )}

          {recoveryShown && (
            <Alert>
              <AlertDescription className="space-y-3 text-xs">
                <p className="font-semibold">Recovery опции (запазете offline):</p>
                <ol className="ml-4 list-decimal space-y-1">
                  <li>Запазете TOTP secret-а от настройката: <code className="rounded bg-muted px-1 font-mono">{secret}</code></li>
                  <li>Експортирайте резервни кодове от вашето TOTP приложение (Authy/1Password поддържат cloud sync).</li>
                  <li>При загубен достъп — пишете на <a href="mailto:imdevelopmentoffice@gmail.com" className="underline">imdevelopmentoffice@gmail.com</a> от потвърдения email.</li>
                  <li>Втори admin може да премахне MFA fact-ора през Supabase dashboard (двама-човека правило).</li>
                </ol>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(secret ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                >
                  {copied ? <Check className="mr-2 h-3 w-3 text-success" /> : <Copy className="mr-2 h-3 w-3" />}
                  Копирай secret
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            {recoveryShown ? (
              <Button onClick={() => setEnrollOpen(false)} className="w-full">Разбрах, продължи</Button>
            ) : (
              <Button onClick={verify} disabled={verifying || code.length !== 6} className="w-full">
                {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Потвърди
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
