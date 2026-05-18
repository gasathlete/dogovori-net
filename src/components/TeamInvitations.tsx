import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, RefreshCw, X, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Invitation = {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
};

export function TeamInvitations({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }) {
  const [list, setList] = useState<Invitation[] | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("team_invitations")
      .select("id, email, created_at, expires_at")
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    setList(data ?? []);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("team-invite", {
        body: { teamId, email },
      });
      if (error) throw new Error(error.message);
      toast.success("Поканата е изпратена");
      setOpen(false);
      setEmail("");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function resend(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("team-resend-invitation", { body: { invitationId: id } });
      if (error) throw new Error(error.message);
      toast.success("Поканата е изпратена отново");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function cancel(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("team-cancel-invitation", { body: { invitationId: id } });
      if (error) throw new Error(error.message);
      toast.success("Поканата е отменена");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg font-bold">Чакащи покани</h3>
        {isAdmin && (
          <Button size="sm" className="bg-gradient-gold text-navy" onClick={() => setOpen(true)}>
            <Mail className="mr-2 h-4 w-4" /> Покани
          </Button>
        )}
      </div>

      {list === null ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Няма чакащи покани</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{inv.email}</div>
                <div className="text-xs text-muted-foreground">изтича {new Date(inv.expires_at).toLocaleDateString("bg-BG")}</div>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => resend(inv.id)}>
                    <RefreshCw className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">Прати отново</span>
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => cancel(inv.id)}>
                    <X className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">Отмени</span>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Покани член</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Имейл</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kolega@firm.bg" />
            </div>
            <Button disabled={busy || !email} className="w-full bg-gradient-gold text-navy" onClick={invite}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Изпрати
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
