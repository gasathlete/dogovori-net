import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Users, Mail, Trash2, Plus, ArrowLeft, Crown, Shield } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useTeam } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { TeamDocuments } from "@/components/TeamDocuments";
import { TeamBranding } from "@/components/TeamBranding";
import { TeamContacts } from "@/components/TeamContacts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStripeEnvironment } from "@/lib/stripe";

export default function TeamPage() {
  const { user } = useAuth();
  const { team, usage, loading, refresh } = useTeam();
  const navigate = useNavigate();
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSeats, setCreateSeats] = useState(3);
  const [createBilling, setCreateBilling] = useState<"monthly" | "yearly">("monthly");
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seatsValue, setSeatsValue] = useState(3);

  useEffect(() => {
    if (!team) return;
    setSeatsValue(team.seat_count);
    (async () => {
      const { data: mem } = await supabase
        .from("team_members")
        .select("id, user_id, role, joined_at")
        .eq("team_id", team.team_id)
        .order("joined_at", { ascending: true });
      setMembers(mem ?? []);

      if (team.role !== "member") {
        const { data: inv } = await supabase
          .from("team_invitations")
          .select("id, email, created_at, expires_at, accepted_at")
          .eq("team_id", team.team_id)
          .is("accepted_at", null)
          .order("created_at", { ascending: false });
        setInvitations(inv ?? []);

        const { data: log } = await supabase
          .from("team_audit_log")
          .select("id, action, target_id, target_type, created_at, user_id")
          .eq("team_id", team.team_id)
          .order("created_at", { ascending: false })
          .limit(50);
        setAuditLog(log ?? []);
      }
    })();
  }, [team]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;
  }

  if (!team) {
    return (
      <>
        <Header />
        <main className="container mx-auto max-w-4xl px-4 py-12">
          <div className="mb-8">
            <Link to="/account" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" /> Към профила
            </Link>
          </div>
          <div className="rounded-2xl border border-gold/30 bg-gradient-card p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gold" />
            <h1 className="mt-4 font-serif text-3xl font-bold">Team план за фирми</h1>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Споделени шаблони, audit log, SSO, branded документи и общ лимит от 100 операции на място на месец.
              7.90 €/място/месец, мин. 3 места.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="mt-6 bg-gradient-gold text-navy hover:shadow-gold">
              <Plus className="mr-2 h-4 w-4" /> Създай екип
            </Button>
          </div>
        </main>
        <Footer />

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Нов екип</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Име на фирмата / екипа</Label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Адвокатска кантора Иванов" />
              </div>
              <div>
                <Label>Брой места (мин. 3)</Label>
                <Input type="number" min={3} max={100} value={createSeats} onChange={(e) => setCreateSeats(Math.max(3, parseInt(e.target.value || "3")))} />
              </div>
              <div>
                <Label>Период на фактуриране</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button variant={createBilling === "monthly" ? "default" : "outline"} onClick={() => setCreateBilling("monthly")} className={createBilling === "monthly" ? "bg-gradient-gold text-navy" : ""}>
                    Месечно — {(7.9 * createSeats).toFixed(2)} €/мес
                  </Button>
                  <Button variant={createBilling === "yearly" ? "default" : "outline"} onClick={() => setCreateBilling("yearly")} className={createBilling === "yearly" ? "bg-gradient-gold text-navy" : ""}>
                    Годишно — {(79 * createSeats).toFixed(0)} €/год
                  </Button>
                </div>
              </div>
              <Button
                disabled={busy || !createName || createName.length < 2}
                className="w-full bg-gradient-gold text-navy"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("create-team", {
                      body: {
                        name: createName, seats: createSeats, billing: createBilling,
                        returnUrl: `${window.location.origin}/team?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
                        environment: getStripeEnvironment(),
                      },
                    });
                    if (error || !data?.clientSecret) throw new Error(error?.message || "Грешка");
                    setCheckoutSecret(data.clientSecret);
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Продължи към плащане
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!checkoutSecret} onOpenChange={(o) => !o && setCheckoutSecret(null)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
            <div className="p-6">
              {checkoutSecret && user && (
                <StripeEmbeddedCheckout
                  key={checkoutSecret}
                  clientSecret={checkoutSecret}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const isAdmin = team.role !== "member";
  const usagePct = usage ? Math.round((usage.ops_used / usage.cap) * 100) : 0;

  return (
    <>
      <Header />
      <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
        <Link to="/account" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Към профила
        </Link>

        <div className="rounded-2xl border border-gold/30 bg-gradient-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-gold">Team</div>
              <h1 className="mt-1 font-serif text-2xl font-bold">{team.team_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Вашата роля: <strong>{team.role === "owner" ? "Собственик" : team.role === "admin" ? "Администратор" : "Член"}</strong>
                {" · "}Места: {team.seat_count}
                {team.current_period_end && <> · Подновяване: {new Date(team.current_period_end).toLocaleDateString("bg-BG")}</>}
              </p>
            </div>
            <Users className="h-8 w-8 text-gold" />
          </div>

          {usage && (
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Ползване този период</span>
                <span className="font-medium">{usage.ops_used} / {usage.cap} операции ({usagePct}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${Math.min(100, usagePct)}%` }} />
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="documents" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="documents">Документи</TabsTrigger>
            <TabsTrigger value="contacts">Контакти</TabsTrigger>
            <TabsTrigger value="branding">Брандинг</TabsTrigger>
            <TabsTrigger value="members">Членове</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-4">
            <TeamDocuments teamId={team.team_id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            <TeamContacts teamId={team.team_id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="branding" className="mt-4">
            <TeamBranding teamId={team.team_id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="members" className="mt-4 space-y-6">
        <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold">Членове ({members.length}/{team.seat_count})</h2>
            {isAdmin && (
              <Button onClick={() => setInviteOpen(true)} size="sm" className="bg-gradient-gold text-navy">
                <Mail className="mr-2 h-4 w-4" /> Покани
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  {m.role === "owner" ? <Crown className="h-4 w-4 text-gold" /> : m.role === "admin" ? <Shield className="h-4 w-4 text-gold" /> : <span className="h-4 w-4" />}
                  <div>
                    <div className="text-sm font-medium">{m.user_id === user?.id ? "Вие" : m.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{m.role} · от {new Date(m.joined_at).toLocaleDateString("bg-BG")}</div>
                  </div>
                </div>
                {isAdmin && m.user_id !== user?.id && team.role === "owner" && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    if (!confirm("Премахни от екипа?")) return;
                    await supabase.from("team_members").delete().eq("id", m.id);
                    refresh();
                    setMembers(members.filter((x) => x.id !== m.id));
                  }}><Trash2 className="h-4 w-4" /></Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {isAdmin && invitations.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
            <h2 className="mb-4 font-serif text-xl font-bold">Чакащи покани</h2>
            <ul className="space-y-2">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3 text-sm">
                  <span>{inv.email}</span>
                  <span className="text-muted-foreground">изтича {new Date(inv.expires_at).toLocaleDateString("bg-BG")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isAdmin && team.role === "owner" && (
          <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
            <h2 className="mb-4 font-serif text-xl font-bold">Брой места</h2>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Места</Label>
                <Input type="number" min={Math.max(3, members.length)} max={100} value={seatsValue} onChange={(e) => setSeatsValue(parseInt(e.target.value || "3"))} />
              </div>
              <Button
                disabled={busy || seatsValue === team.seat_count}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { error } = await supabase.functions.invoke("team-update-seats", {
                      body: { teamId: team.team_id, seats: seatsValue, environment: getStripeEnvironment() },
                    });
                    if (error) throw new Error(error.message);
                    toast.success("Местата са обновени");
                    refresh();
                  } catch (e: any) { toast.error(e.message); }
                  finally { setBusy(false); }
                }}
                className="bg-gradient-gold text-navy"
              >Обнови</Button>
            </div>
          </div>
        )}

        {isAdmin && auditLog.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
            <h2 className="mb-4 font-serif text-xl font-bold">Последна активност</h2>
            <ul className="space-y-1 text-sm">
              {auditLog.slice(0, 10).map((a) => (
                <li key={a.id} className="flex justify-between text-muted-foreground">
                  <span>{a.action}{a.target_id ? ` — ${a.target_id}` : ""}</span>
                  <span>{new Date(a.created_at).toLocaleString("bg-BG")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <Footer />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Покани член</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Имейл</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="kolega@firm.bg" />
            </div>
            <Button
              disabled={busy || !inviteEmail}
              className="w-full bg-gradient-gold text-navy"
              onClick={async () => {
                setBusy(true);
                try {
                  const { error } = await supabase.functions.invoke("team-invite", {
                    body: { teamId: team.team_id, email: inviteEmail },
                  });
                  if (error) throw new Error(error.message);
                  toast.success("Поканата е изпратена");
                  setInviteOpen(false);
                  setInviteEmail("");
                } catch (e: any) { toast.error(e.message); }
                finally { setBusy(false); }
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Изпрати
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
