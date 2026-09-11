/**
 * Подробната проверка — това, което човекът наистина чете.
 *
 * Всичко на екрана идва от проверения сървърен резултат: няма примерни данни,
 * няма украса и няма измислени числа. Едно решение на екран: първо заключение,
 * после най-важното, после находките.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SEVERITY_LABELS_BG } from "@/lib/productResults";
import { ECONOMIC_KIND_LABELS_BG, PARTY_LABELS_BG } from "@/lib/productResultLabels";
import type {
  ContractCheckResult,
  ContractImproveResult,
  NegotiationPackageResult,
  ResultSeverity,
  SourceSpan,
} from "../../../supabase/functions/_shared/product-result-contract";

type ReviewLike = ContractCheckResult | ContractImproveResult | NegotiationPackageResult;

const SEVERITY_ORDER: ResultSeverity[] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_TONE: Record<ResultSeverity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-gold/15 text-gold-foreground border-gold/30",
  low: "bg-muted text-muted-foreground border-border",
  info: "bg-muted text-muted-foreground border-border",
};

export function spanPlaceBg(span: Pick<SourceSpan, "page" | "section">): string {
  const parts: string[] = [];
  if (span.section) parts.push(span.section);
  if (typeof span.page === "number") parts.push(`стр. ${span.page}`);
  return parts.length > 0 ? parts.join(", ") : "в текста на документа";
}

/** Извадка от документа — винаги видима до твърдението. */
export function Excerpt({ span }: { span: SourceSpan }) {
  return (
    <figure className="mt-3 rounded-md border border-border bg-muted/40 p-3">
      <blockquote className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        „{span.excerpt}“
      </blockquote>
      <figcaption className="mt-2 text-xs text-muted-foreground">{spanPlaceBg(span)}</figcaption>
    </figure>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold md:text-xl">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Разпределение на находките по тежест — от реалните данни, без украса. */
function SeveritySummary({ counts, total }: { counts: Record<ResultSeverity, number>; total: number }) {
  if (total === 0) return null;
  return (
    <ul className="mt-4 space-y-2">
      {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
        <li key={s} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm">{SEVERITY_LABELS_BG[s]}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-gold"
              style={{ width: `${Math.round((counts[s] / total) * 100)}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-sm tabular-nums">{counts[s]}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReviewResult({
  result,
  wholeDocumentCovered,
  onFindingOpened,
}: {
  result: ReviewLike;
  /** Успокоение „нищо не е намерено“ само когато проверката е върху целия документ. */
  wholeDocumentCovered: boolean;
  onFindingOpened?: (severity: ResultSeverity) => void;
}) {
  const p = result.payload;
  const [openFinding, setOpenFinding] = useState<string>("");

  const counts = useMemo(() => {
    const base = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<ResultSeverity, number>;
    for (const f of p.findings) base[f.severity] += 1;
    return base;
  }, [p.findings]);

  const priorities = useMemo(
    () => [...p.priority_summary].sort((a, b) => a.rank - b.rank),
    [p.priority_summary],
  );
  const findingsById = useMemo(
    () => new Map(p.findings.map((f) => [f.id, f])),
    [p.findings],
  );

  return (
    <div>
      <Card className="p-5 md:p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {p.passport.document_type}
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight md:text-3xl">
          {p.passport.title}
        </h1>
        <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{p.executive_summary}</p>
        <SeveritySummary counts={counts} total={p.findings.length} />
        {p.findings.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Започнете от най-важното по-долу и вижте точното място в документа.
          </p>
        )}
      </Card>

      <Section title="Данни за документа">
        <Card className="divide-y divide-border p-0">
          {p.passport.parties.map((party, i) => (
            <div key={`${party.role}-${i}`} className="p-4">
              <p className="text-sm text-muted-foreground">{party.role}</p>
              <p className="text-sm font-medium">{party.name ?? "не е посочено в текста"}</p>
            </div>
          ))}
          {p.passport.governing_law && (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">Приложимо право</p>
              <p className="text-sm font-medium">{p.passport.governing_law}</p>
            </div>
          )}
          {p.passport.signature_state && (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">Подписи</p>
              <p className="text-sm font-medium">{p.passport.signature_state}</p>
            </div>
          )}
        </Card>
      </Section>

      {priorities.length > 0 && (
        <Section title="Най-важното">
          <ol className="space-y-3">
            {priorities.map((item) => (
              <li key={item.finding_id} className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">
                  {item.rank}. {findingsById.get(item.finding_id)?.title ?? "Находка"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title={`Находки (${p.findings.length})`}>
        {p.findings.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            {wholeDocumentCovered
              ? "Проверката обхвана целия документ и не откри проблеми в него."
              : "Няма находки за показване."}
          </Card>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={openFinding}
            onValueChange={(value) => {
              setOpenFinding(value);
              const finding = p.findings.find((f) => f.id === value);
              if (finding) onFindingOpened?.(finding.severity);
            }}
            className="space-y-3"
          >
            {p.findings.map((f) => (
              <AccordionItem
                key={f.id}
                value={f.id}
                className="rounded-lg border border-border px-4"
              >
                <AccordionTrigger className="min-h-[44px] py-4 text-left">
                  <span className="flex flex-1 flex-col gap-2 pr-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-medium">{f.title}</span>
                    <Badge variant="outline" className={SEVERITY_TONE[f.severity]}>
                      {SEVERITY_LABELS_BG[f.severity]}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed">{f.explanation}</p>
                  <p className="mt-3 text-sm">
                    <span className="font-medium">Какво следва: </span>
                    {f.consequence}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Какво да направите: </span>
                    {f.next_step}
                  </p>
                  <Excerpt span={f.span} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </Section>

      {p.obligations.length > 0 && (
        <Section title="Задължения">
          <ul className="space-y-3">
            {p.obligations.map((o) => (
              <li key={o.id} className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">{PARTY_LABELS_BG[o.party]}</p>
                <p className="mt-1 text-sm">{o.summary}</p>
                {o.deadline && <p className="mt-1 text-sm text-muted-foreground">Срок: {o.deadline}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.economic_terms.length > 0 && (
        <Section title="Пари, срокове и неустойки">
          <ul className="grid gap-3 sm:grid-cols-2">
            {p.economic_terms.map((t) => (
              <li key={t.id} className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">{ECONOMIC_KIND_LABELS_BG[t.kind]}</p>
                <p className="mt-1 text-sm font-medium">{t.label}</p>
                <p className="mt-1 text-sm">{t.value_text}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Прекратяване и спорове">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-sm font-semibold">Прекратяване</h3>
            <p className="mt-2 text-sm">{p.termination.summary}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold">Спорове</h3>
            <p className="mt-2 text-sm">{p.disputes.summary}</p>
          </Card>
        </div>
      </Section>

      {p.contradictions.length > 0 && (
        <Section title="Противоречия в текста">
          <ul className="space-y-3">
            {p.contradictions.map((c) => (
              <li key={c.id} className="rounded-lg border border-border p-4">
                <p className="text-sm">{c.summary}</p>
                {c.spans.map((span, i) => (
                  <Excerpt key={`${c.id}-${i}`} span={span} />
                ))}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.missing_protections.length > 0 && (
        <Section title="Липсващи защити">
          <ul className="space-y-3">
            {p.missing_protections.map((m) => (
              <li key={m.id} className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">{m.title}</p>
                <p className="mt-1 text-sm">{m.why_it_matters}</p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">Какво следва: </span>
                  {m.consequence}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">Какво да направите: </span>
                  {m.next_step}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.questions.length > 0 && (
        <Section title="Въпроси преди подпис">
          <ol className="space-y-3">
            {p.questions.map((q) => (
              <li key={q.id} className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">{q.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{q.why}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
