import { useState } from "react";
import { Headphones, Send, Loader2 } from "@/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const URGENCY = [
  { value: "normal", label: "Стандартно (≤ 1 раб. ден)" },
  { value: "high", label: "Спешно (≤ 4 часа)" },
  { value: "incident", label: "Инцидент / прекъсване" },
];

export function TeamManagerContact({
  teamId,
  teamName,
  defaultEmail,
  defaultName,
}: {
  teamId: string;
  teamName: string;
  defaultEmail?: string | null;
  defaultName?: string | null;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!email || !subject || !message) {
      toast.error("Попълнете имейл, тема и съобщение");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("team-manager-contact", {
        body: {
          teamId,
          contactName: name,
          contactEmail: email,
          subject,
          message,
          urgency,
        },
      });
      if (error) throw new Error(error.message);

      toast.success("Изпратено — акаунт мениджърът ще се свърже с вас.");
      setSubject("");
      setMessage("");
    } catch (e: any) {
      toast.error(e.message ?? "Грешка при изпращане");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold/30 bg-gradient-card p-6">
      <div className="flex items-center gap-2">
        <Headphones className="h-5 w-5 text-gold" />
        <h2 className="font-serif text-xl font-bold">Свържи се с акаунт мениджър</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Включено в плана Екип. Получавате персонален отговор от старши консултант — без чат бот.
      </p>

      <div className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Вашето име</Label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" />
          </div>
          <div>
            <Label className="text-xs">Имейл за отговор</Label>
            <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="вие@firma.bg" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Спешност</Label>
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {URGENCY.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Тема</Label>
          <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="напр. Промяна на места, фактуриране, нова интеграция" maxLength={140} />
        </div>
        <div>
          <Label className="text-xs">Съобщение</Label>
          <Textarea className="mt-1" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Опишете заявката си с конкретика…" />
          <div className="mt-1 text-right text-[11px] text-muted-foreground">{message.length}/2000</div>
        </div>
        <div className="flex justify-end">
          <Button disabled={sending} onClick={send} className="bg-gradient-gold text-navy hover:shadow-gold">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Изпрати
          </Button>
        </div>
      </div>
    </div>
  );
}
