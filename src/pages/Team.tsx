import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Users, Plus, ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useTeam } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import { TEAM_REWARD_TIERS, getUnlockedTeamTiers, getNextTeamTier } from "@/lib/rewards";

import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { TeamDocuments } from "@/components/TeamDocuments";
import { TeamBranding } from "@/components/TeamBranding";
import { TeamContacts } from "@/components/TeamContacts";
import { TeamMembersList } from "@/components/TeamMembers";
import { TeamInvitations } from "@/components/TeamInvitations";
import { TeamBilling } from "@/components/TeamBilling";
import { TeamAuditLog } from "@/components/TeamAuditLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStripeEnvironment } from "@/lib/stripe";

export default function TeamPage() {
  const { user } = useAuth();
  const { team, usage, loading, refresh } = useTeam();
  const [inviteEmail, setInviteEmail] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSeats, setCreateSeats] = useState(3);
  const createBilling = "yearly" as const;
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seatsValue, setSeatsValue] = useState(3);

  useEffect(() => { if (team) setSeatsValue(team.seat_count); }, [team]);

  const teamLifetimeOps = usage?.lifetime_ops ?? 0;
  const teamUnlocked = useMemo(() => getUnlockedTeamTiers(teamLifetimeOps), [teamLifetimeOps]);
  const teamNextTier = useMemo(() => getNextTeamTier(teamLifetimeOps), [teamLifetimeOps]);

  // Award newly reached team tiers — idempotent on the server.
  useEffect(() => {
    if (!team || teamLifetimeOps < TEAM_REWARD_TIERS[0].threshold) return;
    supabase.rpc("award_team_loyalty", { _team_id: team.team_id, _total_ops: teamLifetimeOps }).then(({ data }) => {
      const newTiers = (data as any)?.new_tiers as string[] | undefined;
      if (newTiers && newTiers.length) {
        const last = TEAM_REWARD_TIERS.find((t) => t.id === newTiers[newTiers.length - 1]);
        if (last) toast.success(`Екипът отключи „${last.name}"!`);
      }
    });
  }, [team?.team_id, teamLifetimeOps]);


  if (loading) {
    return (
      <>
        <Header />
        <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </main>
        <Footer />
      </>
    );
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
            <h1 className="mt-4 font-serif text-3xl font-bold">План Екип за фирми</h1>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Споделени шаблони, журнал на действията, достъп с фирмен имейл, брандирани документи и общ лимит от 100 операции на място на месец.
              10.90 €/място/месец, мин. 3 места.
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
                    Месечно — {(10.9 * createSeats).toFixed(2)} €/мес
                  </Button>
                  <Button variant={createBilling === "yearly" ? "default" : "outline"} onClick={() => setCreateBilling("yearly")} className={createBilling === "yearly" ? "bg-gradient-gold text-navy" : ""}>
                    Годишно — {(109 * createSeats).toFixed(0)} €/год
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
                <StripeEmbeddedCheckout key={checkoutSecret} clientSecret={checkoutSecret} />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const isAdmin = team.role !== "member";
  const isOwner = team.role === "owner";
  const usagePct = usage ? Math.round((usage.ops_used / usage.cap) * 100) : 0;

  return (
    <>
      <Header />
      <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
        <Link to="/account" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Към профила
        </Link>

        <div className="rounded-2xl border border-gold/30 bg-gradient-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-gold">Екип</div>
              <h1 className="mt-1 font-serif text-2xl font-bold">{team.team_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Вашата роля: <strong>{team.role === "owner" ? "Собственик" : team.role === "admin" ? "Администратор" : "Член"}</strong>
                {" · "}Места: {team.seat_count}
                {team.current_period_end && <> · Подновяване: {new Date(team.current_period_end).toLocaleDateString("bg-BG")}</>}
              </p>
            </div>
            <Users className="h-8 w-8 shrink-0 text-gold" />
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

        {/* Team loyalty rewards */}
        <div className="rounded-2xl border border-gold/30 bg-gradient-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-gold">Награди на екипа</div>
              <h2 className="mt-1 font-serif text-xl font-bold">
                {teamUnlocked.length ? teamUnlocked[teamUnlocked.length - 1].name : "Все още без ниво"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Общо извършени операции от екипа: <strong className="text-foreground">{teamLifetimeOps.toLocaleString("bg-BG")}</strong>
              </p>
            </div>
          </div>

          {teamNextTier && (
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">До „{teamNextTier.name}"</span>
                <span className="font-medium">
                  {Math.min(teamLifetimeOps, teamNextTier.threshold).toLocaleString("bg-BG")} / {teamNextTier.threshold.toLocaleString("bg-BG")}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-gold transition-all"
                  style={{ width: `${Math.min(100, (teamLifetimeOps / teamNextTier.threshold) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {TEAM_REWARD_TIERS.map((t) => {
              const unlocked = teamLifetimeOps >= t.threshold;
              const Icon = t.icon;
              return (
                <div
                  key={t.id}
                  className={`rounded-xl border p-4 transition-all ${
                    unlocked
                      ? "border-gold/40 bg-gold/5 shadow-sm"
                      : "border-border/50 bg-muted/20 opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {unlocked ? (
                      <Icon className="h-5 w-5 text-gold" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="font-semibold">{t.name}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.threshold.toLocaleString("bg-BG")} операции
                  </div>
                  <div className="mt-2 text-xs">{t.description}</div>
                </div>
              );
            })}
          </div>
        </div>



        <Tabs defaultValue="documents" className="w-full">
          <TabsList className={`grid w-full ${isAdmin ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4"} h-auto`}>
            <TabsTrigger value="documents">Документи</TabsTrigger>
            <TabsTrigger value="contacts">Контакти</TabsTrigger>
            <TabsTrigger value="members">Членове</TabsTrigger>
            <TabsTrigger value="branding">Брандинг</TabsTrigger>
            {isAdmin && <TabsTrigger value="billing">Billing</TabsTrigger>}
            {isAdmin && <TabsTrigger value="audit">Дневник</TabsTrigger>}
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
              <h2 className="mb-4 font-serif text-xl font-bold">Членове</h2>
              {user && (
                <TeamMembersList
                  teamId={team.team_id}
                  currentUserId={user.id}
                  currentRole={team.role}
                  teamName={team.team_name}
                  seatCount={team.seat_count}
                  onChanged={refresh}
                />
              )}
            </div>

            {isAdmin && (
              <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
                <TeamInvitations teamId={team.team_id} isAdmin={isAdmin} />
              </div>
            )}

            {isOwner && (
              <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
                <h2 className="mb-4 font-serif text-xl font-bold">Брой места</h2>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[140px]">
                    <Label>Места</Label>
                    <Input type="number" min={3} max={100} value={seatsValue} onChange={(e) => setSeatsValue(parseInt(e.target.value || "3"))} />
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
          </TabsContent>

          {isAdmin && (
            <TabsContent value="billing" className="mt-4">
              <TeamBilling teamId={team.team_id} canManage={isAdmin} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="audit" className="mt-4">
              <TeamAuditLog teamId={team.team_id} />
            </TabsContent>
          )}
        </Tabs>
      </main>
      <Footer />
    </>
  );
}
