import { useState } from "react";
import { Loader2, Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

interface Props {
  documentId: string;
  documentTitle: string;
}

export function ShareForSignDialog({ documentId, documentTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setLoading(true);
    setLink(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-share-link", {
        body: { document_id: documentId, expires_in_days: Number(days) },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let body: any = null;
        try { if (ctx?.json) body = await ctx.json(); } catch {}
        if (body?.error === "pro_required") {
          toast.error("Тази функция е достъпна само за Pro потребители.");
        } else {
          toast.error(body?.message ?? "Неуспешно създаване на линк");
        }
        return;
      }
      if (data?.error) {
        toast.error(data.message ?? "Неуспешно създаване на линк");
        return;
      }
      const url = `${window.location.origin}/share/${data.token}`;
      setLink(url);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Линкът е копиран");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setLink(null); setCopied(false); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Share2 className="mr-1 h-3 w-3" /> Сподели
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сподели за подпис</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Генерирайте публичен линк към <span className="font-medium text-foreground">{documentTitle}</span>.
            Получателят може да прегледа и подпише документа без регистрация.
          </p>
          {!link ? (
            <>
              <div>
                <Label htmlFor="days">Валидност</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger id="days"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 ден</SelectItem>
                    <SelectItem value="3">3 дни</SelectItem>
                    <SelectItem value="7">7 дни</SelectItem>
                    <SelectItem value="14">14 дни</SelectItem>
                    <SelectItem value="30">30 дни</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button onClick={create} disabled={loading} className="bg-gradient-gold text-navy">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                  Генерирай линк
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Линк за споделяне</Label>
              <div className="flex gap-2">
                <Input readOnly value={link} className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Изпратете го на контрагента по имейл или Viber. Подписът ще се запази в системата.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
