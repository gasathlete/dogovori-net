import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X, BookOpen, Mail } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackFunnelEvent } from "@/lib/funnel";
import { pickLeadMagnetByContext, type LeadMagnet } from "@/lib/leadMagnets";

const DISMISS_KEY = "lead_magnet_dismissed_v1";
const SHOWN_KEY = "lead_magnet_shown_v1";

/**
 * Replaces the previous 50%-off exit-intent. Offers a contextual PDF guide in
 * exchange for an email — a professional, brand-safe lead capture.
 *
 * Triggers:
 *   - desktop: mouseleave through top of viewport
 *   - mobile : 35 s on page + scrolled past 50 % (no exit signal on touch)
 */
export function ExitIntentLeadMagnet() {
  const [open, setOpen] = useState(false);
  const [magnet, setMagnet] = useState<LeadMagnet | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
      if (sessionStorage.getItem(SHOWN_KEY)) return;
    } catch { /* ignore */ }

    const trigger = (reason: string) => {
      if (triggered.current) return;
      // Don't show on auth / checkout / dashboard routes.
      const p = window.location.pathname;
      if (/^\/(auth|account|console|build|wizard|analiz|admin|reset)/i.test(p)) return;
      triggered.current = true;
      setMagnet(pickLeadMagnetByContext());
      setOpen(true);
      try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* ignore */ }
      trackFunnelEvent("lead_magnet_shown", { reason, path: p });
    };

    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger("exit_intent");
    };
    document.addEventListener("mouseleave", onMouseLeave);

    // Mobile fallback — fires once after engaged time + scroll depth.
    const mobileTimer = window.setTimeout(() => {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const scrolledHalf =
        window.scrollY + window.innerHeight > document.documentElement.scrollHeight * 0.5;
      if (isMobile && scrolledHalf) trigger("mobile_engaged");
    }, 35_000);

    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      window.clearTimeout(mobileTimer);
    };
  }, []);

  const close = () => {
    setOpen(false);
    trackFunnelEvent("lead_magnet_dismissed", { magnet: magnet?.slug });
  };

  const dontShowAgain = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    close();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magnet) return;
    setBusy(true);
    const { error } = await supabase.from("lead_magnet_subscribers").insert({
      email: email.trim().toLowerCase(),
      name: name.trim() || null,
      magnet_slug: magnet.slug,
      source: window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 250),
      marketing_consent: true,
    });
    setBusy(false);
    if (error && !/duplicate|unique/i.test(error.message)) {
      toast.error("Грешка", { description: "Опитай отново след малко." });
      return;
    }
    setDone(true);
    trackFunnelEvent("lead_magnet_converted", { magnet: magnet.slug });
    // Auto-trigger download
    const a = document.createElement("a");
    a.href = magnet.fileUrl;
    a.download = "";
    a.click();
  };

  if (!open || !magnet) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lm-title"
      className="fixed inset-0 z-[120] flex items-end justify-center bg-background/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-brand/40 bg-card shadow-elegant"
      >
        <button
          onClick={close}
          aria-label="Затвори"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header band */}
        <div
          className="px-5 pb-4 pt-6 sm:px-7 sm:pt-7"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--brand) / 0.18) 0%, transparent 80%)",
          }}
        >
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
            <BookOpen className="h-3 w-3" /> {magnet.eyebrow}
          </div>
          <h2 id="lm-title" className="mt-2 font-serif text-xl font-bold leading-tight sm:text-2xl">
            {magnet.title}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{magnet.subtitle}</p>
        </div>

        <div className="px-5 pb-5 sm:px-7 sm:pb-6">
          {!done ? (
            <>
              <ul className="mb-4 space-y-1.5 text-[13px] text-foreground">
                {magnet.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {b}
                  </li>
                ))}
              </ul>

              <form onSubmit={submit} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Име (по желание)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-sm focus:border-brand/60 focus:outline-none"
                />
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    placeholder="имейл@пример.bg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-border/60 bg-background/60 py-2.5 pl-9 pr-3 text-sm focus:border-brand/60 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !email.includes("@")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-3 text-[15px] font-semibold text-white shadow-brand transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Изтегли безплатния PDF
                </button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  С въвеждане на email-а си приемаш да получаваш кратки практични съвети
                  от Договори.нет. Можеш да се отпишеш по всяко време.
                </p>
              </form>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Download className="h-6 w-6" />
              </div>
              <p className="mt-3 font-serif text-lg font-bold">Готово!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                PDF-ът ще се изтегли автоматично. Проверѝ и Downloads папката.
              </p>
              <a
                href={magnet.fileUrl}
                download
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
              >
                Изтегли отново →
              </a>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-[11px]">
            <button
              onClick={dontShowAgain}
              className="text-muted-foreground hover:text-foreground"
            >
              Не показвай повече
            </button>
            <span className="text-muted-foreground">Без спам · GDPR-съвместимо</span>
          </div>
        </div>
      </div>
    </div>
  );
}
