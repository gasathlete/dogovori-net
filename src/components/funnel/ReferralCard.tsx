import { useEffect, useMemo, useState } from "react";
import { Gift, Copy, Check, Share2, Sparkles } from "@/icons";
import { toast } from "sonner";

/**
 * ReferralCard — viral loop entry point on the user dashboard.
 *
 * Стимул: и двете страни (поканващ + поканен) получават по 10
 * безплатни операции при първи успешен signup на поканения. Кодът
 * е детерминистичен (base36 от user.id) — лесен за изговаряне и
 * стабилен между сесии без DB запис на този етап.
 *
 * Без backend ефекти все още — share UI + tracking events. Когато
 * има готовност за credit accrual, ще се добави edge function за
 * validation на ?ref=CODE при signup.
 */

const BENEFIT_OPS = 10;

function makeCode(userId: string): string {
  // Short, uppercase, no-confusion chars. Base36 от първите 8 hex от UUID.
  const hex = userId.replace(/-/g, "").slice(0, 8);
  const num = parseInt(hex, 16) || 0;
  return num.toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

export function ReferralCard({ userId, email }: { userId: string; email?: string | null }) {
  const code = useMemo(() => makeCode(userId), [userId]);
  const url = useMemo(() => {
    if (typeof window === "undefined") return `https://dogovori.net/auth?ref=${code}`;
    return `${window.location.origin}/auth?ref=${code}`;
  }, [code]);

  const [copied, setCopied] = useState(false);
  const [referrals, setReferrals] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`referrals_${userId}`);
      if (raw) setReferrals(parseInt(raw, 10) || 0);
    } catch {}
  }, [userId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Линкът е копиран");
      setTimeout(() => setCopied(false), 2000);
      try {
        (window as any).plausible?.("referral_link_copied", { props: { code } });
      } catch {}
    } catch {
      toast.error("Не успяхме да копираме линка");
    }
  };

  const nativeShare = async () => {
    const text = `Опитай DogovaryAI — AI генерира и анализира български договори за минути. ${BENEFIT_OPS} безплатни операции с моя линк:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "DogovaryAI", text, url });
        try {
          (window as any).plausible?.("referral_link_shared", { props: { code } });
        } catch {}
      } else {
        await copy();
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="relative col-span-full overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card p-5 shadow-soft md:col-span-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <Gift className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-serif text-lg leading-tight text-foreground sm:text-xl">
              Покани приятел — получавате по {BENEFIT_OPS} безплатни операции
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              <Sparkles className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
              И двамата получавате бонуса след първия създаден документ.
            </p>
          </div>
        </div>

        <div className="hidden shrink-0 md:block">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Поканени
          </span>
          <span className="block text-right font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {referrals}
          </span>
        </div>
      </div>

      <div className="relative mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-sm">
          <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
            Линк
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
            {url}
          </code>
          <span className="hidden rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 sm:inline">
            {code}
          </span>
        </div>

        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/70 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
          aria-label="Копирай линка"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          {copied ? "Копирано" : "Копирай"}
        </button>

        <button
          type="button"
          onClick={nativeShare}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
        >
          <Share2 className="h-4 w-4" />
          Сподели
        </button>
      </div>

      <p className="relative mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Бонусите се начисляват автоматично към твоя баланс. Без лимит за брой
        покани. Условия за злоупотреби: само реални нови регистрации.
      </p>
    </div>
  );
}

export default ReferralCard;
