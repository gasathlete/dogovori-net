import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PRELAUNCH_COPY, PRELAUNCH_LABELS, isPrelaunchFeature, type PrelaunchFeature } from "@/lib/prelaunch";
import {
  PRELAUNCH_WAITLIST_EVENT,
  submitPrelaunchWaitlist,
  type WaitlistResult,
} from "@/lib/prelaunchWaitlist";

export function PrelaunchWaitlistDialog() {
  const [feature, setFeature] = useState<PrelaunchFeature | null>(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WaitlistResult | null>(null);
  const emailId = useId();
  const consentId = useId();

  useEffect(() => {
    const onOpen = (e: Event) => {
      const f = (e as CustomEvent<{ feature?: unknown }>).detail?.feature;
      if (!isPrelaunchFeature(f)) return;
      setFeature(f);
      setEmail("");
      setConsent(false);
      setResult(null);
    };
    window.addEventListener(PRELAUNCH_WAITLIST_EVENT, onOpen);
    return () => window.removeEventListener(PRELAUNCH_WAITLIST_EVENT, onOpen);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feature || busy) return;
    setBusy(true);
    setResult(await submitPrelaunchWaitlist({ email, feature, consent }));
    setBusy(false);
  };

  const message =
    result === "accepted"
      ? PRELAUNCH_COPY.success
      : result === "invalid"
        ? PRELAUNCH_COPY.invalid
        : result === "unavailable"
          ? PRELAUNCH_COPY.unavailable
          : "";

  return (
    <Dialog open={feature !== null} onOpenChange={(o) => !o && setFeature(null)}>
      <DialogContent className="max-w-md" data-testid="prelaunch-waitlist">
        <DialogHeader>
          <DialogTitle>{PRELAUNCH_COPY.title}</DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-foreground/80">
            {PRELAUNCH_COPY.body}
          </DialogDescription>
        </DialogHeader>
        {result === "accepted" ? (
          <p role="status" className="text-sm">{message}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor={emailId}>{PRELAUNCH_COPY.emailLabel}</Label>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                inputMode="email"
                className="min-h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id={consentId}
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-1"
              />
              <Label htmlFor={consentId} className="text-sm font-normal leading-snug">
                {PRELAUNCH_COPY.consentLabel}{" "}
                <Link to="/privacy" className="underline">Политика за поверителност</Link>
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">{PRELAUNCH_COPY.revokeHint}</p>
            <p aria-live="polite" className="min-h-5 text-sm">{message}</p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setFeature(null)}>
                {PRELAUNCH_COPY.close}
              </Button>
              <Button type="submit" className="min-h-11" disabled={busy || !consent} aria-busy={busy}>
                {busy
                  ? PRELAUNCH_LABELS.sending
                  : result === "unavailable"
                    ? PRELAUNCH_LABELS.retry
                    : PRELAUNCH_COPY.submit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
