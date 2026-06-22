import { Link } from "react-router-dom";
import { Bird, Crown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopupPacks } from "@/components/TopupPacks";
import { useIsPro } from "@/hooks/useIsPro";

export function AssistantPaywall() {
  const { isPro } = useIsPro();
  return (
    <div className="space-y-6 rounded-lg border border-border/60 bg-card/40 p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15">
          <Bird className="h-7 w-7 text-gold" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">Правен AI Асистент</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Личен правен помощник за договори, закони и платформата — на български език.
        </p>
        <ul className="mb-6 space-y-2 text-left text-sm text-muted-foreground">
          {[
            "1 съобщение = 1 операция (5 при регистрация + 2/мес. безплатно)",
            "Помощ с попълване на шаблони и клаузи",
            "Общи насоки по ЗЗД, ТЗ, КТ, СК, ЗУТ, GDPR",
            "Професионалист 12.90 €/мес. — 50 операции · Предприемач 19.90 €/мес. — 120 + GPT-5",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Button asChild className="w-full gap-2 bg-gold text-navy hover:bg-gold/90">
          <Link to="/account?tab=subscription">
            <Crown className="h-4 w-4" /> Активирай платен план
          </Link>
        </Button>
      </div>

      <div className="border-t border-border/60 pt-6">
        <div className="mb-3 text-center">
          <h4 className="text-sm font-semibold text-foreground">Top-up пакети</h4>
          <p className="text-xs text-muted-foreground">
            Зареди допълнителни операции без подновяване.
          </p>
        </div>
        <TopupPacks enabled={isPro} compact />
      </div>
    </div>
  );
}

