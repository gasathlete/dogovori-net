import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut, Crown, Bird, Loader2, Plus, Trash2, Star, Download, ArrowLeft, X, MessageSquare, Check, Lock, RefreshCw, Sparkles, Building2, Bell, LayoutDashboard,
} from "lucide-react";
import { NotificationsTab } from "@/components/NotificationsTab";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

import { useTeam } from "@/hooks/useTeam";
import { useAuth as _useAuthForShare } from "@/hooks/useAuth";
import { Users2, Share2 } from "lucide-react";
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
import { BulkActionsBar, BulkRowCheckbox } from "@/components/BulkActionsBar";
import { DocumentReminderDialog } from "@/components/DocumentReminderDialog";
import { DocumentVersionsDialog } from "@/components/DocumentVersionsDialog";
import { History } from "lucide-react";
import { useDocumentReminders, reminderStatus, REMINDER_KIND_LABEL } from "@/hooks/useDocumentReminders";
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
  user_id?: string | null; team_id?: string | null;
};
type Quota = { contracts_used: number; templates_used: number; plan: "free" | "pro"; pro_until: string | null; analyses_used?: number; total_used?: number; monthly_total_used?: number; bonus_contracts?: number; pro_monthly_used?: number; monthly_reset_at?: string | null; pro_period_start?: string | null; signup_at?: string | null };
type UploadedContract = {
  id: string; title: string; source: "pdf" | "docx" | "paste";
  folder_id: string | null; contact_id: string | null;
  original_filename: string | null; storage_path: string | null;
  created_at: string;
};
type RiskAnalysisLite = { uploaded_contract_id: string; score: number; contract_type: string; created_at: string };

function DocumentsTab({
  docs, folders, contacts, activeFolder, setActiveFolder, activeContactName, clearContactFilter, reload,
  uploaded, analysesByContract, autoOpenUpload,
}: {
  docs: SavedDoc[]; folders: Folder[]; contacts: Contact[];
  activeFolder: string | "all"; setActiveFolder: (v: string | "all") => void;
  activeContactName?: string; clearContactFilter: () => void;
  reload: () => void;
  uploaded: UploadedContract[];
  analysesByContract: Record<string, RiskAnalysisLite>;
  autoOpenUpload?: boolean;
}) {
  const contactName = (id: string | null) => contacts.find((c) => c.id === id)?.name;
  const { team } = useTeam();
  const { user: currentUser } = _useAuthForShare();
  const inActiveTeam = Boolean(team && team.status === "active");
  const [busy, setBusy] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSharedOnly, setShowSharedOnly] = useState(false);
  const { reminders, reload: reloadReminders } = useDocumentReminders();
  const [versionsForDoc, setVersionsForDoc] = useState<{ id: string; title: string } | null>(null);
  const toggleSelected = (id: string, v: boolean) =>
    setSelectedIds((prev) => (v ? [...prev, id] : prev.filter((x) => x !== id)));
  const hasMobileViewport = typeof window !== "undefined" && window.innerWidth < 640;
  const upcomingReminders = reminders
    .filter((r) => !r.done_at)
    .slice(0, 5);
  const reminderHref = (r: typeof reminders[number]): string | null => {
    if (r.saved_document_id) return `/document/${r.saved_document_id}`;
    if (r.uploaded_contract_id) return `/uploaded/${r.uploaded_contract_id}`;
    return null;
  };
  const reminderTitle = (r: typeof reminders[number]): string => {
    if (r.saved_document_id) {
      const d = docs.find((x) => x.id === r.saved_document_id);
      if (d) return d.title;
    }
    if (r.uploaded_contract_id) {
      const u = uploaded.find((x) => x.id === r.uploaded_contract_id);
      if (u) return u.title;
    }
    return "Документ";
  };

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
  const topLevelDocs = docs
    .filter((d) => !childSavedIds.has(d.id))
    .filter((d) => (showSharedOnly ? Boolean(d.team_id) : true));

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

  const toggleShareWithTeam = async (d: SavedDoc) => {
    if (!team) return;
    const next = d.team_id ? null : team.team_id;
    const { error } = await supabase
      .from("saved_documents")
      .update({ team_id: next })
      .eq("id", d.id);
    if (error) toast.error(error.message);
    else { toast.success(next ? "Споделено с екипа" : "Спряно споделянето"); reload(); }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-1 rounded-xl border border-border/60 bg-gradient-card p-3">
        <button onClick={() => { setActiveFolder("all"); setShowSharedOnly(false); }}
          className={`w-full rounded-md px-3 py-2 text-left text-sm ${activeFolder === "all" && !showSharedOnly ? "bg-gold/10 text-gold" : "hover:bg-card/60"}`}>
          Всички ({docs.length})
        </button>
        {inActiveTeam && (
          <button onClick={() => { setShowSharedOnly(true); setActiveFolder("all"); }}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${showSharedOnly ? "bg-gold/10 text-gold" : "hover:bg-card/60"}`}>
            <Users2 className="h-3.5 w-3.5" />
            Споделени с екипа ({docs.filter((d) => d.team_id).length})
          </button>
        )}
        {folders.map((f) => (
          <button key={f.id} onClick={() => setActiveFolder(f.id)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${activeFolder === f.id ? "bg-gold/10 text-gold" : "hover:bg-card/60"}`}>
            {f.is_favorites ? <Star className="h-3.5 w-3.5 fill-gold text-gold" /> : <FolderOpen className="h-3.5 w-3.5" />}
            {f.name}
          </button>
        ))}
      </aside>
      <div className={hasMobileViewport ? "space-y-8 pb-20" : "space-y-8"}>
        {upcomingReminders.length > 0 && (
          <section className="rounded-xl border border-gold/30 bg-gold/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gold">
              <Bell className="h-4 w-4" />
              Предстоящи напомняния ({reminders.filter((r) => !r.done_at).length})
            </div>
            <ul className="space-y-1.5">
              {upcomingReminders.map((r) => {
                const s = reminderStatus(r);
                const href = reminderHref(r);
                const title = reminderTitle(r);
                const inner = (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-card/40 px-3 py-2 text-xs hover:bg-card/70">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {REMINDER_KIND_LABEL[r.kind]} · {new Date(r.remind_at).toLocaleDateString("bg-BG")}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                );
                return (
                  <li key={r.id}>
                    {href ? <Link to={href}>{inner}</Link> : inner}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {/* ===== Uploaded contracts (own files with AI risk analysis) ===== */}
        <section id="uploaded" className="scroll-mt-24">
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
                autoOpen={autoOpenUpload}
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
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
                      <ShareForSignDialog uploadedContractId={u.id} documentTitle={u.title} triggerClassName="h-10 w-full justify-center sm:h-9 sm:w-auto" />
                      <DocumentReminderDialog
                        target={{ uploadedContractId: u.id }}
                        documentTitle={u.title}
                        onChanged={reloadReminders}
                      />
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
                        <SelectTrigger className="h-10 w-full text-xs sm:h-9 sm:w-32"><SelectValue placeholder="Папка" /></SelectTrigger>
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
            <>
              <BulkActionsBar
                docs={topLevelDocs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, payload: d.payload }))}
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
              />
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
                    {selectionMode && (
                      <BulkRowCheckbox
                        checked={selectedIds.includes(d.id)}
                        onChange={(v) => toggleSelected(d.id, v)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-serif text-base font-bold transition-colors group-hover:text-gold">{d.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {d.kind === "contract" ? "Договор" : "Бланка"} · {new Date(d.created_at).toLocaleDateString("bg-BG")}
                        {isBundle && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                            Комплект · {childLinks.length + 1} док.
                          </span>
                        )}
                        {d.team_id && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                            <Users2 className="h-3 w-3" />
                            {d.user_id && currentUser && d.user_id !== currentUser.id ? "От екипа" : "Споделено"}
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
                      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5"
                      onClick={(e) => e.preventDefault()}
                    >
                      <Button size="sm" variant="outline" className="h-10 w-full sm:h-9 sm:w-auto" disabled={busy === d.id + "pdf"} onClick={() => redownload(d, "pdf")}>
                        {busy === d.id + "pdf" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} PDF
                      </Button>
                      <Button size="sm" variant="outline" className="h-10 w-full sm:h-9 sm:w-auto" disabled={busy === d.id + "docx"} onClick={() => redownload(d, "docx")}>
                        {busy === d.id + "docx" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} DOCX
                      </Button>
                      {d.kind === "contract" && <ShareForSignDialog documentId={d.id} documentTitle={d.title} triggerClassName="h-10 w-full justify-center sm:h-9 sm:w-auto" />}
                      <DocumentReminderDialog
                        target={{ savedDocumentId: d.id }}
                        documentTitle={d.title}
                        onChanged={reloadReminders}
                      />
                      {(!d.user_id || !currentUser || d.user_id === currentUser.id) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 w-full sm:h-9 sm:w-auto"
                          onClick={() => setVersionsForDoc({ id: d.id, title: d.title })}
                          title="История на версиите"
                        >
                          <History className="mr-1 h-3 w-3" /> История
                        </Button>
                      )}
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-10 w-full sm:h-9 sm:w-auto ${d.team_id ? "border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10" : ""}`}
                          onClick={() => toggleShareWithTeam(d)}
                          title={d.team_id ? "Спри споделянето с екипа" : "Сподели с екипа"}
                        >
                          <Share2 className="mr-1 h-3 w-3" />
                          {d.team_id ? "В екипа" : "Екип"}
                        </Button>
                      )}
                      <Select value={d.folder_id ?? "none"} onValueChange={(v) => move(d.id, v === "none" ? null : v)}>
                        <SelectTrigger className="h-10 w-full text-xs sm:h-9 sm:w-32"><SelectValue placeholder="Папка" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Без папка —</SelectItem>
                          {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {(!d.user_id || !currentUser || d.user_id === currentUser.id) && (
                        <Button size="sm" variant="ghost" className="h-10 w-full p-0 text-destructive sm:h-9 sm:w-9" onClick={() => remove(d.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Link>
              );})}
            </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================ FOLDERS ============================ */

export default DocumentsTab;
