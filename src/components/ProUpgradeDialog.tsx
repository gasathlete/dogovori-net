/**
 * Unified Pro upgrade dialog. Every paywall touchpoint in the app routes
 * through this single component — keeps copy, pricing and promo consistent.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ProUpgradeDialog open={open} onOpenChange={setOpen} trigger="corrections" />
 */

import { useNavigate } from "react-router-dom";
import { Check, Crown, Sparkles, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

export type ProUpgradeTrigger =
  | "corrections"
  | "ops_exhausted"
  | "ai_limit"
  | "bilingual"
  | "kit_slot"
  | "risk_report"
  | "generic";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ProUpgradeTrigger;
  /** Optional dynamic data — e.g. number of pending corrections. */
  context?: { count?: number };
}

const TRIGGER_COPY: Record<
  ProUpgradeTrigger,
  { title: string; description: (ctx?: { count?: number }) => string }
> = {
  corrections: {
    title: "Приложи всички корекции с Pro",
    description: (ctx) =>
      ctx?.count
        ? `${ctx.count} корекции са готови за прилагане. С Pro ги пускаш веднага — без да харчиш безплатна операция.`
        : "Готовите корекции се прилагат веднага с Pro — без да харчиш безплатна операция.",
  },
  ops_exhausted: {
    title: "Изчерпа безплатния си лимит за месеца",
    description: () =>
      "Безплатният план включва 3 операции/месец. Pro дава 100 операции/мес и пълен достъп до AI асистента, двуезичните договори и комплектите.",
  },
  ai_limit: {
    title: "Достигна лимита на AI Асистента",
    description: () =>
      "5 безплатни съобщения/месец. Pro дава неограничен достъп до AI Асистента в рамките на 100 операции.",
  },
  bilingual: {
    title: "Отключи пълните двуезични договори",
    description: () =>
      "Безплатно виждаш само BG колоната. Pro отключва пълен EN/DE/FR превод с правна терминология.",
  },
  kit_slot: {
    title: "Управлявай неограничено комплекти",
    description: () =>
      "Безплатно имаш 1 активен комплект. Pro дава неограничени комплекти и автоматично следене на изтичащи документи.",
  },
  risk_report: {
    title: "Виж пълния анализ на риска",
    description: () =>
      "Pro отключва всички идентифицирани рискове и препоръки + auto-apply на всички с един клик.",
  },
  generic: {
    title: "Pro план",
    description: () =>
      "100 операции/мес, неограничен AI асистент, двуезични договори и комплекти.",
  },
};

const FEATURES = [
  { icon: Zap, label: "100 операции/месец" },
  { icon: Sparkles, label: "Неограничен AI Асистент" },
  { icon: Crown, label: "Пълен достъп до двуезични договори" },
  { icon: Check, label: "Неограничени комплекти документи" },
  { icon: Check, label: "Без воден знак на PDF" },
  { icon: Check, label: "Loyalty: 5–15% доживотна отстъпка" },
];

export function ProUpgradeDialog({ open, onOpenChange, trigger, context }: Props) {
  const navigate = useNavigate();
  const copy = TRIGGER_COPY[trigger];

  const goToBilling = (plan: "monthly" | "yearly") => {
    trackEvent("paywall_clicked", { trigger, plan });
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "";
    const redirect =
      returnTo && !returnTo.startsWith("/account") && !returnTo.startsWith("/auth")
        ? `&redirect=${encodeURIComponent(returnTo)}`
        : "";
    onOpenChange(false);
    navigate(`/account?tab=subscription&plan=${plan}&promo=FIRST100${redirect}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) trackEvent("paywall_shown", { trigger });
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md border-gold/30">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-gold">
            <Crown className="h-6 w-6 text-navy" />
          </div>
          <DialogTitle className="text-center font-serif text-xl">{copy.title}</DialogTitle>
          <DialogDescription className="text-center">
            {copy.description(context)}
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gold">
            Промо код FIRST100
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            30% отстъпка месечен · 40% отстъпка годишен — за нови абонати
          </div>
        </div>

        <ul className="space-y-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-start gap-2 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span className="text-foreground">{label}</span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            onClick={() => goToBilling("monthly")}
            className="w-full bg-gradient-gold text-navy hover:shadow-gold"
          >
            Pro — 9.90 € / месец
          </Button>
          <Button
            onClick={() => goToBilling("yearly")}
            variant="outline"
            className="w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            Pro годишно — 99 € (спести ~17%)
          </Button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Откажи по всяко време. Без скрити такси. ДДС включен.
        </p>
      </DialogContent>
    </Dialog>
  );
}
