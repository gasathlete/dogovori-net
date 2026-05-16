import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { hasAIDisclaimerLocal, setAIDisclaimerLocal, recordConsents } from "@/lib/consents";

/**
 * Shown once per user/browser when entering an AI-generation flow
 * (Wizard, BuildContract). User must acknowledge that the generated
 * documents are AI samples and not legal advice.
 */
export function AIDisclaimerModal() {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!hasAIDisclaimerLocal()) setOpen(true);
  }, []);

  const handleAccept = async () => {
    if (!accepted) return;
    setAIDisclaimerLocal();
    setOpen(false);
    // Fire and forget — record only if logged in.
    recordConsents([{ consent_type: "ai_disclaimer", granted: true }]).catch(() => undefined);
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* not dismissible without acceptance */ }}>
      <DialogContent
        className="sm:max-w-lg [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-wider text-gold">
            <Sparkles className="h-3 w-3" /> Информация за AI
          </div>
          <DialogTitle className="font-serif text-2xl">Преди да започнете</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground/90">
            Генерираните документи са образци, създадени с моделиран по българското
            законодателство изкуствен интелект и <strong>не представляват правен съвет</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs text-muted-foreground">
          <p>
            Текстовете се изготвят автоматично въз основа на въведените от Вас данни.
            Препоръчваме окончателен преглед от практикуващ юрист преди подписване,
            особено при високи стойности, сложни хипотези или регулирани сектори.
          </p>
          <p>
            Повече за нашия подход и ограничения вижте в{" "}
            <Link to="/terms" className="text-gold underline-offset-2 hover:underline">
              Общите условия
            </Link>{" "}
            и{" "}
            <Link to="/privacy" className="text-gold underline-offset-2 hover:underline">
              Политиката за поверителност
            </Link>.
          </p>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-md border border-gold/30 bg-card/50 p-3">
          <Checkbox
            id="ai-ack"
            checked={accepted}
            onCheckedChange={(v) => setAccepted(!!v)}
            className="mt-0.5"
          />
          <Label htmlFor="ai-ack" className="cursor-pointer text-xs leading-relaxed text-foreground">
            Разбирам и приемам, че документите се генерират от изкуствен интелект и не
            заместват консултация с адвокат.
          </Label>
        </div>

        <Button
          onClick={handleAccept}
          disabled={!accepted}
          className="mt-4 w-full bg-gradient-gold text-navy hover:shadow-gold"
        >
          Продължи
        </Button>
      </DialogContent>
    </Dialog>
  );
}
