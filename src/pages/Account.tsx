import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut,
  Bird, Loader2, ArrowLeft, Bell, LayoutDashboard, Briefcase, Package,
} from "lucide-react";

import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, PenTool } from "lucide-react";
import { Seo } from "@/components/Seo";

import { ScrollableTabsList } from "./account/ScrollableTabsList";
import type { Contact, Folder, SavedDoc, Quota, UploadedContract, RiskAnalysisLite } from "./account/ScrollableTabsList";

// Lazy-load tabs — only the active tab parses its JS on first visit.
const Dashboard = lazy(() => import("./account/DashboardTab"));
const ContactsTab = lazy(() => import("./account/ContactsTab"));
const DocumentsTab = lazy(() => import("./account/DocumentsTab"));
const FoldersTab = lazy(() => import("./account/FoldersTab"));
const SubscriptionTab = lazy(() => import("./account/SubscriptionTab"));
const SettingsTab = lazy(() => import("./account/SettingsTab"));
const DealsTab = lazy(() => import("./account/DealsTab"));
const KitsTab = lazy(() => import("./account/KitsTab"));


function TabFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Зареждане…
    </div>
  );
}

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const initialTab = params.get("tab") ?? (params.get("action") === "upload" ? "uploaded" : "dashboard");
  const activeContact = params.get("contact");
  const [autoOpenUpload] = useState(() => params.get("action") === "upload");

  useEffect(() => {
    if (params.get("action") === "upload") {
      const next = new URLSearchParams(params);
      next.delete("action");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="min-h-dvh">
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
              <Link to="/console"><LayoutDashboard className="mr-2 h-4 w-4" /> Workspace</Link>
            </Button>
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
            <TabsTrigger value="deals" className="shrink-0 whitespace-nowrap"><Briefcase className="mr-1 h-3.5 w-3.5" />Сделки</TabsTrigger>
            <TabsTrigger value="kits" className="shrink-0 whitespace-nowrap"><Package className="mr-1 h-3.5 w-3.5" />Комплекти</TabsTrigger>
            <TabsTrigger value="signed" className="shrink-0 whitespace-nowrap"><PenTool className="mr-1 h-3.5 w-3.5" />Подписани</TabsTrigger>

            <TabsTrigger value="subscription" className="shrink-0 whitespace-nowrap"><CreditCard className="mr-1 h-3.5 w-3.5" />Абонамент</TabsTrigger>
            <TabsTrigger value="settings" className="shrink-0 whitespace-nowrap"><SettingsIcon className="mr-1 h-3.5 w-3.5" />Настройки</TabsTrigger>
          </ScrollableTabsList>

          <TabsContent value="dashboard">
            <Suspense fallback={<TabFallback />}>
              <Dashboard quota={quota} isPro={!!isPro} docs={docs} uploadedCount={uploaded.length} correctionsCount={correctionsCount} analysesDates={analysesDates} correctionsDates={correctionsDates} opChargeDates={opChargeDates} hasChatAccess={!!isPro || (!!teamForChat && teamForChat.status === "active")} onOpenChat={() => window.dispatchEvent(new Event("dogovai:open"))} contactsCount={contacts.length} foldersCount={folders.length} />
            </Suspense>
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>
          <TabsContent value="contacts">
            <Suspense fallback={<TabFallback />}>
              <ContactsTab contacts={contacts} docs={docs} reload={reload} onOpenDocs={openContactDocs} />
            </Suspense>
          </TabsContent>
          <TabsContent value="documents">
            <Suspense fallback={<TabFallback />}>
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
                autoOpenUpload={autoOpenUpload}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="folders">
            <Suspense fallback={<TabFallback />}>
              <FoldersTab folders={folders} docs={docs} uploaded={uploaded} reload={reload} onOpenTab={(t) => onTabChange(t)} setActiveFolder={setActiveFolder} />
            </Suspense>
          </TabsContent>
          <TabsContent value="signed">
            <SignedContractsTab userId={user?.id ?? ""} />
          </TabsContent>
          <TabsContent value="deals">
            <Suspense fallback={<TabFallback />}>
              <DealsTab />
            </Suspense>
          </TabsContent>
          <TabsContent value="kits">
            <Suspense fallback={<TabFallback />}>
              <KitsTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="subscription">
            <Suspense fallback={<TabFallback />}>
              <SubscriptionTab quota={quota} isPro={!!isPro} />
            </Suspense>
          </TabsContent>
          <TabsContent value="settings">
            <Suspense fallback={<TabFallback />}>
              <SettingsTab profile={profile} setProfile={setProfile} userId={user?.id ?? ""} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
      {/* Global DogovAI bubble is mounted in App.tsx */}
    </div>
  );
}
