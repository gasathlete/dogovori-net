import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut, Crown, Bird, Loader2, Plus, Trash2, Star, Download, ArrowLeft, X, MessageSquare, Check, Lock, RefreshCw, Sparkles, Building2, Bell,
} from "lucide-react";
import { NotificationsTab } from "@/components/NotificationsTab";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { FloatingAssistant } from "@/components/FloatingAssistant";
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
type Quota = { contracts_used: number; templates_used: number; plan: "free" | "pro"; pro_until: string | null; analyses_used?: number; total_used?: number; monthly_total_used?: number; bonus_contracts?: number; pro_monthly_used?: number };
type UploadedContract = {
  id: string; title: string; source: "pdf" | "docx" | "paste";
  folder_id: string | null; contact_id: string | null;
  original_filename: string | null; storage_path: string | null;
  created_at: string;
};
type RiskAnalysisLite = { uploaded_contract_id: string; score: number; contract_type: string; created_at: string };

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const initialTab = params.get("tab") ?? "dashboard";
  const activeContact = params.get("contact");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [uploaded, setUploaded] = useState<UploadedContract[]>([]);
  const [analysesByContract, setAnalysesByContract] = useState<Record<string, RiskAnalysisLite>>({});
  const [quota, setQuota] = useState<Quota | null>(null);
  const [correctionsCount, setCorrectionsCount] = useState<number>(0);
  const [profile, setProfile] = useState<{ display_name: string | null; company: string | null; vat_number: string | null }>({ display_name: "", company: "", vat_number: "" });
  const [activeFolder, setActiveFolder] = useState<string | "all">("all");
  const [isStaff, setIsStaff] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { team: teamForChat } = useTeam();
  const { count: unreadCount } = useUnreadNotifications();



  useEffect(() => {
    if (!user) { setIsStaff(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setIsStaff(Boolean(data)));
  }, [user]);

  const [analysesDates, setAnalysesDates] = useState<string[]>([]);
  const [correctionsDates, setCorrectionsDates] = useState<string[]>([]);
  const [opChargeDates, setOpChargeDates] = useState<string[]>([]);

  const reload = async () => {
    if (!user) return;
    const [c, f, d, q, p, uc, ra, cb, cbAll, qsc] = await Promise.all([
      supabase.from("contacts").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("folders").select("*").order("is_favorites", { ascending: false }),
      supabase.from("saved_documents").select("*").order("created_at", { ascending: false }),
      supabase.from("download_quota").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name, company, vat_number").eq("id", user.id).maybeSingle(),
      supabase.from("uploaded_contracts").select("id,title,source,folder_id,contact_id,original_filename,storage_path,created_at").order("created_at", { ascending: false }),
      supabase.from("risk_analyses").select("uploaded_contract_id,score,contract_type,created_at").order("created_at", { ascending: false }),
      supabase.from("corrections_batch_charges").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("corrections_batch_charges").select("created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(5000),
      supabase.from("quota_session_charges").select("created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(5000),
    ]);
    setContacts((c.data as any) ?? []);
    setFolders((f.data as any) ?? []);
    setDocs((d.data as any) ?? []);
    setQuota((q.data as any) ?? null);
    if (p.data) setProfile(p.data as any);
    setUploaded((uc.data as any) ?? []);
    setCorrectionsCount((cb as any)?.count ?? 0);
    setAnalysesDates(((ra.data as any) ?? []).map((r: any) => r.created_at));
    setCorrectionsDates(((cbAll.data as any) ?? []).map((r: any) => r.created_at));
    setOpChargeDates(((qsc.data as any) ?? []).map((r: any) => r.created_at));
    const map: Record<string, RiskAnalysisLite> = {};
    for (const r of ((ra.data as any) ?? []) as RiskAnalysisLite[]) {
      if (!map[r.uploaded_contract_id]) map[r.uploaded_contract_id] = r;
    }
    setAnalysesByContract(map);

  };


  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user]);

  const filteredDocs = useMemo(() => {
    let out = docs;
    if (activeContact) out = out.filter((d) => d.contact_id === activeContact);
    if (activeFolder !== "all") out = out.filter((d) => d.folder_id === activeFolder);
    return out;
  }, [docs, activeFolder, activeContact]);

  const isPro = quota?.plan === "pro" || (quota?.pro_until && new Date(quota.pro_until) > new Date());

  const openContactDocs = (id: string) => {
    setParams({ tab: "documents", contact: id });
  };
  const clearContactFilter = () => {
    const next = new URLSearchParams(params);
    next.delete("contact");
    next.set("tab", "documents");
    setParams(next);
  };
  const onTabChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    if (v !== "documents") next.delete("contact");
    setParams(next);
  };

  const activeContactName = contacts.find((c) => c.id === activeContact)?.name;

  return (
    <div className="min-h-screen">
      <Seo
        title="Моят профил — Dogovori.net"
        description="Управлявайте профила, абонамента, документите и екипа си в Dogovori.net."
        canonical="/account"
        noindex
      />
      <Header />
      <main className="container py-6 md:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
              <ArrowLeft className="h-3 w-3" /> Към началото
            </Link>
            <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Моят профил</h1>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="border-gold/60 text-gold hover:bg-gold/10">
              <Link to="/team"><Users className="mr-2 h-4 w-4" /> Екип</Link>
            </Button>
            {isStaff && (
              <Button asChild variant="outline" size="sm" className="border-gold/60 text-gold hover:bg-gold/10">
                <Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" /> Модераторски панел</Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTabChange("notifications")}
              aria-label={unreadCount > 0 ? `Известия (${unreadCount} непрочетени)` : "Известия"}
              title="Известия"
              className="relative h-9 w-9 border-gold/60 p-0 text-gold hover:bg-gold/10"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-background"
                />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={signOut} className="border-border/60">
              <LogOut className="mr-2 h-4 w-4" /> Изход
            </Button>
          </div>
        </div>


        <Tabs value={initialTab} onValueChange={onTabChange} className="space-y-6">
          <ScrollableTabsList>
            <TabsTrigger value="dashboard" className="shrink-0 whitespace-nowrap"><Bird className="mr-1 h-3.5 w-3.5" />Табло</TabsTrigger>
            <TabsTrigger value="documents" className="shrink-0 whitespace-nowrap"><FileText className="mr-1 h-3.5 w-3.5" />Документи</TabsTrigger>
            <TabsTrigger value="folders" className="shrink-0 whitespace-nowrap"><FolderOpen className="mr-1 h-3.5 w-3.5" />Папки</TabsTrigger>
            <TabsTrigger value="contacts" className="shrink-0 whitespace-nowrap"><Users className="mr-1 h-3.5 w-3.5" />Контрагенти</TabsTrigger>
            <TabsTrigger value="signed" className="shrink-0 whitespace-nowrap"><PenTool className="mr-1 h-3.5 w-3.5" />Подписани</TabsTrigger>
            <TabsTrigger value="subscription" className="shrink-0 whitespace-nowrap"><CreditCard className="mr-1 h-3.5 w-3.5" />Абонамент</TabsTrigger>
            <TabsTrigger value="settings" className="shrink-0 whitespace-nowrap"><SettingsIcon className="mr-1 h-3.5 w-3.5" />Настройки</TabsTrigger>
          </ScrollableTabsList>


          <TabsContent value="dashboard">
            <Dashboard quota={quota} isPro={!!isPro} docs={docs} uploadedCount={uploaded.length} correctionsCount={correctionsCount} analysesDates={analysesDates} correctionsDates={correctionsDates} opChargeDates={opChargeDates} hasChatAccess={!!isPro || (!!teamForChat && teamForChat.status === "active")} onOpenChat={() => setChatOpen(true)} />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>
          <TabsContent value="contacts">
            <ContactsTab contacts={contacts} docs={docs} reload={reload} onOpenDocs={openContactDocs} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab
              docs={filteredDocs}
              folders={folders}
              contacts={contacts}
              activeFolder={activeFolder}
              setActiveFolder={setActiveFolder}
              activeContactName={activeContactName}
              clearContactFilter={clearContactFilter}
              reload={reload}
              uploaded={uploaded}
              analysesByContract={analysesByContract}
            />
          </TabsContent>
          <TabsContent value="folders">
            <FoldersTab folders={folders} docs={docs} uploaded={uploaded} reload={reload} onOpenTab={(t) => onTabChange(t)} setActiveFolder={setActiveFolder} />
          </TabsContent>
          <TabsContent value="signed">
            <SignedContractsTab userId={user?.id ?? ""} />
          </TabsContent>
          <TabsContent value="subscription">
            <SubscriptionTab quota={quota} isPro={!!isPro} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab profile={profile} setProfile={setProfile} userId={user?.id ?? ""} />
          </TabsContent>
        </Tabs>
      </main>
      {(!!isPro || (teamForChat && teamForChat.status === "active")) && (
        <FloatingAssistant open={chatOpen} onOpenChange={setChatOpen} />
      )}
    </div>
  );
}


/* ====================== SCROLLABLE TABS LIST ====================== */
function ScrollableTabsList({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(false);
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setShowHint(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="relative md:static">
      <TabsList
        ref={ref as any}
        onScroll={update}
        className="-mx-4 flex w-auto justify-start gap-1 overflow-x-auto bg-card/40 p-1 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:w-full md:flex-wrap md:overflow-visible md:px-1"
      >
        {children}
      </TabsList>
      {showHint && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1 md:hidden"
        >
          <div className="h-full w-10 bg-gradient-to-l from-background via-background/80 to-transparent" />
          <div className="-ml-7 flex h-7 w-7 items-center justify-center rounded-full border border-gold/40 bg-card/90 text-gold shadow-md animate-pulse">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      )}
    </div>
  );
}

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

  const totalsData = useMemo(() => ([
    { name: "Създадени", value: createdDocs, fill: "hsl(var(--gold))" },
    { name: "Договори", value: contractsUsed, fill: "hsl(var(--gold) / 0.85)" },
    { name: "Бланки", value: templatesUsed, fill: "hsl(var(--gold) / 0.7)" },
    { name: "Качени", value: uploadedCount, fill: "hsl(var(--gold) / 0.55)" },
    { name: "Анализи", value: analysesUsed, fill: "hsl(var(--gold) / 0.4)" },
    { name: "Корекции", value: correctionsCount, fill: "hsl(var(--gold) / 0.25)" },
  ]), [createdDocs, contractsUsed, templatesUsed, uploadedCount, analysesUsed, correctionsCount]);

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

  // All-time cumulative operations chart — monthly buckets so it scales
  // gracefully from a brand-new account up to power users.
  const allTimeData = useMemo(() => {
    const ops = [...opChargeDates, ...correctionsDates]
      .map((t) => new Date(t))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (ops.length === 0) return [] as { label: string; ops: number; cumulative: number }[];
    const first = new Date(ops[0]); first.setDate(1); first.setHours(0, 0, 0, 0);
    const now = new Date(); now.setDate(1); now.setHours(0, 0, 0, 0);
    const buckets: { key: string; label: string; ops: number; cumulative: number }[] = [];
    const cursor = new Date(first);
    while (cursor <= now) {
      buckets.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: cursor.toLocaleDateString("bg-BG", { month: "short", year: "2-digit" }),
        ops: 0, cumulative: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const d of ops) {
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const i = idx.get(k);
      if (i != null) buckets[i].ops += 1;
    }
    let acc = 0;
    for (const b of buckets) { acc += b.ops; b.cumulative = acc; }
    return buckets;
  }, [opChargeDates, correctionsDates]);

  // Rewards
  const unlockedTiers = useMemo(() => getUnlockedTiers(totalOps), [totalOps]);
  const activeTier = unlockedTiers.length ? unlockedTiers[unlockedTiers.length - 1] : null;
  const nextTier = useMemo(() => getNextTier(totalOps), [totalOps]);

  const hasAnyActivity = totalsData.some((d) => d.value > 0);



  return (
    <div className="grid gap-4 md:grid-cols-3">

      <Card
        title="План"
        value={isPro ? "Предприемач" : "Безплатен"}
        icon={<Crown className="h-5 w-5 text-gold" />}
        sub={
          isPro
            ? `${(quota as any)?.pro_monthly_used ?? 0}/100 операции/мес`
            : `${(quota as any)?.total_used ?? 0}/6 общо · ${(quota as any)?.monthly_total_used ?? 0}/2 този месец`
        }
        hint="Документ · Бланка · Качване на документ за Анализ – автоматични корекции = 1 операция"
        onClick={() => navigate("/account?tab=subscription")}
      />
      <Card
        title="Закупени операции"
        value={`${(quota as any)?.bonus_contracts ?? 0}`}
        icon={<Crown className="h-5 w-5 text-gold" />}
        sub={((quota as any)?.bonus_contracts ?? 0) > 0 ? "Налични за всеки тип · не изтичат" : "Купете пакет от 5 операции"}
        onClick={() => navigate("/account?tab=subscription&checkout=five_operations")}
      />
      <Card
        title="Създадени документи"
        value={`${createdDocs}`}
        icon={<Sparkles className="h-5 w-5 text-gold" />}
        sub="Запазени чернови в профила"
        onClick={() => navigate("/account?tab=documents")}
      />
      <Card
        title="Свалени договори"
        value={`${quota?.contracts_used ?? 0}`}
        icon={<FileText className="h-5 w-5 text-gold" />}
        onClick={() => navigate("/downloads/contracts")}
      />
      <Card
        title="Свалени бланки"
        value={`${quota?.templates_used ?? 0}`}
        icon={<FileText className="h-5 w-5 text-gold" />}
        onClick={() => navigate("/downloads/templates")}
      />
      <Card
        title="Качени за анализ"
        value={`${uploadedCount}`}
        icon={<ShieldCheck className="h-5 w-5 text-gold" />}
        sub={`${analysesUsed} извършени анализа`}
        onClick={() => navigate("/account?tab=uploaded")}
      />
      <Card
        title="Автоматични корекции"
        value={`${correctionsCount}`}
        icon={<RefreshCw className="h-5 w-5 text-gold" />}
        sub="Приложени вълни от корекции"
        onClick={() => navigate("/account?tab=uploaded")}
      />


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
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h3 className="font-serif text-base sm:text-lg font-bold">Активност (последни 30 дни)</h3>
            <span className="shrink-0 text-xs text-muted-foreground">по дни</span>
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

      {/* ---------- All-time operations chart ---------- */}
      <div className="md:col-span-3 rounded-xl border border-border/60 bg-gradient-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-base sm:text-lg font-bold">All-time извършени операции</h3>
          <span className="text-xs text-muted-foreground">общо: <span className="text-foreground font-semibold">{totalOps}</span></span>
        </div>
        {allTimeData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Все още нямате извършени операции. Започнете с първия документ.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={allTimeData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="gradCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={32} />
              <YAxis allowDecimals={false} width={36} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" />
              {REWARD_TIERS.map((t) => (
                <ReferenceLine
                  key={t.id}
                  y={t.threshold}
                  stroke={`hsl(var(--${t.accent}) / 0.6)`}
                  strokeDasharray="4 4"
                  label={{ value: `${t.threshold}`, position: "right", fill: `hsl(var(--${t.accent}))`, fontSize: 10 }}
                />
              ))}
              <Line type="monotone" dataKey="cumulative" name="Кумулативно" stroke="hsl(var(--gold))" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="ops" name="На месец" stroke="hsl(var(--primary))" fill="url(#gradCumulative)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
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
              <div className="font-serif text-sm font-bold">Чат поддръжка 24/7</div>
              <div className="text-xs text-muted-foreground">Помощ с навигация, шаблони, правни въпроси и техника.</div>
            </div>
          </div>
          <Button onClick={onOpenChat} className="bg-gradient-gold text-navy hover:shadow-gold">
            <MessageSquare className="mr-2 h-4 w-4" /> Чат поддръжка
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
function ContactsTab({ contacts, docs, reload, onOpenDocs }: {
  contacts: Contact[]; docs: SavedDoc[]; reload: () => void; onOpenDocs: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const navigate = useNavigate();

  const remove = async (id: string) => {
    if (!confirm("Изтриване на контрагента?")) return;
    const { error } = await supabase.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Изтрит"); reload(); }
  };

  const docsCount = (id: string) => docs.filter((d) => d.contact_id === id).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-navy hover:shadow-gold"><Plus className="mr-1 h-4 w-4" />Нов контрагент</Button>
          </DialogTrigger>
          <ContactDialog editing={editing} onClose={() => { setOpen(false); setEditing(null); reload(); }} />
        </Dialog>
      </div>
      {contacts.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
          Нямате добавени контрагенти.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-gradient-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Име</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">ЕГН/ЕИК</th>
                <th className="px-4 py-3">Контакт</th>
                <th className="px-4 py-3">Договори</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const n = docsCount(c.id);
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/contact/${c.id}`)}
                    className="cursor-pointer border-b border-border/40 last:border-0 transition-colors hover:bg-gold/[0.06]"
                  >
                    <td className="px-4 py-3 font-medium text-gold/90 hover:text-gold">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.type === "individual" ? "Физ. лице" : "Юр. лице"}</td>
                    <td className="px-4 py-3 text-xs">{c.egn || c.eik || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.email || c.phone || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                        <FileText className="h-3 w-3" /> {n}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>Редактирай</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContactDialog({ editing, onClose }: { editing: Contact | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Contact>>(editing ?? { type: "individual" });
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // Валидация на ЕГН/ЕИК преди запис
    if (form.type === "individual" && form.egn) {
      if (!isValidEGN(String(form.egn).trim())) {
        toast.error("Невалидно ЕГН", { description: "Моля, проверете 10-те цифри и контролната сума." });
        return;
      }
    }
    if (form.type === "legal" && form.eik) {
      if (!isValidEIK(String(form.eik).trim())) {
        toast.error("Невалиден ЕИК", { description: "ЕИК трябва да е 9 или 13 цифри с валидна контролна сума." });
        return;
      }
    }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const payload = { ...form, user_id: user.id } as any;
    const { error } = editing
      ? await supabase.from("contacts").update(payload).eq("id", editing.id)
      : await supabase.from("contacts").insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(editing ? "Запазен" : "Добавен"); onClose(); }
  };

  const upd = (k: keyof Contact, v: any) => setForm((s) => ({ ...s, [k]: v }));

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Редактиране" : "Нов контрагент"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label>Тип</Label>
          <Select value={form.type ?? "individual"} onValueChange={(v) => upd("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Физическо лице</SelectItem>
              <SelectItem value="legal">Юридическо лице</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Име {form.type === "legal" ? "/ Фирма" : ""}</Label>
          <Input required value={form.name ?? ""} onChange={(e) => upd("name", e.target.value)} />
        </div>
        {form.type === "individual" ? (
          <div>
            <Label>ЕГН</Label>
            <Input maxLength={10} value={form.egn ?? ""} onChange={(e) => upd("egn", e.target.value)} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ЕИК</Label><Input value={form.eik ?? ""} onChange={(e) => upd("eik", e.target.value)} /></div>
              <div><Label>ДДС №</Label><Input value={form.vat_number ?? ""} onChange={(e) => upd("vat_number", e.target.value)} /></div>
            </div>
            <div><Label>МОЛ</Label><Input value={form.mol ?? ""} onChange={(e) => upd("mol", e.target.value)} /></div>
          </>
        )}
        <div><Label>Адрес</Label><Input value={form.address ?? ""} onChange={(e) => upd("address", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => upd("email", e.target.value)} /></div>
          <div><Label>Телефон</Label><Input value={form.phone ?? ""} onChange={(e) => upd("phone", e.target.value)} /></div>
        </div>
        <div><Label>Бележки</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => upd("notes", e.target.value)} /></div>
        <DialogFooter>
          <Button type="submit" disabled={busy} className="bg-gradient-gold text-navy">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Запази
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ============================ DOCUMENTS ============================ */
function DocumentsTab({
  docs, folders, contacts, activeFolder, setActiveFolder, activeContactName, clearContactFilter, reload,
  uploaded, analysesByContract,
}: {
  docs: SavedDoc[]; folders: Folder[]; contacts: Contact[];
  activeFolder: string | "all"; setActiveFolder: (v: string | "all") => void;
  activeContactName?: string; clearContactFilter: () => void;
  reload: () => void;
  uploaded: UploadedContract[];
  analysesByContract: Record<string, RiskAnalysisLite>;
}) {
  const contactName = (id: string | null) => contacts.find((c) => c.id === id)?.name;
  const [busy, setBusy] = useState<string | null>(null);

  // Bundle children: map parent_saved_id → [{ref_label, child_saved_id, child_uploaded_id}]
  type LinkRow = {
    parent_saved_id: string | null;
    parent_uploaded_id: string | null;
    child_saved_id: string | null;
    child_uploaded_id: string | null;
    ref_label: string;
    ref_type: string;
    version: number;
  };
  const [links, setLinks] = useState<LinkRow[]>([]);
  useEffect(() => {
    supabase
      .from("document_links")
      .select("parent_saved_id,parent_uploaded_id,child_saved_id,child_uploaded_id,ref_label,ref_type,version")
      .is("superseded_by", null)
      .then(({ data }) => setLinks(((data as any) ?? []) as LinkRow[]));
  }, [docs, uploaded]);

  const childrenOfSaved = (parentId: string) =>
    links.filter((l) => l.parent_saved_id === parentId);
  const childTitle = (l: LinkRow): string => {
    if (l.child_saved_id) {
      const d = docs.find((x) => x.id === l.child_saved_id);
      if (d) return d.title;
    }
    if (l.child_uploaded_id) {
      const u = uploaded.find((x) => x.id === l.child_uploaded_id);
      if (u) return u.title;
    }
    return l.ref_label;
  };
  const childHref = (l: LinkRow): string | null => {
    if (l.child_saved_id) return `/document/${l.child_saved_id}`;
    if (l.child_uploaded_id) return `/uploaded/${l.child_uploaded_id}`;
    return null;
  };

  // Hide children from the top-level list (they belong to a bundle).
  const childSavedIds = new Set(
    links.filter((l) => l.child_saved_id).map((l) => l.child_saved_id as string)
  );
  const topLevelDocs = docs.filter((d) => !childSavedIds.has(d.id));

  const redownload = async (d: SavedDoc, format: "pdf" | "docx") => {
    setBusy(d.id + format);
    const res = await downloadDocument({
      kind: d.kind, format, title: d.title, payload: d.payload, saved_document_id: d.id,
    });
    setBusy(null);
    if (!res.ok) toast.error("Грешка", { description: res.error });
    else toast.success("Изтеглен (безплатно)");
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване?")) return;
    const { error } = await supabase.from("saved_documents").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Изтрит"); reload(); }
  };

  const move = async (id: string, folder_id: string | null) => {
    const { error } = await supabase.from("saved_documents").update({ folder_id }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Преместен"); reload(); }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-1 rounded-xl border border-border/60 bg-gradient-card p-3">
        <button onClick={() => setActiveFolder("all")}
          className={`w-full rounded-md px-3 py-2 text-left text-sm ${activeFolder === "all" ? "bg-gold/10 text-gold" : "hover:bg-card/60"}`}>
          Всички ({docs.length})
        </button>
        {folders.map((f) => (
          <button key={f.id} onClick={() => setActiveFolder(f.id)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${activeFolder === f.id ? "bg-gold/10 text-gold" : "hover:bg-card/60"}`}>
            {f.is_favorites ? <Star className="h-3.5 w-3.5 fill-gold text-gold" /> : <FolderOpen className="h-3.5 w-3.5" />}
            {f.name}
          </button>
        ))}
      </aside>
      <div className="space-y-8">
        {/* ===== Uploaded contracts (own files with AI risk analysis) ===== */}
        <section>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-bold">Качени договори</h3>
              <p className="mt-1 text-xs text-muted-foreground">Качете свой договор (PDF, DOCX или текст) — Системата ще извърши пълен правен риск-анализ.</p>
            </div>
            <div className="shrink-0">
              <UploadContractDialog
                folders={folders}
                contacts={contacts}
                onUploaded={reload}
              />
            </div>
          </div>

          {uploaded.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gold/30 bg-gradient-card p-8 text-center">
              <ShieldCheck className="mx-auto h-7 w-7 text-gold" />
              <p className="mt-2 text-sm text-muted-foreground">
                Все още нямате качени договори. Натиснете <strong className="text-gold">„Добави договор"</strong> за безплатен AI анализ.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {uploaded.map((u) => {
                const a = analysesByContract[u.id];
                const score = a?.score;
                const sevCls = score == null ? "border-border/40 text-muted-foreground"
                  : score >= 8 ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
                  : score >= 5 ? "border-amber-300/40 text-amber-200 bg-amber-300/10"
                  : "border-red-400/40 text-red-300 bg-red-400/10";
                const Icon = score == null ? AlertTriangle : score >= 8 ? ShieldCheck : score >= 5 ? AlertTriangle : ShieldAlert;
                return (
                  <div
                    key={u.id}
                    className="rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <Link to={`/uploaded/${u.id}`} className="min-w-0 flex-1">
                        <div className="break-words font-serif text-base font-bold">{u.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {u.source.toUpperCase()} · качен {new Date(u.created_at).toLocaleDateString("bg-BG")}
                          {a?.contract_type && <> · {a.contract_type}</>}
                          {contactName(u.contact_id) && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                              <Users className="h-3 w-3" /> {contactName(u.contact_id)}
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs ${sevCls}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {score != null ? <><strong>{score}</strong>/10</> : "Без анализ"}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <ShareForSignDialog uploadedContractId={u.id} documentTitle={u.title} />
                      <Select
                        value={u.folder_id ?? "none"}
                        onValueChange={async (v) => {
                          const { error } = await supabase
                            .from("uploaded_contracts")
                            .update({ folder_id: v === "none" ? null : v })
                            .eq("id", u.id);
                          if (error) toast.error(error.message);
                          else { toast.success("Преместен"); reload(); }
                        }}
                      >
                        <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Папка" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Без папка —</SelectItem>
                          {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== Generated documents (existing) ===== */}
        <section>
          <h3 className="mb-3 font-serif text-lg font-bold">Създадени документи</h3>
          {activeContactName && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold">
              <Users className="h-3.5 w-3.5" />
              Договори с: <strong>{activeContactName}</strong>
              <button
                onClick={clearContactFilter}
                className="ml-1 rounded-full p-0.5 hover:bg-gold/20"
                aria-label="Изчисти филтъра"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {topLevelDocs.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
              {activeContactName ? "Няма договори за този контрагент." : "Тази папка е празна."}
            </div>
          ) : (
            <div className="grid gap-3">
              {topLevelDocs.map((d) => {
                const childLinks = childrenOfSaved(d.id);
                const isBundle = childLinks.length > 0;
                return (
                <Link
                  key={d.id}
                  to={`/document/${d.id}`}
                  className="block rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-serif text-base font-bold transition-colors group-hover:text-gold">{d.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {d.kind === "contract" ? "Договор" : "Бланка"} · {new Date(d.created_at).toLocaleDateString("bg-BG")}
                        {isBundle && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                            Комплект · {childLinks.length + 1} док.
                          </span>
                        )}
                        {contactName(d.contact_id) && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                            <Users className="h-3 w-3" /> {contactName(d.contact_id)}
                          </span>
                        )}
                      </div>
                      {isBundle && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={(e) => e.preventDefault()}>
                          {childLinks.map((l, idx) => {
                            const href = childHref(l);
                            const label = childTitle(l);
                            const chip = (
                              <span className="inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/5 px-2 py-1 text-[11px] text-foreground hover:border-gold/60 hover:text-gold">
                                <FileText className="h-3 w-3 text-gold/70" />
                                <span className="max-w-[180px] truncate">{label}</span>
                              </span>
                            );
                            return href ? (
                              <Link key={idx} to={href}>{chip}</Link>
                            ) : (
                              <span key={idx}>{chip}</span>
                            );
                          })}
                          <span className="text-[11px] italic text-muted-foreground">
                            прикачват се автоматично към PDF
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      onClick={(e) => e.preventDefault()}
                    >
                      <Button size="sm" variant="outline" className="h-9" disabled={busy === d.id + "pdf"} onClick={() => redownload(d, "pdf")}>
                        {busy === d.id + "pdf" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} PDF
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" disabled={busy === d.id + "docx"} onClick={() => redownload(d, "docx")}>
                        {busy === d.id + "docx" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} DOCX
                      </Button>
                      {d.kind === "contract" && <ShareForSignDialog documentId={d.id} documentTitle={d.title} />}
                      <Select value={d.folder_id ?? "none"} onValueChange={(v) => move(d.id, v === "none" ? null : v)}>
                        <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Папка" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Без папка —</SelectItem>
                          {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive" onClick={() => remove(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Link>
              );})}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================ FOLDERS ============================ */
function FoldersTab({
  folders, docs, uploaded, reload, onOpenTab, setActiveFolder,
}: {
  folders: Folder[]; docs: SavedDoc[]; uploaded: UploadedContract[];
  reload: () => void; onOpenTab: (tab: string) => void; setActiveFolder: (id: string | "all") => void;
}) {
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const create = async () => {
    if (!name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("folders").insert({ name: name.trim(), user_id: user.id });
    if (error) toast.error(error.message); else { toast.success("Създадена"); setName(""); reload(); }
  };
  const remove = async (f: Folder) => {
    if (f.is_favorites) return;
    if (!confirm(`Изтриване на „${f.name}"? Документите ще останат без папка.`)) return;
    const { error } = await supabase.from("folders").delete().eq("id", f.id);
    if (error) toast.error(error.message); else { toast.success("Изтрита"); reload(); }
  };
  const openInDocs = (folderId: string) => {
    setActiveFolder(folderId);
    onOpenTab("documents");
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Име на нова папка…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={create} className="bg-gradient-gold text-navy"><Plus className="mr-1 h-4 w-4" />Създай</Button>
      </div>
      <div className="grid gap-2">
        {folders.map((f) => {
          const folderDocs = docs.filter((d) => d.folder_id === f.id);
          const folderUploaded = uploaded.filter((u) => u.folder_id === f.id);
          const total = folderDocs.length + folderUploaded.length;
          const isOpen = !!expanded[f.id];
          return (
            <div key={f.id} className="rounded-md border border-border/60 bg-gradient-card">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [f.id]: !p[f.id] }))}
                  className="flex flex-1 items-center gap-2 text-left text-sm hover:text-gold"
                >
                  <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                  {f.is_favorites ? <Star className="h-4 w-4 fill-gold text-gold" /> : <FolderOpen className="h-4 w-4 text-gold" />}
                  <span>{f.name}</span>
                  <span className="text-xs text-muted-foreground">({total})</span>
                  {f.is_favorites && <span className="text-xs text-muted-foreground">(защитена)</span>}
                </button>
                {!f.is_favorites && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(f)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {isOpen && (
                <div className="border-t border-border/60 px-4 py-3">
                  {total === 0 ? (
                    <p className="text-xs text-muted-foreground">Няма документи в тази папка.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {folderDocs.map((d) => (
                        <li key={`d-${d.id}`} className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-gold/70" />
                          <Link to={`/document/${d.id}`} className="truncate hover:text-gold">{d.title}</Link>
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                            {d.kind === "contract" ? "договор" : "бланка"}
                          </span>
                        </li>
                      ))}
                      {folderUploaded.map((u) => (
                        <li key={`u-${u.id}`} className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-gold/70" />
                          <Link to={`/uploaded/${u.id}`} className="truncate hover:text-gold">{u.title}</Link>
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">качен</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3">
                    <Button size="sm" variant="outline" className="border-gold/40 text-gold" onClick={() => openInDocs(f.id)}>
                      Отвори в Документи
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ SUBSCRIPTION ============================ */
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
  pro_monthly: { name: "Предприемач — месечен", price: "9.90 €", cycle: "месечно" },
  pro_yearly: { name: "Предприемач — годишен", price: "99 €", cycle: "годишно" },
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
    const allowed = ["pro_monthly", "pro_yearly", "five_operations"];
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
    "До 100 операции на месец (договори, бланки и интелигентни анализи)",
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
                : `6 операции общо при регистрация, после 2 на месец. Документите се свалят с дискретен воден знак. Използвани: ${(quota as any)?.total_used ?? 0} от 6 общо · ${(quota as any)?.monthly_total_used ?? 0} от 2 този месец.`}
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
          </div>

          {/* Pricing grid */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Monthly — featured center */}
            <div className="relative flex flex-col rounded-2xl border-2 border-gold bg-gradient-card p-7 shadow-gold lg:order-2 lg:scale-[1.02]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-gold px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-navy shadow-soft">
                Най-популярен
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                <Crown className="h-3.5 w-3.5" /> Предприемач
              </div>
              <h3 className="mt-2 font-serif text-2xl font-bold">Месечен план</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-bold text-foreground">9.90 €</span>
                <span className="text-sm text-muted-foreground line-through">29.90 €</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">на месец · ДДС вкл. · отказ по всяко време</p>
              <p className="mt-1 text-[11px] font-medium text-gold/90" title="9.90 € ÷ 100 операции / месец">≈ 0.099 € на операция · 100 оп. на всеки 30 дни</p>
              <Button
                onClick={() => setCheckoutPrice("pro_monthly")}
                className="mt-5 bg-gradient-gold text-navy hover:shadow-gold"
              >
                Премини на Предприемач
              </Button>
              <div className="my-6 h-px bg-gold/15" />
              <ul className="space-y-2.5">
                {proFeatures.map((f) => (<Feature key={f}>{f}</Feature>))}
              </ul>
            </div>

            {/* Team monthly */}
            <div className="relative flex flex-col rounded-2xl border border-border/60 bg-gradient-card p-7 transition-colors hover:border-gold/40 lg:order-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                <Building2 className="h-3.5 w-3.5" /> За фирми и екипи
              </div>
              <h3 className="mt-2 font-serif text-2xl font-bold">План Екип</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-bold text-foreground">7.90 €</span>
                <span className="text-sm text-muted-foreground">/ място</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">мин. 3 места (23.70 €/мес) · 100 оп./място/мес</p>
              <p className="mt-1 text-[11px] font-medium text-gold/90" title="7.90 € ÷ 100 операции / място / месец">≈ 0.079 € на операция · 100 оп./място на всеки 30 дни</p>
              <Button
                asChild
                variant="outline"
                className="mt-5 border-gold/40 text-gold hover:bg-gold/10"
              >
                <a href="/team">Създай екип</a>
              </Button>
              <div className="my-6 h-px bg-border/60" />
              <ul className="space-y-2.5">
                {teamFeatures.map((f) => (<Feature key={f}>{f}</Feature>))}
              </ul>
            </div>

            {/* 5 operations */}
            <div className="flex flex-col rounded-2xl border border-border/60 bg-gradient-card p-7 transition-colors hover:border-gold/40 lg:order-1">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Еднократно
              </div>
              <h3 className="mt-2 font-serif text-2xl font-bold">5 операции</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-bold text-foreground">1.90 €</span>
                <span className="text-sm text-muted-foreground">/ пакет</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">без абонамент · операциите не изтичат</p>
              <p className="mt-1 text-[11px] font-medium text-gold/90" title="1.90 € ÷ 5 операции">≈ 0.38 € на операция · 5 операции в пакета</p>
              <Button
                onClick={() => setCheckoutPrice("five_operations")}
                variant="outline"
                className="mt-5 border-border/80"
              >
                Купи за 1.90 €
              </Button>
              <div className="my-6 h-px bg-border/60" />
              <ul className="space-y-2.5">
                {oneOffFeatures.map((f) => (<Feature key={f}>{f}</Feature>))}
                <Feature>Подходящо за инцидентна нужда</Feature>
              </ul>
            </div>
          </div>

          {/* Yearly plans */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Yearly Pro */}
            <div className="relative flex flex-col rounded-2xl border border-border/60 bg-gradient-card p-7 transition-colors hover:border-gold/40">
              <div className="absolute -top-3 right-5 rounded-full border border-gold/40 bg-navy px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold">
                −17%
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Crown className="h-3.5 w-3.5" /> Предприемач
              </div>
              <h3 className="mt-2 font-serif text-2xl font-bold">Годишен Предприемач</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-bold text-foreground">99 €</span>
                <span className="text-sm text-muted-foreground line-through">118.80 €</span>
              </div>
              <p className="mt-1 text-xs text-gold">≈ 8.25 €/месец · 2 безплатни месеца</p>
              <p className="mt-1 text-[11px] font-medium text-gold/90" title="99 € ÷ (100 × 12) операции / година">≈ 0.0825 € на операция · 1200 оп./година</p>
              <Button
                onClick={() => setCheckoutPrice("pro_yearly")}
                variant="outline"
                className="mt-5 border-gold/40 text-gold hover:bg-gold/10"
              >
                Купи Годишен Предприемач
              </Button>
              <div className="my-6 h-px bg-border/60" />
              <ul className="space-y-2.5">
                {proFeatures.map((f) => (<Feature key={f}>{f}</Feature>))}
                <Feature>2 безплатни месеца спрямо месечния</Feature>
              </ul>
            </div>

            {/* Yearly Team */}
            <div className="relative flex flex-col rounded-2xl border border-border/60 bg-gradient-card p-7 transition-colors hover:border-gold/40">
              <div className="absolute -top-3 right-5 rounded-full border border-gold/40 bg-navy px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold">
                −17%
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                <Building2 className="h-3.5 w-3.5" /> За фирми и екипи
              </div>
              <h3 className="mt-2 font-serif text-2xl font-bold">Годишен Екип</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-bold text-foreground">79 €</span>
                <span className="text-sm text-muted-foreground">/ място / година</span>
              </div>
              <p className="mt-1 text-xs text-gold">≈ 6.58 €/месец · мин. 3 места (237 €/год)</p>
              <p className="mt-1 text-[11px] font-medium text-gold/90" title="79 € ÷ (100 × 12) операции / място / година">≈ 0.0658 € на операция · 1200 оп./място/година</p>
              <Button
                asChild
                variant="outline"
                className="mt-5 border-gold/40 text-gold hover:bg-gold/10"
              >
                <a href="/team">Създай екип годишно</a>
              </Button>
              <div className="my-6 h-px bg-border/60" />
              <ul className="space-y-2.5">
                {teamFeatures.map((f) => (<Feature key={f}>{f}</Feature>))}
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
function SettingsTab({ profile, setProfile, userId }: {
  profile: { display_name: string | null; company: string | null; vat_number: string | null };
  setProfile: (p: any) => void; userId: string;
}) {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update(profile).eq("id", userId);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Запазено");
  };

  // Смяна на парола
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const changePassword = async () => {
    if (pwd.length < 8) { toast.error("Паролата трябва да е поне 8 знака"); return; }
    if (pwd !== pwd2) { toast.error("Паролите не съвпадат"); return; }
    setPwdBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setPwdBusy(false);
    if (error) toast.error(translateAuthError(error.message));
    else { toast.success("Паролата е сменена"); setPwd(""); setPwd2(""); }
  };

  // Смяна на имейл
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) { toast.error("Невалиден имейл"); return; }
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setEmailBusy(false);
    if (error) toast.error(translateAuthError(error.message));
    else {
      toast.success("Изпратихме потвърждение", {
        description: "Проверете и стария, и новия имейл за линк за потвърждение.",
      });
      setNewEmail("");
    }
  };

  // Изтриване на акаунт
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const deleteAccount = async () => {
    if (delConfirm !== "ИЗТРИЙ") { toast.error("Въведете ИЗТРИЙ за потвърждение"); return; }
    setDelBusy(true);
    const { error } = await supabase.functions.invoke("delete-account", { body: {} });
    setDelBusy(false);
    if (error) {
      toast.error("Грешка при изтриване", { description: error.message });
      return;
    }
    toast.success("Акаунтът е изтрит");
    await signOut();
    window.location.href = "/";
  };

  return (
    <div className="space-y-4">
      {/* Профил */}
      <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="font-serif text-lg font-bold">Профил</h3>
        <div><Label>Име</Label><Input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} /></div>
        <div><Label>Фирма</Label><Input value={profile.company ?? ""} onChange={(e) => setProfile({ ...profile, company: e.target.value })} /></div>
        <div><Label>ДДС №</Label><Input value={profile.vat_number ?? ""} onChange={(e) => setProfile({ ...profile, vat_number: e.target.value })} /></div>
        <Button onClick={save} disabled={busy} className="bg-gradient-gold text-navy">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Запази
        </Button>
      </div>

      {/* Смяна на парола */}
      <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
          <KeyRound className="h-4 w-4 text-gold" /> Смяна на парола
        </h3>
        <div><Label>Нова парола</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Поне 8 знака" /></div>
        <div><Label>Повтори паролата</Label><Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} /></div>
        <Button onClick={changePassword} disabled={pwdBusy || !pwd} variant="outline" className="border-gold/40">
          {pwdBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Смени паролата
        </Button>
      </div>

      {/* Смяна на имейл */}
      <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
          <Mail className="h-4 w-4 text-gold" /> Имейл адрес
        </h3>
        <p className="text-xs text-muted-foreground">Текущ: <strong>{user?.email}</strong></p>
        <div><Label>Нов имейл</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" /></div>
        <Button onClick={changeEmail} disabled={emailBusy || !newEmail} variant="outline" className="border-gold/40">
          {emailBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Промени имейла
        </Button>
      </div>

      {/* Изтриване на акаунт */}
      <div className="max-w-lg space-y-3 rounded-xl border border-destructive/40 bg-destructive/[0.04] p-6">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-destructive">
          <Trash className="h-4 w-4" /> Изтриване на акаунт
        </h3>
        <p className="text-xs text-muted-foreground">
          Това действие е необратимо. Ще бъдат изтрити всички ваши данни — контрагенти, папки, документи и анализи (GDPR).
        </p>
        <Dialog open={delOpen} onOpenChange={(o) => { setDelOpen(o); if (!o) setDelConfirm(""); }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-destructive/60 text-destructive hover:bg-destructive/10">
              <Trash className="mr-2 h-4 w-4" /> Изтрий моя акаунт
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Сигурни ли сте?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Това действие <strong className="text-destructive">не може</strong> да бъде отменено. Всички ваши данни ще бъдат изтрити.
              </p>
              <LegalDisclaimer variant="danger">
                <strong>Какво ще бъде изтрито:</strong>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>Профил и настройки (име, фирма, ДДС, аватар, подпис)</li>
                  <li>Всички запазени договори, шаблони и папки</li>
                  <li>Качени PDF/DOCX документи и AI анализи на риска</li>
                  <li>Контрагенти, имейл предпочитания, история на покупки</li>
                  <li>Споделени линкове за подписване (вкл. вече подписани)</li>
                  <li>Достъп до екипи, в които сте — ще бъдете премахнат(а)</li>
                </ul>
                <p className="mt-2 text-[11px] opacity-80">
                  Активни Pro абонаменти трябва да бъдат отказани предварително от раздел „Абонамент". Анонимизирани логове от плащания се запазват по закон (ЗСч, ЗДДС — 10 г.).
                </p>
              </LegalDisclaimer>
              <div>
                <Label>Въведете <strong>ИЗТРИЙ</strong> за потвърждение</Label>
                <Input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="ИЗТРИЙ" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDelOpen(false)}>Отказ</Button>
              <Button
                onClick={deleteAccount}
                disabled={delBusy || delConfirm !== "ИЗТРИЙ"}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {delBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Изтрий завинаги
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
