import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut, Crown, Bird, Loader2, Plus, Trash2, Star, Download, ArrowLeft, X, MessageSquare, Check, Lock, RefreshCw, Sparkles, Building2, Bell, LayoutDashboard,
} from "lucide-react";
import { NotificationsTab } from "@/components/NotificationsTab";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadDocument } from "@/lib/downloadDocument";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { ShareForSignDialog } from "@/components/ShareForSignDialog";
import { UploadContractDialog } from "@/components/UploadContractDialog";
import { SignedContractsTab } from "@/components/SignedContractsTab";
import { ShieldAlert, ShieldCheck, AlertTriangle, PenTool, ChevronRight, KeyRound, Mail, Trash } from "lucide-react";
import { isValidEGN, isValidEIK } from "@/lib/bgValidation";
import { translateAuthError } from "@/lib/authErrors";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { Seo } from "@/components/Seo";
import { TopupHistoryPanel } from "@/components/account/TopupHistoryPanel";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { getUnlockedTiers, getNextTier, REWARD_TIERS } from "@/lib/rewards";

type Contact = {
  id: string; name: string; type: "individual" | "legal";
  egn?: string | null; eik?: string | null; vat_number?: string | null;
  address?: string | null; mol?: string | null; email?: string | null; phone?: string | null; notes?: string | null;
};
type Folder = { id: string; name: string; color: string | null; is_favorites: boolean };
type SavedDoc = {
  id: string; title: string; kind: "contract" | "template"; folder_id: string | null;
  contact_id: string | null; payload: any; created_at: string;
};
type Quota = { contracts_used: number; templates_used: number; plan: "free" | "pro"; pro_until: string | null; analyses_used?: number; total_used?: number; monthly_total_used?: number; bonus_contracts?: number; pro_monthly_used?: number; monthly_reset_at?: string | null; pro_period_start?: string | null; signup_at?: string | null };
type UploadedContract = {
  id: string; title: string; source: "pdf" | "docx" | "paste";
  folder_id: string | null; contact_id: string | null;
  original_filename: string | null; storage_path: string | null;
  created_at: string;
};
type RiskAnalysisLite = { uploaded_contract_id: string; score: number; contract_type: string; created_at: string };

type SubRow = {
  id: string;
  status: string | null;
  environment: "sandbox" | "live";
  price_id: string | null;
  product_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

const PLAN_LABELS: Record<string, { name: string; price: string; cycle: string }> = {
  pro_monthly: { name: "Професионалист — месечен", price: "12.90 €", cycle: "месечно" },
  pro_yearly: { name: "Професионалист — годишен", price: "129 €", cycle: "годишно" },
  professional_monthly: { name: "Професионалист — месечен", price: "12.90 €", cycle: "месечно" },
  professional_yearly: { name: "Професионалист — годишен", price: "129 €", cycle: "годишно" },
  entrepreneur_monthly: { name: "Предприемач — месечен", price: "19.90 €", cycle: "месечно" },
  entrepreneur_yearly: { name: "Предприемач — годишен", price: "199 €", cycle: "годишно" },
  five_operations: { name: "Пакет 5 операции", price: "1.90 €", cycle: "еднократно" },
};

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "err" | "info" }> = {
  active: { label: "Активен", tone: "ok" },
  trialing: { label: "Пробен период", tone: "ok" },
  past_due: { label: "Неуспешно плащане", tone: "err" },
  unpaid: { label: "Неплатен", tone: "err" },
  canceled: { label: "Прекратен", tone: "warn" },
  incomplete: { label: "Незавършен", tone: "warn" },
  incomplete_expired: { label: "Изтекъл", tone: "warn" },
  paused: { label: "Поставен на пауза", tone: "info" },
};

function formatSubDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("bg-BG", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return "—"; }
}

function SubscriptionTab({ quota, isPro }: { quota: Quota | null; isPro: boolean }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checkoutPrice, setCheckoutPrice] = useState<string | null>(null);
  const [sub, setSub] = useState<SubRow | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAllPlans, setShowAllPlans] = useState(false);
  const subStatus = sub?.status ?? null;
  const planMeta = sub?.price_id ? PLAN_LABELS[sub.price_id] : undefined;
  const statusMeta = subStatus ? STATUS_META[subStatus] ?? { label: subStatus, tone: "info" as const } : null;
  const renewLabel = sub?.cancel_at_period_end ? "Достъп до" : "Подновяване на";
  const redirectAfter = searchParams.get("redirect") || "";
  const returnUrl = `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}${
    redirectAfter ? `&redirect=${encodeURIComponent(redirectAfter)}` : ""
  }`;

  // Auto-open checkout if requested via ?checkout=...
  useEffect(() => {
    const requested = searchParams.get("checkout");
    if (!requested) return;
    const allowed = ["pro_monthly", "pro_yearly", "professional_monthly", "professional_yearly", "entrepreneur_monthly", "entrepreneur_yearly", "five_operations"];
    if (allowed.includes(requested)) setCheckoutPrice(requested);
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("subscriptions")
      .select("id, status, environment, price_id, product_id, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setSub((data as any) ?? null));
  }, [user]);

  const portal = async () => {
    setBusy(true);
    // Open a placeholder tab synchronously to avoid popup blockers
    const popup = window.open("about:blank", "_blank");
    const env = sub?.environment
      ?? ((import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string)?.startsWith("pk_test_") ? "sandbox" : "live");
    const { data, error } = await supabase.functions.invoke("customer-portal", {
      body: {
        environment: env,
        returnUrl: window.location.origin + "/account?tab=subscription",
      },
    });
    setBusy(false);
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg?.includes("No subscription")) {
      popup?.close();
      return toast.info("Няма Stripe абонамент в този режим", {
        description: "Достъпът Ви е активиран ръчно от администратор и не се управлява през платежния портал. За промени се свържете с поддръжката.",
      });
    }
    if (errMsg || !data?.url) {
      popup?.close();
      return toast.error("Грешка", { description: errMsg || "Неуспешно отваряне на портала." });
    }
    if (popup) {
      popup.location.href = data.url;
    } else {
      // Popup blocked — fall back to same-tab navigation
      window.location.href = data.url;
    }
  };

  const proFeatures = [
    "От 50 до 100 операции на месец (договори, бланки и анализи)",
    "Двуезични документи (BG/EN) с паралелна колона",
    "Преглед на живо и стъпков Wizard",
    "Интелигентен анализ на качени документи",
    "Дигитален подпис с изображение",
    "Онлайн подписване чрез споделен линк",
    "Сваляне в PDF и DOCX без воден знак",
    "История, папки и повторно сваляне без брой",
    "Правен асистент без лимит",
    "Достъп до всички нови шаблони",
  ];

  const teamFeatures = [
    "100 операции на място/месец (споделен капацитет)",
    "Споделени шаблони, контакти и папки",
    "Брандирани PDF/DOCX с лого на фирмата",
    "Журнал на действията за администратори",
    "Споделяне за онлайн подпис",
    "Достъп с фирмен имейл и роли",
    "Всичко от плана Предприемач за всеки член",
  ];

  const oneOffFeatures = [
    "5 операции по избор, всички функционалности на \"Предприемач\"",
    "Без воден знак",
    "Без абонамент · не изтичат",
  ];

  const proMonthlyUsed = (quota as any)?.pro_monthly_used ?? 0;
  const proMonthlyCap = 100;
  const proPct = Math.min(100, Math.round((proMonthlyUsed / proMonthlyCap) * 100));

  const Feature = ({ children }: { children: React.ReactNode }) => (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-foreground/85">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={2.5} />
      <span>{children}</span>
    </li>
  );

  return (
    <div className="space-y-8">
      {redirectAfter && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gold">←</span>
            <span className="text-muted-foreground">
              Договорът, върху който работехте, е запазен. Можете да се върнете без да губите прогрес.
            </span>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="shrink-0 border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            <Link to={redirectAfter}>Назад към документа</Link>
          </Button>
        </div>
      )}
      {/* Context links: deep-link to public GEO pages so they remain reachable
          from the pricing surface (helps internal-link graph + crawl depth). */}
      <p className="text-xs text-muted-foreground">
        Научете повече за{" "}
        <a href="/ai" className="underline-offset-2 hover:text-gold hover:underline">как работи AI правният анализ</a>
        {" "}или разгледайте{" "}
        <a href="/karta" className="underline-offset-2 hover:text-gold hover:underline">картата на всички 600+ шаблона</a>.
      </p>
      {subStatus === "past_due" && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Плащането за абонамента не премина</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Картата Ви е отказана или изтекла. Ще опитаме отново автоматично, но за да избегнете прекъсване — обновете данните за плащане.
            </p>
            <Button onClick={portal} disabled={busy} size="sm" variant="outline" className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Обнови данни за плащане
            </Button>
          </div>
        </div>
      )}

      {sub?.cancel_at_period_end && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="font-medium text-amber-600">Абонаментът няма да се поднови</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Имате достъп до {formatSubDate(sub.current_period_end)}. След тази дата планът се прекратява автоматично.
            </p>
          </div>
        </div>
      )}

      {/* Current plan */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-7 shadow-soft">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              <Crown className="h-3.5 w-3.5" /> Текущ план
              {statusMeta && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                    statusMeta.tone === "ok"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : statusMeta.tone === "warn"
                      ? "bg-amber-500/15 text-amber-500"
                      : statusMeta.tone === "err"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {statusMeta.label}
                </span>
              )}
            </div>
            <h3 className="mt-2 font-serif text-3xl font-bold tracking-tight">
              {planMeta?.name ?? (isPro ? "Предприемач" : "Безплатен")}
            </h3>
            {planMeta && (
              <p className="mt-1 text-sm font-medium text-foreground/80">
                {planMeta.price} · {planMeta.cycle}
              </p>
            )}
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {isPro
                ? `Използвани ${proMonthlyUsed} от ${proMonthlyCap} операции за текущия период.`
                : (() => {
                    const signupAt = (quota as any)?.signup_at ? new Date((quota as any).signup_at).getTime() : null;
                    const withinFirstMonth = !!signupAt && Date.now() - signupAt < 30 * 24 * 60 * 60 * 1000;
                    const cap = withinFirstMonth ? 5 : 2;
                    const used = (quota as any)?.monthly_total_used ?? 0;
                    const corrFree = (quota as any)?.corrections_free_used
                      ? "Безплатната вълна авто-корекции вече е използвана."
                      : "Имате +1 безплатна вълна автоматични корекции (не консумира операция).";
                    return `5 операции при регистрация, после 2 на месец. Документите се свалят с дискретен воден знак. Използвани: ${used} от ${cap} този месец. ${corrFree}`;
                  })()}
            </p>

            {isPro && (
              <div className="mt-5 max-w-md">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>Капацитет</span>
                  <span className="text-gold">{proMonthlyUsed} / {proMonthlyCap}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
                  <div className="h-full bg-gradient-gold transition-all" style={{ width: `${proPct}%` }} />
                </div>
                {proPct >= 90 && (
                  <p className="mt-2 text-xs text-gold">Наближавате месечния лимит. Помислете за план Екип.</p>
                )}
              </div>
            )}

            {isPro && sub?.price_id?.startsWith("entrepreneur") && (
              <div className="mt-5 rounded-xl border border-gold/40 bg-gradient-to-br from-gold/10 to-transparent p-5">
                <div className="flex items-center gap-2 text-gold">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Премиум привилегии</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
                  <li>✓ Приоритетна AI обработка + GPT-5 модел</li>
                  <li>✓ Премиум поддръжка 24/7 — <a href="mailto:premium@dogovori.net" className="text-gold underline">premium@dogovori.net</a></li>
                  <li>✓ Персонален onboarding — <a href="mailto:onboarding@dogovori.net" className="text-gold underline">резервирайте час</a></li>
                  <li>✓ Ранен достъп до нови функции</li>
                </ul>
              </div>
            )}

            {!isPro && ((quota as any)?.bonus_contracts ?? 0) > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
                <Sparkles className="h-3.5 w-3.5" />
                Налични купени операции: {(quota as any)?.bonus_contracts}
              </div>
            )}
          </div>

          {isPro && (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Button onClick={() => setShowAllPlans((v) => !v)} variant="outline" className="border-gold/40">
                {showAllPlans ? "Скрий плановете" : "Всички планове"}
              </Button>
              <Button onClick={portal} disabled={busy} variant="outline" className="border-gold/40">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Управление на абонамент
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-gold">
                <a href="/team">План Екип за фирми →</a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Subscription management details */}
      {sub && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl font-bold tracking-tight">Управление на абонамента</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Всички промени се извършват сигурно през платежния портал на Stripe.
              </p>
            </div>
            <Button onClick={portal} disabled={busy} variant="outline" className="border-gold/40">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CreditCard className="mr-2 h-4 w-4" /> Отвори платежен портал
            </Button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/50 bg-background/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">План</p>
              <p className="mt-1 text-sm font-medium">{planMeta?.name ?? sub.price_id ?? "—"}</p>
              {planMeta && <p className="text-xs text-muted-foreground">{planMeta.price} · {planMeta.cycle}</p>}
            </div>
            <div className="rounded-xl border border-border/50 bg-background/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Статус</p>
              <p className="mt-1 text-sm font-medium">{statusMeta?.label ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Режим: {sub.environment === "live" ? "реални плащания" : "тест"}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Текущ период</p>
              <p className="mt-1 text-sm font-medium">от {formatSubDate(sub.current_period_start)}</p>
              <p className="text-xs text-muted-foreground">начална дата</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{renewLabel}</p>
              <p className="mt-1 text-sm font-medium">{formatSubDate(sub.current_period_end)}</p>
              <p className="text-xs text-muted-foreground">
                {sub.cancel_at_period_end ? "няма да се поднови" : "автоматично подновяване"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button onClick={portal} disabled={busy} className="group flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4 text-left transition-colors hover:border-gold/40 hover:bg-background/70 disabled:opacity-60">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-sm font-medium">Метод на плащане</p>
                <p className="text-xs text-muted-foreground">Смяна на карта или адрес</p>
              </div>
            </button>
            <button onClick={portal} disabled={busy} className="group flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4 text-left transition-colors hover:border-gold/40 hover:bg-background/70 disabled:opacity-60">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-sm font-medium">Фактури и плащания</p>
                <p className="text-xs text-muted-foreground">Изтегли PDF фактури</p>
              </div>
            </button>
            <button onClick={portal} disabled={busy} className="group flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4 text-left transition-colors hover:border-gold/40 hover:bg-background/70 disabled:opacity-60">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-sm font-medium">Смяна на план</p>
                <p className="text-xs text-muted-foreground">Месечен ↔ годишен</p>
              </div>
            </button>
            <button onClick={portal} disabled={busy} className="group flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4 text-left transition-colors hover:border-destructive/40 hover:bg-background/70 disabled:opacity-60">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium">Откажи абонамента</p>
                <p className="text-xs text-muted-foreground">Достъп до края на периода</p>
              </div>
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border/40 bg-background/30 p-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-gold" />
              <span>Картовите данни се обработват от Stripe — не се съхраняват на наш сървър.</span>
            </div>
            <a href="/contacts" className="inline-flex items-center gap-1 font-medium text-gold hover:underline">
              <Mail className="h-3.5 w-3.5" /> Свържи се с поддръжката
            </a>
          </div>
        </div>
      )}

      <TopupHistoryPanel />


      {/* Manual-activation notice when isPro but no Stripe sub */}
      {isPro && !sub && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <div className="flex-1">
              <p className="font-medium">Достъп активиран ръчно</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Вашият Предприемач достъп е активиран от администратор и не се управлява през платежния портал.
                {(quota as any)?.pro_until && (
                  <> Валиден до <span className="font-medium text-foreground">{formatSubDate((quota as any).pro_until)}</span>.</>
                )}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3 border-gold/40">
                <a href="/contacts"><Mail className="mr-2 h-4 w-4" /> Свържи се с поддръжката</a>
              </Button>
            </div>
          </div>
        </div>
      )}


      {(!isPro || showAllPlans) && (
        <>
          {/* Pricing header */}
          <div className="text-center">
            <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">Изберете правилния план за Вас</h2>
            <p className="mt-2 text-sm text-muted-foreground">Прозрачно ценообразуване · ДДС включено · отказ по всяко време</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              <Sparkles className="h-3.5 w-3.5" /> Промокод <strong className="tracking-wider">FIRST100</strong> → −20% за нови клиенти
            </p>
          </div>

          {/* Pricing grid — 4 tiers */}
          <div className="grid gap-5 lg:grid-cols-4">
            {/* Професионалист */}
            <div className="flex flex-col rounded-2xl border border-border/60 bg-gradient-card p-6 transition-colors hover:border-gold/40">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> За самонаети
              </div>
              <h3 className="mt-2 font-serif text-xl font-bold">Професионалист</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-serif text-3xl font-bold text-foreground">12.90 €</span>
                <span className="text-xs text-muted-foreground">/ мес</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">50 операции/мес · ДДС вкл.</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">или 129 €/год (≈ 10.75 €/мес)</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  onClick={() => setCheckoutPrice("professional_monthly")}
                  variant="outline"
                  className="border-gold/40 text-gold hover:bg-gold/10"
                >
                  Месечен
                </Button>
                <Button
                  onClick={() => setCheckoutPrice("professional_yearly")}
                  variant="outline"
                  className="border-border/80"
                >
                  Годишен 129 €
                </Button>
              </div>
              <div className="my-5 h-px bg-border/60" />
              <ul className="space-y-2.5">
                <Feature>50 операции / месец</Feature>
                <Feature>Неограничен AI Асистент</Feature>
                <Feature>Двуезични договори (EN/DE/FR)</Feature>
                <Feature>Неограничени комплекти</Feature>
                <Feature>Без воден знак</Feature>
              </ul>
            </div>

            {/* Предприемач — featured */}
            <div className="relative flex flex-col rounded-2xl border-2 border-gold bg-gradient-card p-6 shadow-gold lg:scale-[1.02]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-gold px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-navy shadow-soft">
                Най-премиум
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                <Crown className="h-3.5 w-3.5" /> Предприемач
              </div>
              <h3 className="mt-2 font-serif text-xl font-bold">Премиум план</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-serif text-3xl font-bold text-foreground">19.90 €</span>
                <span className="text-xs text-muted-foreground">/ мес</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">100 операции/мес · GPT-5 · ДДС вкл.</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">или 199 €/год (≈ 16.60 €/мес)</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  onClick={() => setCheckoutPrice("entrepreneur_monthly")}
                  className="bg-gradient-gold text-navy hover:shadow-gold"
                >
                  Месечен
                </Button>
                <Button
                  onClick={() => setCheckoutPrice("entrepreneur_yearly")}
                  variant="outline"
                  className="border-gold/40 text-gold hover:bg-gold/10"
                >
                  Годишен 199 €
                </Button>
              </div>
              <div className="my-5 h-px bg-gold/15" />
              <ul className="space-y-2.5">
                <Feature>100 операции / месец</Feature>
                <Feature>Приоритетна AI обработка + GPT-5</Feature>
                <Feature>Premium поддръжка 24/7</Feature>
                <Feature>Персонален onboarding</Feature>
                <Feature>Ранен достъп до нови функции</Feature>
                <Feature>Всичко от Професионалист</Feature>
              </ul>
            </div>

            {/* Екип */}
            <div className="flex flex-col rounded-2xl border border-border/60 bg-gradient-card p-6 transition-colors hover:border-gold/40">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                <Building2 className="h-3.5 w-3.5" /> За фирми
              </div>
              <h3 className="mt-2 font-serif text-xl font-bold">Екип</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-serif text-3xl font-bold text-foreground">109 €</span>
                <span className="text-xs text-muted-foreground">/ място / год</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">мин. 3 места = 327 €/год</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">100 операции/място/мес · само годишен</p>
              <Button
                asChild
                variant="outline"
                className="mt-4 border-gold/40 text-gold hover:bg-gold/10"
              >
                <a href="/team">Създай екип</a>
              </Button>
              <div className="my-5 h-px bg-border/60" />
              <ul className="space-y-2.5">
                <Feature>100 операции / място / месец</Feature>
                <Feature>Споделени документи и шаблони</Feature>
                <Feature>Audit log</Feature>
                <Feature>Екипно фактуриране</Feature>
                <Feature>Всичко от Професионалист</Feature>
              </ul>
            </div>

            {/* 5 операции */}
            <div className="flex flex-col rounded-2xl border border-border/60 bg-gradient-card p-6 transition-colors hover:border-gold/40">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Еднократно
              </div>
              <h3 className="mt-2 font-serif text-xl font-bold">5 операции</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-serif text-3xl font-bold text-foreground">1.90 €</span>
                <span className="text-xs text-muted-foreground">/ пакет</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">без абонамент · не изтичат</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">≈ 0.38 € на операция</p>
              <Button
                onClick={() => setCheckoutPrice("five_operations")}
                variant="outline"
                className="mt-4 border-border/80"
              >
                Купи за 1.90 €
              </Button>
              <div className="my-5 h-px bg-border/60" />
              <ul className="space-y-2.5">
                {oneOffFeatures.map((f) => (<Feature key={f}>{f}</Feature>))}
                <Feature>Подходящо за инцидентна нужда</Feature>
              </ul>
            </div>
          </div>

          {/* Trust strip */}
          <div className="grid gap-4 rounded-xl border border-border/60 bg-card/30 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-xs font-semibold text-foreground">Сигурно плащане</p>
                <p className="text-[11px] text-muted-foreground">Stripe · картови данни не се съхраняват</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-xs font-semibold text-foreground">Отказ по всяко време</p>
                <p className="text-[11px] text-muted-foreground">Без скрити такси и ангажименти</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-xs font-semibold text-foreground">ДДС включено</p>
                <p className="text-[11px] text-muted-foreground">Прозрачни цени в евро · 20% ДДС</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-xs font-semibold text-foreground">EU фактуриране</p>
                <p className="text-[11px] text-muted-foreground">Шаблон на фактура за всяко плащане</p>
              </div>
            </div>
          </div>
        </>
      )}



      <Dialog open={!!checkoutPrice} onOpenChange={(o) => !o && setCheckoutPrice(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>Завършване на плащането</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            {checkoutPrice && user && (
              <StripeEmbeddedCheckout
                priceId={checkoutPrice}
                customerEmail={user.email}
                userId={user.id}
                returnUrl={returnUrl}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ SETTINGS ============================ */

export default SubscriptionTab;
