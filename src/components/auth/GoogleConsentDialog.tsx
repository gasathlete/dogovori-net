import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface GoogleConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (marketing: boolean) => void;
  busy?: boolean;
}

export function GoogleConsentDialog({ open, onOpenChange, onConfirm, busy }: GoogleConsentDialogProps) {
  const [age, setAge] = useState(true);
  const [terms, setTerms] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const [marketing, setMarketing] = useState(true);

  useEffect(() => {
    if (open) {
      setAge(true);
      setTerms(true);
      setPrivacy(true);
      setMarketing(true);
    }
  }, [open]);

  const ready = age && terms && privacy && marketing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Продължи с Google</DialogTitle>
          <DialogDescription>
            Ако нямате профил, ще създадем нов с вашия Google имейл. Моля, потвърдете задължителните условия, преди да продължите.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-border/60 bg-card/30 p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="g-age"
              checked={age}
              onCheckedChange={(v) => setAge(!!v)}
              className="mt-0.5"
            />
            <Label htmlFor="g-age" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
              Потвърждавам, че съм навършил/а <strong>18 години</strong>. <span className="text-gold">*</span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="g-terms"
              checked={terms}
              onCheckedChange={(v) => setTerms(!!v)}
              className="mt-0.5"
            />
            <Label htmlFor="g-terms" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
              Прочетох и приемам{" "}
              <Link to="/terms" target="_blank" className="text-gold hover:underline">
                Общите условия
              </Link>{" "}
              на Dogovori.net. <span className="text-gold">*</span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="g-privacy"
              checked={privacy}
              onCheckedChange={(v) => setPrivacy(!!v)}
              className="mt-0.5"
            />
            <Label htmlFor="g-privacy" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
              Прочетох и приемам{" "}
              <Link to="/privacy" target="_blank" className="text-gold hover:underline">
                Политиката за поверителност
              </Link>{" "}
              и обработката на личните ми данни съгласно GDPR. <span className="text-gold">*</span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="g-mkt"
              checked={marketing}
              onCheckedChange={(v) => setMarketing(!!v)}
              className="mt-0.5"
            />
            <Label htmlFor="g-mkt" className="cursor-pointer text-[11px] font-normal leading-relaxed text-foreground">
              Съгласявам се да предоставя име и имейл на администратора на платформата за получаване на съобщения, известия за бонуси и награди в профила ми в dogovori.net. <span className="text-gold">*</span>
            </Label>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => onConfirm(marketing)}
          disabled={!ready || busy}
          className="btn-sheen w-full bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Продължи с Google
        </Button>
        <p className="text-[10px] text-center text-muted-foreground">
          Ако вече имате профил, ще влезете директно — съгласията се запазват само за нови потребители.
        </p>
      </DialogContent>
    </Dialog>
  );
}
