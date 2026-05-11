import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmitted?: () => void;
};

export function PartnerSubmitDialog({ open, onOpenChange, onSubmitted }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setWebsite("");
    setFile(null);
  };

  const submit = async () => {
    if (!user) {
      toast.error("Моля, влезте в профила си първо");
      onOpenChange(false);
      navigate("/auth");
      return;
    }
    if (!name.trim()) return toast.error("Въведете име на фирмата");
    if (!file) return toast.error("Качете лого");
    if (file.size > 2 * 1024 * 1024) return toast.error("Логото трябва да е до 2MB");
    if (!file.type.startsWith("image/")) return toast.error("Файлът трябва да е изображение");

    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("partner-logos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("partner-logos").getPublicUrl(path);

      const { error: insErr } = await supabase.from("partners").insert({
        name: name.trim(),
        website_url: website.trim() || null,
        logo_url: pub.publicUrl,
        submitted_by: user.id,
        status: "pending",
      });
      if (insErr) throw insErr;

      toast.success("Заявката Ви е изпратена за одобрение");
      reset();
      onOpenChange(false);
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e.message || "Грешка при изпращане");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Регистрирайте Вашата фирма</DialogTitle>
          <DialogDescription>
            Изпратете името, логото и линка си. След одобрение от модератор, логото Ви ще се появи в партньорската лента.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="p-name">Име на фирмата</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="p-web">Уебсайт (по избор)</Label>
            <Input id="p-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label htmlFor="p-logo" className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Лого (PNG/SVG/JPG, до 2MB)
            </Label>
            <Input
              id="p-logo"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Отказ</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Изпрати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
