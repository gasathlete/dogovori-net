import { Link } from "react-router-dom";
import { Bird, Crown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AssistantPaywall() {
  return (
    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-border/60 bg-card/40 p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15">
          <Bird className="h-7 w-7 text-gold" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">AI Асистент 24/7</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Личен правен помощник, който отговаря на въпроси за договори, закони и платформата —
          денонощно, на български език.
        </p>
        <ul className="mb-6 space-y-2 text-left text-sm text-muted-foreground">
          {[
            "Помощ с попълване на шаблони и клаузи",
            "Общи насоки по ЗЗД, ТЗ, КТ, СК, ЗУТ, GDPR",
            "Навигация и техническа поддръжка",
            "100 съобщения/месец (PRO) или споделени за екип",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Button asChild className="w-full gap-2 bg-gold text-navy hover:bg-gold/90">
          <Link to="/account?tab=billing">
            <Crown className="h-4 w-4" /> Активирай PRO
          </Link>
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Достъпно за PRO и Team абонати.
        </p>
      </div>
    </div>
  );
}
