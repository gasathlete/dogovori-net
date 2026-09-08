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
import { ShieldAlert, ShieldCheck, AlertTriangle, PenTool, ChevronRight, KeyRound, Mail, Trash, PlayCircle } from "@/icons";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
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

  // Изтегляне на лични данни (GDPR чл. 15 / 20)
  const [exportBusy, setExportBusy] = useState(false);
  const exportMyData = async () => {
    setExportBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Моля, влезте отново."); return; }
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/export-my-data`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) { toast.error("Твърде много заявки. Опитайте отново по-късно."); return; }
      if (!res.ok) { toast.error("Грешка при изтегляне на данни"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dogovori-export-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(a.href);
      toast.success("Готово — JSON файлът е изтеглен.");
    } catch (e: any) {
      toast.error("Грешка", { description: String(e?.message ?? e) });
    } finally {
      setExportBusy(false);
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

      {/* Изтегляне на лични данни (GDPR) */}
      <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
          <Download className="h-4 w-4 text-gold" /> Моите данни (GDPR)
        </h3>
        <p className="text-xs text-muted-foreground">
          Получете машинно четимо копие (JSON) на всички Ваши лични данни — профил, документи, контрагенти, съгласия, AI лог. По чл. 15 и чл. 20 GDPR.
        </p>
        <Button onClick={exportMyData} disabled={exportBusy} variant="outline" className="border-gold/40">
          {exportBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Download className="mr-2 h-4 w-4" /> Изтегли моите данни (JSON)
        </Button>
        <p className="text-[11px] text-muted-foreground/80">Лимит: 3 изтегляния в 24 часа.</p>
        <div className="mt-3 border-t border-border/40 pt-3 space-y-2">
          <p className="text-xs font-semibold">Документи за съответствие</p>
          <p className="text-[11px] text-muted-foreground">
            Резюме на оценката на въздействието (DPIA Summary) е достъпно на{" "}
            <Link to="/legal/dpia-summary" className="underline text-gold">/legal/dpia-summary</Link>.
            Пълната DPIA е вътрешен документ за отчетност и не се публикува публично —
            предоставя се само при надзорна проверка.
          </p>
          <Button asChild variant="outline" size="sm" className="border-gold/40">
            <a href="/legal-memorandum-dogovori-net.docx" download>
              <Download className="mr-2 h-3 w-3" /> Правен меморандум (за адвокатски преглед)
            </a>
          </Button>
        </div>
      </div>

      {/* EU-only AI данни (Data residency) */}
      <DataResidencyCard userId={user?.id ?? null} />

      {/* Помощ и обучение */}
      <HelpAndOnboardingCard />

      {/* AI асистент (MCP) */}
      <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
          <Sparkles className="h-4 w-4 text-gold" /> Свържи AI асистент
        </h3>
        <p className="text-xs text-muted-foreground">
          Използвай ChatGPT или Claude, за да работиш с твоите документи, шаблони
          и контакти — под твоя акаунт, чрез сигурен OAuth вход.
        </p>
        <Button asChild variant="outline" className="border-gold/40">
          <Link to="/connect">
            <Sparkles className="mr-2 h-4 w-4" /> Инструкции за свързване
          </Link>
        </Button>
      </div>

      {/* Обратна връзка */}
      <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
          <MessageSquare className="h-4 w-4 text-gold" /> Обратна връзка
        </h3>
        <p className="text-xs text-muted-foreground">
          Споделете бъг, идея или липсващ шаблон. Четем всяко съобщение.
        </p>
        <Button asChild variant="outline" className="border-gold/40">
          <Link to="/feedback?source=settings">
            <MessageSquare className="mr-2 h-4 w-4" /> Изпрати обратна връзка
          </Link>
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

// ---- Data residency (EU-only AI) card ----
function DataResidencyCard({ userId }: { userId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [euOnly, setEuOnly] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("allow_third_country_ai")
        .eq("id", userId)
        .maybeSingle();
      if (!cancelled) {
        setEuOnly((data as { allow_third_country_ai?: boolean } | null)?.allow_third_country_ai === false);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const toggle = async () => {
    if (!userId) return;
    setSaving(true);
    const next = !euOnly;
    const { error } = await supabase
      .from("profiles")
      .update({ allow_third_country_ai: !next })
      .eq("id", userId);
    setSaving(false);
    if (error) { toast.error("Грешка при запазване"); return; }
    setEuOnly(next);
    toast.success(next ? "Включено: само ЕИП обработка на AI" : "Изключено: разрешена глобална AI обработка");
  };

  return (
    <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
      <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
        <ShieldCheck className="h-4 w-4 text-gold" /> AI данни (EU residency)
      </h3>
      <p className="text-xs text-muted-foreground">
        По подразбиране AI обработката се извършва през Lovable AI Gateway, който може да маршрутизира заявки и към доставчици извън ЕИП.
        Когато включите „Само EU обработка", системата ще <strong>блокира</strong> всяка AI операция, която би напуснала ЕИП (чл. 44–49 GDPR).
      </p>
      <p className="text-[11px] text-muted-foreground/80">
        Внимание: при включена опция, AI генерирането и анализът ще бъдат недостъпни докато не върнете настройката. Препоръчва се само ако обработвате специални категории данни.
      </p>
      <Button
        onClick={toggle}
        disabled={loading || saving || !userId}
        variant="outline"
        className="border-gold/40"
      >
        {(loading || saving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {euOnly ? "Изключи EU-only режим" : "Включи EU-only режим"}
      </Button>
    </div>
  );
}


function HelpAndOnboardingCard() {
  const { openTutorial } = useOnboarding();
  return (
    <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
      <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
        <PlayCircle className="h-4 w-4 text-gold" /> Помощ и обучение
      </h3>
      <p className="text-xs text-muted-foreground">
        Пусни отново краткото въведение в платформата — 8 стъпки, които показват всички ключови функционалности.
      </p>
      <Button onClick={openTutorial} variant="outline" className="border-gold/40">
        <PlayCircle className="mr-2 h-4 w-4" /> Пусни въведението
      </Button>
    </div>
  );
}

export default SettingsTab;
