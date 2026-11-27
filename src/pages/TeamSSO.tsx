import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Lock, Sparkles, Copy } from "@/icons";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useTeam } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";

type SsoConfig = {
  provider?: "okta" | "azure" | "google" | "onelogin" | "other";
  metadata_url?: string;
  email_domain?: string;
  acs_contact?: string;
  enforce_for_domain?: boolean;
  notes?: string;
  status?: "draft" | "requested" | "active";
  requested_at?: string;
};

const ACS_URL = "https://wkbxojefiovdczkwhved.supabase.co/auth/v1/sso/saml/acs";
const ENTITY_ID = "https://dogovori.net/saml";

export default function TeamSSO() {
  const { user } = useAuth();
  const { team, loading } = useTeam();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<SsoConfig>({ provider: "okta", status: "draft", enforce_for_domain: false });
  const [saving, setSaving] = useState(false);

  const isOwner = team?.role === "owner";

  useEffect(() => {
    if (!team) return;
    supabase
      .from("teams")
      .select("sso_config")
      .eq("id", team.team_id)
      .maybeSingle()
      .then(({ data }) => {
        const c = (data as any)?.sso_config as SsoConfig | undefined;
        if (c && Object.keys(c).length) setCfg({ provider: "okta", status: "draft", ...c });
      });
  }, [team?.team_id]);

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Копирано");
  };

  const save = async (markRequested = false) => {
    if (!team) return;
    setSaving(true);
    try {
      const payload: SsoConfig = {
        ...cfg,
        status: markRequested ? "requested" : cfg.status ?? "draft",
        requested_at: markRequested ? new Date().toISOString() : cfg.requested_at,
      };
      const { error } = await supabase
        .from("teams")
        .update({ sso_config: payload as any })
        .eq("id", team.team_id);
      if (error) throw error;
      setCfg(payload);
      toast.success(markRequested ? "Заявката е изпратена — ще се свържем с вас" : "Запазено");
    } catch (e: any) {
      toast.error(e.message ?? "Грешка при запис");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="container mx-auto max-w-3xl px-4 py-12 text-sm text-muted-foreground">Зареждане…</main>
        <Footer />
      </>
    );
  }

  if (!team) {
    return (
      <>
        <Header />
        <main className="container mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-2xl border border-gold/30 bg-gradient-card p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-gold" />
            <h1 className="mt-3 font-serif text-2xl font-bold">SSO е достъпен само за план Екип</h1>
            <p className="mt-2 text-sm text-muted-foreground">Създайте екип, за да заявите Single Sign-On.</p>
            <Button onClick={() => navigate("/team")} className="mt-5 bg-gradient-gold text-navy">Към Екип</Button>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-8 pb-24">
        <Link to="/team" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад към Екип
        </Link>

        <header className="rounded-2xl border border-gold/30 bg-gradient-card p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold">
            <Sparkles className="h-3 w-3" /> Beta — активира се по заявка
          </div>
          <h1 className="mt-3 font-serif text-3xl font-bold">Single Sign-On (SAML 2.0)</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Свържете корпоративния си идентичностен доставчик (Okta, Microsoft Entra ID, Google Workspace, OneLogin). След конфигуриране,
            всеки служител с имейл от вашия домейн ще влиза с фирмения си акаунт.
          </p>
        </header>

        {/* SP details for the IdP admin */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6">
          <h2 className="font-serif text-lg font-bold">Параметри за вашия IdP</h2>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            Дайте тези стойности на администратора на вашия SSO доставчик при настройка на новото SAML приложение.
          </p>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">ACS URL</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="break-all text-xs">{ACS_URL}</code>
                <Button variant="ghost" size="sm" onClick={() => copy(ACS_URL)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Entity ID</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="break-all text-xs">{ENTITY_ID}</code>
                <Button variant="ghost" size="sm" onClick={() => copy(ENTITY_ID)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Configuration form */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6">
          <h2 className="font-serif text-lg font-bold">Конфигурация</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Запазете чернова и натиснете „Изпрати заявка" когато сте готови — нашият екип финализира включването в рамките на 1 работен ден.
          </p>

          <fieldset disabled={!isOwner || saving} className="mt-5 grid gap-4">
            <div>
              <Label className="text-xs">Доставчик</Label>
              <Select value={cfg.provider ?? "okta"} onValueChange={(v) => setCfg((c) => ({ ...c, provider: v as any }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="okta">Okta</SelectItem>
                  <SelectItem value="azure">Microsoft Entra ID (Azure AD)</SelectItem>
                  <SelectItem value="google">Google Workspace</SelectItem>
                  <SelectItem value="onelogin">OneLogin</SelectItem>
                  <SelectItem value="other">Друг (SAML 2.0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">SAML Metadata URL</Label>
              <Input
                className="mt-1"
                placeholder="https://idp.example.com/app/.../sso/saml/metadata"
                value={cfg.metadata_url ?? ""}
                onChange={(e) => setCfg((c) => ({ ...c, metadata_url: e.target.value }))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">XML metadata endpoint, генериран от вашия IdP.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Фирмен домейн</Label>
                <Input
                  className="mt-1"
                  placeholder="example.com"
                  value={cfg.email_domain ?? ""}
                  onChange={(e) => setCfg((c) => ({ ...c, email_domain: e.target.value.trim().toLowerCase() }))}
                />
              </div>
              <div>
                <Label className="text-xs">Контакт за активиране</Label>
                <Input
                  className="mt-1"
                  type="email"
                  placeholder="it@example.com"
                  value={cfg.acs_contact ?? ""}
                  onChange={(e) => setCfg((c) => ({ ...c, acs_contact: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!!cfg.enforce_for_domain}
                onChange={(e) => setCfg((c) => ({ ...c, enforce_for_domain: e.target.checked }))}
                className="mt-0.5"
              />
              <span>След активиране, изисквай SSO за всички акаунти от посочения домейн.</span>
            </label>
            <div>
              <Label className="text-xs">Бележки (по избор)</Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Срокове, специфики на IdP, attribute mapping и др."
                value={cfg.notes ?? ""}
                onChange={(e) => setCfg((c) => ({ ...c, notes: e.target.value }))}
              />
            </div>
          </fieldset>

          {!isOwner && (
            <p className="mt-4 rounded-md border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-200">
              Само собственикът на екипа може да променя SSO настройките.
            </p>
          )}

          {cfg.status === "requested" && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-200">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <div>
                Заявката е получена{cfg.requested_at && ` на ${new Date(cfg.requested_at).toLocaleString("bg-BG")}`}.
                Ще се свържем с {cfg.acs_contact || "вашия контакт"} за финализиране.
              </div>
            </div>
          )}

          {isOwner && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" disabled={saving} onClick={() => save(false)}>
                Запази чернова
              </Button>
              <Button
                disabled={saving || !cfg.metadata_url || !cfg.email_domain}
                onClick={() => save(true)}
                className="bg-gradient-gold text-navy hover:shadow-gold"
              >
                Изпрати заявка за активиране
              </Button>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
