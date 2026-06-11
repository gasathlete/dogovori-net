import { Link } from "react-router-dom";
import { FileText, ExternalLink, Wand2, Upload, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ToolEvent =
  | { kind: "tool_result"; id: string; name: string; args: any; result: any }
  | { kind: "tool_call"; id: string; name: string; args: any; status?: "pending" | "done" };

interface Props {
  event: ToolEvent;
}

export function AssistantToolCard({ event }: Props) {
  if (event.kind === "tool_result" && event.name === "search_templates") {
    const results: Array<{ slug: string; name: string; purpose: string; category: string }> = event.result?.results ?? [];
    if (results.length === 0) {
      return (
        <Card title="Търсене на шаблони">
          <p className="text-xs text-muted-foreground">Няма подходящи резултати за „{event.args?.query}".</p>
        </Card>
      );
    }
    return (
      <Card title={`Намерени шаблони (${results.length})`} icon={<FileText className="h-3.5 w-3.5 text-gold" />}>
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.slug}>
              <Link
                to={`/shablon/${r.slug}`}
                className="group flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5 text-xs transition-colors hover:border-gold/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{r.name}</div>
                  {r.purpose && <div className="truncate text-[10px] text-muted-foreground">{r.purpose}</div>}
                </div>
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-gold" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (event.kind === "tool_call") {
    if (event.name === "navigate") {
      return (
        <Card title="Навигация" icon={<ArrowRight className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">
            {event.args?.reason ? `${event.args.reason} → ` : "Отварям "}
            <code className="rounded bg-card/60 px-1 py-0.5 text-[10px] text-gold">{event.args?.path}</code>
          </p>
        </Card>
      );
    }
    if (event.name === "open_template") {
      return (
        <Card title="Отварям шаблон" icon={<FileText className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">
            Шаблон: <code className="rounded bg-card/60 px-1 py-0.5 text-[10px] text-gold">{event.args?.slug}</code>
          </p>
        </Card>
      );
    }
    if (event.name === "prefill_build_contract") {
      const a = event.args ?? {};
      return (
        <Card title="Стартирам wizard за договор" icon={<Wand2 className="h-3.5 w-3.5 text-gold" />}>
          <ul className="space-y-0.5 text-xs text-foreground">
            {a.name && <li>• <strong>Заглавие:</strong> {a.name}</li>}
            {a.documentType && <li>• <strong>Тип:</strong> {a.documentType}</li>}
            {a.partiesA && <li>• <strong>Страна А:</strong> {a.partiesA}</li>}
            {a.partiesB && <li>• <strong>Страна Б:</strong> {a.partiesB}</li>}
            {a.subject && <li>• <strong>Предмет:</strong> {a.subject}</li>}
            {a.bilingual && <li>• Двуезичен (BG/EN)</li>}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Прегледайте и редактирайте във wizard-а.</p>
        </Card>
      );
    }
    if (event.name === "open_upload_analyzer") {
      return (
        <Card title="Отварям анализатор" icon={<Upload className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">Качете PDF или DOCX за анализ.</p>
        </Card>
      );
    }
  }

  return null;
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="my-2 rounded-lg border border-gold/30 bg-gold/5 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}
