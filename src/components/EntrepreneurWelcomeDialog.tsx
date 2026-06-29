import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Sparkles, ArrowRight, Check, MessageSquare, ShieldCheck } from "lucide-react";

const STORAGE_KEY = "dgv:entrepreneur:welcomed:v1";

const FEATURES = [
  { icon: Sparkles, title: "GPT-5 модел", desc: "Най-добрият AI за правни анализи и преговорни стратегии." },
  { icon: MessageSquare, title: "AI преговорни тактики", desc: "Готови контра-аргументи за всяка проблемна клауза." },
  { icon: ShieldCheck, title: "100 операции / месец", desc: "Генериране, анализ, корекции, чат — всичко включено." },
];

export function EntrepreneurWelcomeDialog({ isPro }: { isPro: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isPro) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    // Small delay so the page settles first.
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [isPro]);

  const dismiss = (markDone = true) => {
    if (markDone) window.localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss(true)}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className="relative bg-gradient-gold/10 px-6 pb-4 pt-7 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-gold text-navy shadow-gold">
            <Crown className="h-7 w-7" />
          </div>
          <DialogHeader className="mt-3">
            <DialogTitle className="font-serif text-2xl">Добре дошли в Предприемач 🎉</DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-sm text-muted-foreground">
            3 бързи стъпки, за да усетите пълната мощ на плана за първите 5 минути.
          </p>
        </div>

        <div className="space-y-3 px-6 pb-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                <f.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-300" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 px-6 pb-6 pt-3 sm:flex-row">
          <Button asChild className="flex-1 bg-gradient-gold text-navy hover:shadow-gold">
            <Link to="/catalog" onClick={() => dismiss(true)}>
              Започни с първи договор <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => dismiss(true)}>
            Разгледай профила
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
