import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut, Crown, Bird, Loader2, Plus, Trash2, Star, Download, ArrowLeft, X, MessageSquare, Check, Lock, RefreshCw, Sparkles, Building2, Bell, LayoutDashboard,
} from "@/icons";
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
import { ShieldAlert, ShieldCheck, AlertTriangle, PenTool, ChevronRight, KeyRound, Mail, Trash } from "@/icons";
import { isValidEGN, isValidEIK } from "@/lib/bgValidation";
import { translateAuthError } from "@/lib/authErrors";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { Seo } from "@/components/Seo";
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
type RiskAnalysisLite = { uploaded_contract_id: string; score: number; contract_type: string; created_at: string; verification?: unknown };

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

export default FoldersTab;
