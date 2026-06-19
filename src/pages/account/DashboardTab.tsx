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
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { getUnlockedTiers, getNextTier, REWARD_TIERS } from "@/lib/rewards";
import icoPlan from "@/assets/icons/ico-plan.png";
import icoOps from "@/assets/icons/ico-ops.png";
import icoCreated from "@/assets/icons/ico-created.png";
import icoDownloaded from "@/assets/icons/ico-downloaded.png";
import icoUploaded from "@/assets/icons/ico-uploaded.png";
import icoCorrections from "@/assets/icons/ico-corrections.png";

const TileIcon = ({ src }: { src: string }) => (
  <img
    src={src}
    alt=""
    width={56}
    height={56}
    loading="lazy"
    decoding="async"
    className="h-12 w-12 object-contain drop-shadow-[0_4px_12px_rgba(212,168,76,0.45)] sm:h-14 sm:w-14"
  />
);

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

/* ============================ DASHBOARD ============================ */
function Dashboard({ quota, isPro, docs, uploadedCount, correctionsCount, analysesDates, correctionsDates, opChargeDates, hasChatAccess, onOpenChat }: { quota: Quota | null; isPro: boolean; docs: SavedDoc[]; uploadedCount: number; correctionsCount: number; analysesDates: string[]; correctionsDates: string[]; opChargeDates: string[]; hasChatAccess: boolean; onOpenChat: () => void }) {
  const navigate = useNavigate();
  const createdDocs = docs.length;
  const analysesUsed = (quota as any)?.analyses_used ?? 0;
  const contractsUsed = quota?.contracts_used ?? 0;
  const templatesUsed = quota?.templates_used ?? 0;

  // Lifetime operations: combine quota_session_charges + corrections_batch_charges,
  // fall back to the quota counters when we have no per-op history yet.
  const totalOps = useMemo(() => {
    const fromCharges = opChargeDates.length + correctionsDates.length;
    const fromQuota = contractsUsed + templatesUsed + analysesUsed + correctionsCount;
    return Math.max(fromCharges, fromQuota);
  }, [opChargeDates, correctionsDates, contractsUsed, templatesUsed, analysesUsed, correctionsCount]);

  const totalDownloads = contractsUsed + templatesUsed;
  const totalsData = useMemo(() => ([
    { name: "Създадени", value: createdDocs, fill: "hsl(var(--gold))" },
    { name: "Изтеглени", value: totalDownloads, fill: "hsl(var(--gold) / 0.9)" },
    { name: "Договори", value: contractsUsed, fill: "hsl(var(--gold) / 0.75)" },
    { name: "Бланки", value: templatesUsed, fill: "hsl(var(--gold) / 0.6)" },
    { name: "Качени", value: uploadedCount, fill: "hsl(var(--gold) / 0.45)" },
    { name: "Анализи", value: analysesUsed, fill: "hsl(var(--gold) / 0.3)" },
    { name: "Корекции", value: correctionsCount, fill: "hsl(var(--gold) / 0.2)" },
  ]), [createdDocs, totalDownloads, contractsUsed, templatesUsed, uploadedCount, analysesUsed, correctionsCount]);

  const timelineData = useMemo(() => {
    const days = 30;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets: Record<string, { date: string; label: string; created: number; analyses: number; corrections: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, label: d.toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" }), created: 0, analyses: 0, corrections: 0 };
    }
    const add = (iso: string, field: "created" | "analyses" | "corrections") => {
      const key = iso.slice(0, 10);
      if (buckets[key]) buckets[key][field] += 1;
    };
    for (const d of docs) add(d.created_at, "created");
    for (const t of analysesDates) add(t, "analyses");
    for (const t of correctionsDates) add(t, "corrections");
    return Object.values(buckets);
  }, [docs, analysesDates, correctionsDates]);

  // Operations in the last 30 days — shown as KPI badge above the activity chart.
  const last30dOps = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= cutoff;
    };
    return opChargeDates.filter(inRange).length + correctionsDates.filter(inRange).length;
  }, [opChargeDates, correctionsDates]);

  // Rewards
  const unlockedTiers = useMemo(() => getUnlockedTiers(totalOps), [totalOps]);
  const activeTier = unlockedTiers.length ? unlockedTiers[unlockedTiers.length - 1] : null;
  const nextTier = useMemo(() => getNextTier(totalOps), [totalOps]);

  const hasAnyActivity = totalsData.some((d) => d.value > 0);

  // Fire-and-forget: unlock any newly reached loyalty tiers + post in-app notification.
  // Idempotent on the server via a unique (subject, tier) ledger.
  useEffect(() => {
    if (totalOps < REWARD_TIERS[0].threshold) return;
    supabase.rpc("award_user_loyalty", { _total_ops: totalOps }).then(({ data }) => {
      const newTiers = (data as any)?.new_tiers as string[] | undefined;
      if (newTiers && newTiers.length) {
        const last = REWARD_TIERS.find((t) => t.id === newTiers[newTiers.length - 1]);
        if (last) toast.success(`Поздравления! Отключихте „${last.name}" — ${last.discountPercent}% отстъпка.`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalOps]);





  return (
    <div className="grid gap-4 md:grid-cols-3">

      <Card
        title="План"
        value={isPro ? "Предприемач" : "Безплатен"}
        icon={<TileIcon src={icoPlan} />}
        sub={
          isPro
            ? (() => {
                const start = (quota as any)?.pro_period_start ? new Date((quota as any).pro_period_start) : null;
                const reset = start ? new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
                const resetStr = reset ? reset.toLocaleDateString("bg-BG", { day: "2-digit", month: "short" }) : null;
                return `${(quota as any)?.pro_monthly_used ?? 0}/100 операции/мес${resetStr ? ` · нулиране ${resetStr}` : ""}`;
              })()
            : (() => {
                const signupAt = (quota as any)?.signup_at ? new Date((quota as any).signup_at).getTime() : null;
                const withinFirstMonth = !!signupAt && Date.now() - signupAt < 30 * 24 * 60 * 60 * 1000;
                const cap = withinFirstMonth ? 5 : 2;
                const used = (quota as any)?.monthly_total_used ?? 0;
                const resetIso = (quota as any)?.monthly_reset_at as string | null | undefined;
                const reset = resetIso ? new Date(resetIso) : null;
                const resetStr = reset ? reset.toLocaleDateString("bg-BG", { day: "2-digit", month: "short" }) : null;
                return `${used}/${cap} операции${resetStr ? ` · нулиране ${resetStr}` : ""}`;
              })()
        }
        hint="Документ · Бланка · Качване на документ за Анализ – автоматични корекции = 1 операция. Лимитът се нулира всеки месец."
        onClick={() => navigate("/account?tab=subscription")}
      />
      <Card
        title="Закупени операции"
        value={`${(quota as any)?.bonus_contracts ?? 0}`}
        icon={<TileIcon src={icoOps} />}
        sub={((quota as any)?.bonus_contracts ?? 0) > 0 ? "Налични за всеки тип · не изтичат" : "Купете пакет от 5 операции"}
        onClick={() => navigate("/account?tab=subscription&checkout=five_operations")}
      />
      <Card
        title="Създадени документи"
        value={`${createdDocs}`}
        icon={<TileIcon src={icoCreated} />}
        sub="Запазени чернови в профила"
        onClick={() => navigate("/account?tab=documents")}
      />
      <Card
        title="Свалени бланки"
        value={`${quota?.templates_used ?? 0}`}
        icon={<TileIcon src={icoDownloaded} />}
        sub="Лична история на свалените бланки"
        onClick={() => navigate("/downloads/templates")}
      />
      <Card
        title="Качени за анализ"
        value={`${uploadedCount}`}
        icon={<TileIcon src={icoUploaded} />}
        sub={`${analysesUsed} извършени анализа`}
        onClick={() => navigate("/account?tab=documents#uploaded")}
      />
      <Card
        title="Автоматични корекции"
        value={`${correctionsCount}`}
        icon={<TileIcon src={icoCorrections} />}
        sub="Приложени вълни от корекции"
      />

      {/* ---------- Workspace CTA (separated) ---------- */}
      <button
        type="button"
        onClick={() => navigate("/console")}
        className="md:col-span-3 group relative overflow-hidden rounded-2xl border border-gold/50 bg-gradient-to-br from-[hsl(220_45%_7%)] via-[hsl(220_45%_10%)] to-[hsl(220_45%_14%)] p-5 sm:p-6 text-left shadow-gold transition-all hover:shadow-2xl hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold/60"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl transition-opacity group-hover:opacity-80" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-gold/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-gold text-navy shadow-gold">
              <LayoutDashboard className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                <Sparkles className="h-3 w-3" /> Workspace
              </div>
              <h3 className="font-serif text-lg font-bold text-white sm:text-xl">
                Архитект на сделките
              </h3>
              <p className="mt-1 max-w-prose text-sm text-white/80">
                Многозадачен работен плот: табове, чернови, сделки и подписи на едно място.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-4 py-2 text-sm font-semibold text-navy shadow-md transition-transform group-hover:scale-105">
              Отвори Workspace
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </button>


      <div className="md:col-span-3 grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border/60 bg-gradient-card p-4 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h3 className="font-serif text-base sm:text-lg font-bold">Разпределение на операциите</h3>
            <span className="shrink-0 text-xs text-muted-foreground">общо</span>
          </div>
          {hasAnyActivity ? (
            <ResponsiveContainer width="100%" height={Math.max(220, totalsData.length * 36)}>
              <BarChart data={totalsData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={92}
                  tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RTooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                  {totalsData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Все още нямате извършени операции.</p>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-gradient-card p-4 sm:p-6 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-serif text-base sm:text-lg font-bold">Активност (последни 30 дни)</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold"
                title="Операции през последните 30 дни"
              >
                Този месец: <span className="font-semibold">{last30dOps}</span>
              </span>
              <span
                className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                title="Общо извършени операции от регистрацията"
              >
                Общо: <span className="font-semibold text-foreground">{totalOps}</span>
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={timelineData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradAnalyses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCorrections" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis allowDecimals={false} width={28} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <RTooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" />
              <Area type="monotone" dataKey="created" name="Създадени" stroke="hsl(var(--gold))" fill="url(#gradCreated)" strokeWidth={2} />
              <Area type="monotone" dataKey="analyses" name="Анализи" stroke="hsl(var(--primary))" fill="url(#gradAnalyses)" strokeWidth={2} />
              <Area type="monotone" dataKey="corrections" name="Корекции" stroke="hsl(var(--accent))" fill="url(#gradCorrections)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>



      {/* ---------- Loyalty rewards ---------- */}
      <div className="md:col-span-3 rounded-xl border border-gold/40 bg-gradient-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-serif text-base sm:text-lg font-bold flex items-center gap-2">
              <Crown className="h-5 w-5 text-gold" /> Награди за лоялност
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Всяка извършена операция ви приближава към следващото ниво. Активното ниво се прилага автоматично към следващия абонамент.
            </p>
          </div>
          {activeTier ? (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              Активно: {activeTier.name} · −{activeTier.discountPercent}%
            </span>
          ) : (
            <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
              Още не е отключена награда
            </span>
          )}
        </div>

        {nextTier && (
          <div className="mb-4">
            <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
              <span>До <span className="text-foreground font-medium">{nextTier.name}</span></span>
              <span>{Math.min(totalOps, nextTier.threshold)}/{nextTier.threshold}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-gradient-gold transition-all"
                style={{ width: `${Math.min(100, (totalOps / nextTier.threshold) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {REWARD_TIERS.map((t) => {
            const unlocked = totalOps >= t.threshold;
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                className={`rounded-lg border p-4 transition-all ${
                  unlocked
                    ? "border-gold/50 bg-gold/5 shadow-[0_0_0_1px_hsl(var(--gold)/0.2)]"
                    : "border-border/60 bg-card/40 opacity-70"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${unlocked ? "bg-gold/15" : "bg-muted/30"}`}>
                    <Icon className={`h-5 w-5 ${unlocked ? "text-gold" : "text-muted-foreground"}`} />
                  </div>
                  {unlocked ? (
                    <Check className="h-4 w-4 text-gold" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="font-serif text-sm font-bold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.threshold.toLocaleString("bg-BG")} операции</div>
                <div className="mt-2 text-xs">
                  <span className={unlocked ? "text-gold font-medium" : "text-muted-foreground"}>
                    −{t.discountPercent}% от абонамента
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>




      <div className="md:col-span-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="mb-3 font-serif text-lg font-bold">Последни документи</h3>

        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Все още нямате запазени документи.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {docs.slice(0, 5).map((d) => (
              <li key={d.id}>
                <Link
                  to={`/document/${d.id}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-gold"
                >
                  <span className="min-w-0 break-words">{d.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("bg-BG")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasChatAccess && (
        <div className="md:col-span-3 flex flex-col gap-3 rounded-xl border border-gold/40 bg-gradient-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15">
              <MessageSquare className="h-5 w-5 text-gold" />
            </div>
            <div>
              <div className="font-serif text-sm font-bold">DogovaryAI 24/7</div>
              <div className="text-xs text-muted-foreground">Помощ с навигация, шаблони, правни въпроси и техника.</div>
            </div>
          </div>
          <Button onClick={onOpenChat} className="bg-gradient-gold text-navy hover:shadow-gold">
            <MessageSquare className="mr-2 h-4 w-4" /> Отвори DogovaryAI
          </Button>
        </div>
      )}
    </div>
  );
}
function Card({ title, value, sub, hint, icon, onClick }: { title: string; value: string; sub?: string; hint?: string; icon: React.ReactNode; onClick?: () => void }) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`rounded-xl border border-border/60 bg-gradient-card p-5 ${
        interactive
          ? "cursor-pointer transition-all hover:border-gold/50 hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-gold/40"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{title}</span>
        {icon}
      </div>
      <div className="mt-2 font-serif text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {hint && <div className="mt-2 text-[11px] leading-snug text-muted-foreground/80 border-t border-border/40 pt-2">{hint}</div>}
    </div>
  );
}

/* ============================ CONTACTS ============================ */

export default Dashboard;
