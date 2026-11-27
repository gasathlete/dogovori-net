import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "@/icons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * After a user signs up/in via Google (or any OAuth provider), we ask them to
 * confirm/choose a display name on the first page they land on. We do not show
 * this on /auth itself. Once submitted, we flag `user_metadata.username_chosen`
 * so it never appears again.
 */
export function UsernamePrompt() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (location.pathname.startsWith("/auth")) return;
    if (location.pathname.startsWith("/reset-password")) return;

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const provider = (user.app_metadata as any)?.provider as string | undefined;
    const isOAuth = !!provider && provider !== "email";
    const alreadyChosen = meta.username_chosen === true;

    if (isOAuth && !alreadyChosen) {
      const suggested =
        (meta.display_name as string) ||
        (meta.name as string) ||
        (meta.full_name as string) ||
        (user.email ? user.email.split("@")[0] : "");
      setName(suggested);
      setOpen(true);
    }
  }, [user, loading, location.pathname]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Моля, въведете поне 2 символа");
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      const { error: metaErr } = await supabase.auth.updateUser({
        data: { display_name: trimmed, username_chosen: true },
      });
      if (metaErr) throw metaErr;

      toast.success("Готово!");
      setOpen(false);
    } catch (e: any) {
      toast.error("Грешка при запис", { description: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { /* block close until saved */ if (!v) return; setOpen(v); }}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Изберете потребителско име</DialogTitle>
          <DialogDescription>
            Това име ще се показва в профила ви и в документите. Можете да го промените по-късно от настройките на профила.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="username-prompt">Потребителско име</Label>
            <Input
              id="username-prompt"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={busy || name.trim().length < 2}
            className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Запази и продължи
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
