import { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crown, LogOut, MoreVertical, Shield, UserMinus, Users } from "@/icons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type TeamMember = {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function initials(name: string | null, email: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const ROLE_LABEL: Record<TeamMember["role"], string> = {
  owner: "Собственик", admin: "Администратор", member: "Член",
};

export function TeamMembersList({
  teamId, currentUserId, currentRole, teamName, seatCount, onChanged,
}: {
  teamId: string;
  currentUserId: string;
  currentRole: "owner" | "admin" | "member";
  teamName: string;
  seatCount: number;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferConfirm, setTransferConfirm] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdmin = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("team-members", {
      body: { teamId, action: "list" },
    });
    if (error) { toast.error(error.message); return; }
    setMembers((data?.members ?? []) as TeamMember[]);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  async function changeRole(m: TeamMember, role: "admin" | "member") {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("team-members", {
        body: { teamId, action: "change-role", userId: m.user_id, role },
      });
      if (error) throw new Error(error.message);
      toast.success("Ролята е променена");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function removeMember(m: TeamMember) {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("team-remove-member", {
        body: { teamId, userId: m.user_id },
      });
      if (error) throw new Error(error.message);
      toast.success("Членът е премахнат");
      setRemoveTarget(null);
      await load();
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function leave() {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("team-members", {
        body: { teamId, action: "leave" },
      });
      if (error) throw new Error(error.message);
      toast.success("Напуснахте екипа");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); setLeaveOpen(false); }
  }

  async function transferOwnership() {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("team-members", {
        body: { teamId, action: "transfer-ownership", newOwnerId: transferTo, confirmName: transferConfirm },
      });
      if (error) throw new Error(error.message);
      toast.success("Собствеността е прехвърлена");
      setTransferOpen(false);
      setTransferConfirm("");
      setTransferTo("");
      await load();
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (!members) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border/40 p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48" /></div>
          </div>
        ))}
      </div>
    );
  }

  const otherMembers = members.filter((m) => m.user_id !== currentUserId && m.role !== "owner");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {members.length} от {seatCount} места заети
        </div>
        {currentRole !== "owner" && (
          <Button variant="outline" size="sm" onClick={() => setLeaveOpen(true)}>
            <LogOut className="mr-2 h-4 w-4" /> Напусни екипа
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {members.map((m) => {
          const isMe = m.user_id === currentUserId;
          const canManage = isAdmin && !isMe && m.role !== "owner" && (isOwner || m.role === "member");
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-10 w-10">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.display_name || ""} />}
                  <AvatarFallback>{initials(m.display_name, m.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{m.display_name || m.email || m.user_id.slice(0, 8)}</span>
                    {isMe && <Badge variant="outline" className="text-xs">Вие</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "owner" ? "default" : "secondary"} className="gap-1">
                  {m.role === "owner" && <Crown className="h-3 w-3" />}
                  {m.role === "admin" && <Shield className="h-3 w-3" />}
                  {ROLE_LABEL[m.role]}
                </Badge>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Управление</DropdownMenuLabel>
                      {isOwner && m.role === "member" && (
                        <DropdownMenuItem disabled={busy} onClick={() => changeRole(m, "admin")}>
                          <Shield className="mr-2 h-4 w-4" /> Направи администратор
                        </DropdownMenuItem>
                      )}
                      {isOwner && m.role === "admin" && (
                        <DropdownMenuItem disabled={busy} onClick={() => changeRole(m, "member")}>
                          <Users className="mr-2 h-4 w-4" /> Премахни администраторски достъп
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={busy} className="text-destructive" onClick={() => setRemoveTarget(m)}>
                        <UserMinus className="mr-2 h-4 w-4" /> Премахни от екипа
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {isOwner && otherMembers.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="text-sm font-semibold text-destructive">Опасна зона</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Прехвърлянето на собствеността е окончателно. След това ще станете администратор.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setTransferOpen(true)}>
            Прехвърли собственост
          </Button>
        </div>
      )}

      {/* Remove confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Премахни от екипа</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.display_name || removeTarget?.email} ще загуби достъп до споделените документи на екипа.
              Местата в Stripe не се променят автоматично.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отказ</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => removeTarget && removeMember(removeTarget)}>Премахни</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave confirm */}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Напуснете екипа?</AlertDialogTitle>
            <AlertDialogDescription>
              Ще загубите достъп до споделените документи и контакти. Можете да бъдете поканени отново.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отказ</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={leave}>Напусни</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer ownership */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Прехвърли собственост</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Нов собственик</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
              >
                <option value="">Изберете член…</option>
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email || m.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>За потвърждение въведете името на екипа: <strong>{teamName}</strong></Label>
              <Input value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} placeholder={teamName} />
            </div>
            <Button
              disabled={busy || !transferTo || transferConfirm.trim() !== teamName.trim()}
              className="w-full"
              variant="destructive"
              onClick={transferOwnership}
            >Прехвърли собственост</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
