import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Search, ShieldCheck, Pencil, Users } from "lucide-react";

type SubRow = {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  product_id: string | null;
  price_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: "sandbox" | "live";
  created_at: string;
  updated_at: string;
};

type TeamRow = {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string;
  seat_count: number;
  member_count: number;
  status: string;
  environment: "sandbox" | "live";
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  ops_used: number;
  lifetime_ops: number;
  created_at: string;
  updated_at: string;
};

const SUB_STATUSES = ["trialing", "active", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"];
const TEAM_STATUSES = ["active", "past_due", "canceled", "paused", "trialing"];

const toLocalInput = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 16) : "";
const fromLocalInput = (val: string) =>
  val ? new Date(val).toISOString() : null;

export default function AdminSubscriptions() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Access denied</h1>
          <Button asChild variant="outline"><Link to="/">Home</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <div className="container py-8">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Admin</Link></Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-gold" /> Subscriptions & Teams
          </h1>
        </div>

        <Tabs defaultValue="subs" className="w-full">
          <TabsList>
            <TabsTrigger value="subs">User subscriptions</TabsTrigger>
            <TabsTrigger value="teams"><Users className="h-4 w-4 mr-1" /> Teams</TabsTrigger>
          </TabsList>
          <TabsContent value="subs"><SubscriptionsPanel /></TabsContent>
          <TabsContent value="teams"><TeamsPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SubscriptionsPanel() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [search, setSearch] = useState("");
  const [env, setEnv] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SubRow | null>(null);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_list_subscriptions", {
      _search: search || null,
      _env: env === "all" ? null : env,
      _status: status === "all" ? null : status,
      _limit: 300,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as SubRow[]) ?? []);
  };

  useEffect(() => { load(); }, [env, status]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Email / name / Stripe ID…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="pl-9" />
        </div>
        <Select value={env} onValueChange={setEnv}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All envs</SelectItem>
            <SelectItem value="sandbox">Sandbox</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SUB_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={load} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}</Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Env</TableHead>
              <TableHead>Period end</TableHead>
              <TableHead>Cancel @end</TableHead>
              <TableHead>Stripe sub</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.email}</div>
                  {r.display_name && <div className="text-xs text-muted-foreground">{r.display_name}</div>}
                </TableCell>
                <TableCell className="text-xs">{r.price_id ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={["active", "trialing"].includes(r.status) ? "default" : r.status === "past_due" ? "destructive" : "outline"}>
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell><Badge variant={r.environment === "live" ? "default" : "secondary"}>{r.environment}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("bg-BG") : "—"}
                </TableCell>
                <TableCell>{r.cancel_at_period_end ? "yes" : "—"}</TableCell>
                <TableCell className="text-xs font-mono max-w-[160px] truncate">{r.stripe_subscription_id ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No results</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <EditSubscriptionDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function EditSubscriptionDialog({ row, onClose, onSaved }: { row: SubRow | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<string>("");
  const [environment, setEnvironment] = useState<string>("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cancelAtEnd, setCancelAtEnd] = useState(false);
  const [priceId, setPriceId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setStatus(row.status);
    setEnvironment(row.environment);
    setStart(toLocalInput(row.current_period_start));
    setEnd(toLocalInput(row.current_period_end));
    setCancelAtEnd(row.cancel_at_period_end);
    setPriceId(row.price_id ?? "");
  }, [row]);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_subscription", {
      _id: row.id,
      _status: status || null,
      _current_period_start: fromLocalInput(start),
      _current_period_end: fromLocalInput(end),
      _cancel_at_period_end: cancelAtEnd,
      _environment: environment || null,
      _price_id: priceId || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Subscription updated");
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit subscription</DialogTitle></DialogHeader>
        {row && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{row.email}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUB_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Environment</Label>
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">sandbox</SelectItem>
                    <SelectItem value="live">live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Period start</Label>
                <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label>Period end</Label>
                <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Price ID (lookup_key)</Label>
                <Input value={priceId} onChange={(e) => setPriceId(e.target.value)} placeholder="pro_monthly" />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cancelAtEnd} onChange={(e) => setCancelAtEnd(e.target.checked)} />
                Cancel at period end
              </label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamsPanel() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [search, setSearch] = useState("");
  const [env, setEnv] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_list_teams", {
      _search: search || null,
      _env: env === "all" ? null : env,
      _status: status === "all" ? null : status,
      _limit: 300,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as TeamRow[]) ?? []);
  };

  useEffect(() => { load(); }, [env, status]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Team name / owner email / Stripe sub…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="pl-9" />
        </div>
        <Select value={env} onValueChange={setEnv}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All envs</SelectItem>
            <SelectItem value="sandbox">Sandbox</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TEAM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={load} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}</Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-center">Seats</TableHead>
              <TableHead className="text-center">Members</TableHead>
              <TableHead className="text-center">Ops (cycle / lifetime)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Env</TableHead>
              <TableHead>Period end</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs">{r.owner_email}</TableCell>
                <TableCell className="text-center font-mono">{r.seat_count}</TableCell>
                <TableCell className="text-center">{r.member_count}</TableCell>
                <TableCell className="text-center text-xs">{r.ops_used} / {r.lifetime_ops}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : r.status === "past_due" ? "destructive" : "outline"}>{r.status}</Badge>
                </TableCell>
                <TableCell><Badge variant={r.environment === "live" ? "default" : "secondary"}>{r.environment}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("bg-BG") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No results</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <EditTeamDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function EditTeamDialog({ row, onClose, onSaved }: { row: TeamRow | null; onClose: () => void; onSaved: () => void }) {
  const [seatCount, setSeatCount] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [environment, setEnvironment] = useState<string>("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setSeatCount(String(row.seat_count));
    setStatus(row.status);
    setEnvironment(row.environment);
    setStart(toLocalInput(row.current_period_start));
    setEnd(toLocalInput(row.current_period_end));
  }, [row]);

  const save = async () => {
    if (!row) return;
    const n = parseInt(seatCount, 10);
    if (!Number.isFinite(n) || n < 1) { toast.error("Invalid seat count"); return; }
    if (n < row.member_count && !confirm(`Seats (${n}) is less than current members (${row.member_count}). Continue?`)) return;

    setSaving(true);
    const { error } = await supabase.rpc("admin_update_team", {
      _id: row.id,
      _seat_count: n,
      _status: status || null,
      _current_period_start: fromLocalInput(start),
      _current_period_end: fromLocalInput(end),
      _environment: environment || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Team updated");
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit team</DialogTitle></DialogHeader>
        {row && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{row.name} · owner {row.owner_email} · {row.member_count} members</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Seat count</Label>
                <Input type="number" min={1} value={seatCount} onChange={(e) => setSeatCount(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Op cap = seats × 100 / month</p>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TEAM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Environment</Label>
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">sandbox</SelectItem>
                    <SelectItem value="live">live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div />
              <div>
                <Label>Period start</Label>
                <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label>Period end</Label>
                <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
