import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

export type Contact = {
  id: string; name: string; type: "individual" | "legal";
  egn?: string | null; eik?: string | null; vat_number?: string | null;
  address?: string | null; mol?: string | null; email?: string | null; phone?: string | null; notes?: string | null;
};
export type Folder = { id: string; name: string; color: string | null; is_favorites: boolean };
export type SavedDoc = {
  id: string; title: string; kind: "contract" | "template"; folder_id: string | null;
  contact_id: string | null; payload: any; created_at: string;
};
export type Quota = { contracts_used: number; templates_used: number; plan: "free" | "pro"; pro_until: string | null; analyses_used?: number; total_used?: number; monthly_total_used?: number; bonus_contracts?: number; pro_monthly_used?: number; monthly_reset_at?: string | null; pro_period_start?: string | null; signup_at?: string | null };
export type UploadedContract = {
  id: string; title: string; source: "pdf" | "docx" | "paste";
  folder_id: string | null; contact_id: string | null;
  original_filename: string | null; storage_path: string | null;
  created_at: string;
};
export type RiskAnalysisLite = { uploaded_contract_id: string; score: number; contract_type: string; created_at: string };

export type TabDef = { value: string; label: string; icon?: React.ComponentType<{ className?: string }> };
export type TabGroup = { id: string; label: string; tabs: TabDef[] };

/* ====================== SCROLLABLE TABS LIST ====================== */
function ScrollableTabsList({ groups, value }: { groups: TabGroup[]; value: string }) {
  const [params] = useSearchParams();
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const active = groups.find((g) => g.tabs.some((t) => t.value === value))?.id;
    return active ? { [active]: true } : {};
  });
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(false);

  const activeGroupId = useMemo(
    () => groups.find((g) => g.tabs.some((t) => t.value === value))?.id,
    [groups, value]
  );

  useEffect(() => {
    if (activeGroupId) {
      setExpanded((prev) => ({ ...prev, [activeGroupId]: true }));
    }
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (isMobile && next[id]) {
        groups.forEach((g) => {
          if (g.id !== id) next[g.id] = false;
        });
      }
      return next;
    });
  };

  const updateHint = () => {
    const el = listRef.current;
    if (!el) return;
    setShowHint(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
  };

  useEffect(() => {
    updateHint();
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateHint, { passive: true });
    window.addEventListener("resize", updateHint);
    return () => {
      el.removeEventListener("scroll", updateHint);
      window.removeEventListener("resize", updateHint);
    };
  }, []);

  return (
    <div className="relative md:static">
      <TabsList
        ref={listRef as any}
        className="-mx-4 flex h-auto w-auto justify-start gap-3 overflow-x-auto bg-transparent p-1 px-4 [scrollbar-width:none] md:mx-0 md:w-full md:flex-col md:gap-6 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {groups.map((group) => {
          const isExpanded = !!expanded[group.id];
          const isActiveGroup = group.id === activeGroupId;
          return (
            <div
              key={group.id}
              className="flex shrink-0 flex-col md:w-full md:shrink"
              style={{ minWidth: isMobile ? "9rem" : undefined }}
            >
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground md:py-2 md:text-[11px]"
                aria-expanded={isExpanded}
              >
                <span className={isActiveGroup ? "text-gold" : undefined}>{group.label}</span>
                <span
                  className="transition-transform duration-200"
                  style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
              <div
                className="flex flex-col gap-0.5 overflow-hidden transition-all duration-200 md:mt-1"
                style={{
                  maxHeight: isExpanded ? (isMobile ? "10rem" : "24rem") : "0px",
                  opacity: isExpanded ? 1 : 0,
                }}
              >
                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="justify-start gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-all data-[state=active]:bg-gold/10 data-[state=active]:text-gold data-[state=active]:shadow-none hover:bg-muted/40 hover:text-foreground"
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{tab.label}</span>
                    </TabsTrigger>
                  );
                })}
              </div>
            </div>
          );
        })}
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

export { ScrollableTabsList };
