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
  | "bulk_zip"
  | "protected_share"
  | "brand_watermark"
  | "negotiation_strategy"
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
    title: "Приложи всички корекции с платен план",
    description: (ctx) =>
      ctx?.count
        ? `${ctx.count} корекции са готови за прилагане. С платен план ги пускаш веднага — без да харчиш безплатна операция.`
        : "Готовите корекции се прилагат веднага с платен план — без да харчиш безплатна операция.",
  },
  ops_exhausted: {
    title: "Изчерпа безплатните операции за месеца",
    description: () =>
      "Безплатно: 5 операции при регистрация + 2/месец. 1 съобщение в DogovaryAI = 1 операция. Професионалист дава 50 операции/мес. за 12.90 €, Предприемач — 120 операции/мес. за 19.90 €.",
  },
  ai_limit: {
    title: "Достигна лимита на AI Асистента",
    description: () =>
      "1 съобщение = 1 операция. Професионалист: 50/мес.; Предприемач: 120/мес. + GPT-5; Екип: 100/място/мес.",
  },
  bilingual: {
    title: "Отключи пълните двуезични договори",
    description: () =>
      "Безплатно виждаш само BG колоната. Платен план отключва пълен EN/DE/FR превод с правна терминология.",
  },
  kit_slot: {
    title: "Управлявай неограничено комплекти",
    description: () =>
      "Безплатно имаш 1 активен комплект. Платен план дава неограничени комплекти и автоматично следене на изтичащи документи.",
  },
  risk_report: {
    title: "Виж пълния анализ на риска",
    description: () =>
      "Платен план отключва всички идентифицирани рискове и препоръки + auto-apply на всички с един клик.",
  },
  bulk_zip: {
    title: "Изтегли всичко в един ZIP",
    description: () =>
      "Безплатно изтегляш по един документ. С платен план — целия комплект или папка като ZIP, с обединено PDF и оригинали на едно място.",
  },
  protected_share: {
    title: "Защити линка с парола",
    description: () =>
      "Със споделените за подпис линкове можеш да изискваш парола, която изпращаш на получателя по различен канал. Парола + срок на валидност гарантират контрол върху достъпа.",
  },
  brand_watermark: {
    title: "Маркирай PDF с твоето лого",
    description: () =>
      "Качи логото на компанията си и то ще се появява като дискретен фирмен знак в горната част на всеки изтеглен договор — без воден знак на Dogovori.net.",
  },
  negotiation_strategy: {
    title: "Изготви стратегия за преговори (GPT-5)",
    description: () =>
      "Предприемач отключва AI стратег: силни позиции, възможни отстъпки, BATNA, готови реплики и контра-клаузи — на база реалния анализ на договора.",
  },
  generic: {
    title: "Платен план",
    description: () =>
      "От 50 до 120 операции/мес., неограничен AI Асистент (1 съобщение = 1 операция), двуезични договори и комплекти.",
  },

};

const FEATURES = [
  { icon: Zap, label: "50–120 операции / месец (1 съобщение = 1 операция)" },
  { icon: Sparkles, label: "Неограничен AI Асистент + GPT-5 (Предприемач)" },
  { icon: Crown, label: "Двуезични договори (EN / DE / FR)" },
  { icon: Check, label: "Неограничени комплекти документи и корекции" },
  { icon: Check, label: "Без воден знак на PDF" },
  { icon: Check, label: "Екип: мин. 3 места · 109 €/място/година" },
];

export function ProUpgradeDialog({ open, onOpenChange, trigger, context }: Props) {
  const navigate = useNavigate();
  const copy = TRIGGER_COPY[trigger];

  const goToBilling = (plan: "professional" | "entrepreneur", billing: "monthly" | "yearly") => {
    trackEvent("paywall_clicked", { trigger, plan, billing });
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "";
    const redirect =
      returnTo && !returnTo.startsWith("/account") && !returnTo.startsWith("/auth")
        ? `&redirect=${encodeURIComponent(returnTo)}`
        : "";
    onOpenChange(false);
    navigate(`/account?tab=subscription&plan=${plan}&billing=${billing}&promo=FIRST100${redirect}`);
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
            20% отстъпка — за нови абонати
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
            onClick={() => goToBilling("entrepreneur", "monthly")}
            className="w-full bg-gradient-gold text-navy hover:shadow-gold"
          >
            Предприемач — 19.90 € / месец (120 операции + GPT-5)
          </Button>
          <Button
            onClick={() => goToBilling("professional", "monthly")}
            variant="outline"
            className="w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            Професионалист — 12.90 € / месец (50 операции)
          </Button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Откажи по всяко време. Без скрити такси. ДДС включен.
        </p>
      </DialogContent>
    </Dialog>
  );
}
