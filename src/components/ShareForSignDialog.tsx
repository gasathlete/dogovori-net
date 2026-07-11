import { useState, type ReactNode } from "react";
import { Loader2, Share2, Copy, Check, Lock, Crown } from "@/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { useIsPro } from "@/hooks/useIsPro";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";

interface Props {
  documentId?: string;
  uploadedContractId?: string;
  documentTitle: string;
  triggerClassName?: string;
  /** Optional custom label for the trigger button (defaults to "Сподели"). */
  triggerLabel?: string;
  /** Optional custom icon node for the trigger button. */
  triggerIcon?: ReactNode;
}

export function ShareForSignDialog({ documentId, uploadedContractId, documentTitle, triggerClassName, triggerLabel, triggerIcon }: Props) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [upsellOpen, setUpsellOpen] = useState(false);
  const { isPro } = useIsPro();

  const reset = () => {
    setLink(null);
    setCopied(false);
    setPassword("");
    setUsePassword(false);
  };

  const create = async () => {
    if (usePassword && password.length < 4) {
      toast.error("Паролата трябва да е поне 4 символа");
      return;
    }
    setLoading(true);
    setLink(null);
    try {
      const body: Record<string, unknown> = { expires_in_days: Number(days) };
      if (uploadedContractId) body.uploaded_contract_id = uploadedContractId;
      else if (documentId) body.document_id = documentId;
      if (usePassword && password) body.password = password;
      const { data, error } = await supabase.functions.invoke("create-share-link", { body });
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
    const ok = await copyToClipboard(link);
    if (!ok) { toast.error("Копирането не е разрешено"); return; }
    setCopied(true);
    toast.success("Линкът е копиран");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className={cn(triggerClassName)}>
            {triggerIcon ?? <Share2 className="mr-1 h-3 w-3" />} {triggerLabel ?? "Сподели"}
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

                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-gold" />
                        <span className="font-medium">Защита с парола</span>
                        {!isPro && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                            <Crown className="h-3 w-3" /> Pro
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Получателят ще трябва да въведе паролата, преди да види документа.
                      </p>
                    </div>
                    <Switch
                      checked={usePassword}
                      onCheckedChange={(v) => {
                        if (v && !isPro) { setUpsellOpen(true); return; }
                        setUsePassword(v);
                        if (!v) setPassword("");
                      }}
                    />
                  </div>
                  {usePassword && (
                    <div className="mt-2">
                      <Input
                        type="text"
                        autoComplete="off"
                        placeholder="Парола (мин. 4 символа)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        maxLength={128}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Изпратете паролата на получателя по различен канал (напр. SMS/Viber), отделно от линка.
                      </p>
                    </div>
                  )}
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
                {usePassword && password && (
                  <div className="rounded-md border border-gold/30 bg-gold/5 p-2 text-xs">
                    <div className="flex items-center gap-1 font-medium text-gold">
                      <Lock className="h-3 w-3" /> Парола за достъп
                    </div>
                    <div className="mt-1 font-mono text-foreground">{password}</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Споделете я с получателя отделно от линка.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Изпратете линка на контрагента по имейл или Viber. Подписът ще се запази в системата.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ProUpgradeDialog open={upsellOpen} onOpenChange={setUpsellOpen} trigger="protected_share" />
    </>
  );
}
