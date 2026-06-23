import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, ShieldCheck, FileSignature, BrainCircuit } from "lucide-react";

/**
 * Global auth gate modal.
 *
 * Listens for the `dogovori:require-auth` custom event and renders a single
 * conversion modal that prompts unauthenticated users to register before
 * running any billable operation (download, upload, AI send, e-sign, etc.).
 *
 * Public/SEO pages stay browsable — the gate only fires the moment a user
 * triggers an actual operation through the `useRequireAuth` hook.
 */
export const AUTH_GATE_EVENT = "dogovori:require-auth";

export interface AuthGateDetail {
  /** Short human label, e.g. "Изтегли бланка" — shown above the CTA. */
  action?: string;
  /** Path to return to after successful sign-in. Defaults to current URL. */
  redirect?: string;
}

export function AuthGateModal() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AuthGateDetail>({});
  const location = useLocation();

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<AuthGateDetail>;
      setDetail(ce.detail || {});
      setOpen(true);
    };
    window.addEventListener(AUTH_GATE_EVENT, handler as EventListener);
    return () => window.removeEventListener(AUTH_GATE_EVENT, handler as EventListener);
  }, []);

  // Close the gate automatically on route change so it never sticks across navigations.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const redirect = detail.redirect ?? (typeof window !== "undefined" ? location.pathname + location.search : "/");
  const safeRedirect = /^\/[^/\\]/.test(redirect) ? redirect : "/";
  const authHref = `/auth?redirect=${encodeURIComponent(safeRedirect)}`;
  const signupHref = `/auth?tab=signup&redirect=${encodeURIComponent(safeRedirect)}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md border-gold/30 bg-card">
        <DialogHeader>
          <div className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center font-serif text-xl">
            Регистрирай се за да продължиш
          </DialogTitle>
          <DialogDescription className="text-center">
            {detail.action ? (
              <>
                За „<span className="font-medium text-foreground">{detail.action}</span>" е необходим безплатен акаунт.
              </>
            ) : (
              <>За тази операция е необходим безплатен акаунт.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-2 space-y-2 text-sm">
          <li className="flex items-start gap-2 text-muted-foreground">
            <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>10 безплатни операции при регистрация — без карта.</span>
          </li>
          <li className="flex items-start gap-2 text-muted-foreground">
            <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>AI асистент, шаблони, анализ на риска и комплекти.</span>
          </li>
          <li className="flex items-start gap-2 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>Документите ти се пазят в защитен профил (GDPR).</span>
          </li>
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            to={signupHref}
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-b from-gold to-gold/80 px-4 py-2.5 text-sm font-semibold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)] transition-all hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" /> Започни безплатно
          </Link>
          <Link
            to={authHref}
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-gold"
          >
            Имам акаунт → Вход
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
