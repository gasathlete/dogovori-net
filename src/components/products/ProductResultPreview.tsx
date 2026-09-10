/**
 * Примерен резултат за всеки от трите еднократни продукта.
 *
 * Изграден е от истински DOM елементи — няма картинка, няма видео и няма
 * автоматична въртележка. Целият текст стои в страницата и на телефон, и на
 * десктоп; неактивните панели са само визуално скрити.
 *
 * Няма твърдение, че това е документът на посетителя, нито че резултатът е
 * запазен или платен.
 */
import { useId, useState } from "react";
import { FileText, ListChecks, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OneTimeProductId } from "@/lib/products";
import {
  CHECK_CONCLUSION,
  CHECK_FINDINGS,
  CHECK_LEDGER,
  CHECK_SEVERITY,
  IMPROVE_CLAUSE,
  IMPROVE_DELIVERABLES,
  IMPROVE_STRATEGIES,
  PACKAGE_ACTIONS,
  PACKAGE_FINAL,
  PACKAGE_LETTERS,
  PACKAGE_PLAN,
  PACKAGE_TABS,
  PREVIEW_NOTE,
  PREVIEW_TITLE,
  SAMPLE_DOC,
  type ImproveStrategyId,
  type PackageTabId,
} from "./previewData";

type Size = "compact" | "full";

const SEVERITY_TONE: Record<string, string> = {
  Висока: "border-destructive/40 bg-destructive/10 text-destructive",
  Средна: "border-gold/40 bg-gold/10 text-gold",
  Ниска: "border-border bg-muted text-muted-foreground",
};

function Frame({
  size,
  children,
  className,
}: {
  size: Size;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      data-testid="product-result-preview"
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm",
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold">
          {PREVIEW_TITLE}
        </span>
        <span className="text-[11px] text-muted-foreground">{PREVIEW_NOTE}</span>
      </figcaption>
      <div className={cn("px-4 py-4", size === "full" && "sm:px-6 sm:py-6")}>
        {children}
      </div>
    </figure>
  );
}

function DocHeader({ size }: { size: Size }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 border-b border-dashed border-border pb-3">
      <FileText className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {SAMPLE_DOC.title}
        </p>
        <p className="text-[12px] leading-snug text-muted-foreground">
          {SAMPLE_DOC.parties}
        </p>
        {size === "full" && (
          <p className="text-[12px] leading-snug text-muted-foreground">
            {SAMPLE_DOC.role} · {SAMPLE_DOC.size}
          </p>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Проверка ----------------------------- */

function CheckPreview({ size }: { size: Size }) {
  const findings = size === "compact" ? CHECK_FINDINGS.slice(0, 1) : CHECK_FINDINGS;

  return (
    <>
      <DocHeader size={size} />
      <h4 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        Заключение
      </h4>
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        {CHECK_CONCLUSION}
      </p>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {CHECK_SEVERITY.map((s) => (
          <li
            key={s.label}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[12px] font-medium tabular-nums",
              SEVERITY_TONE[s.label],
            )}
          >
            {s.label}: {s.count}
          </li>
        ))}
      </ul>

      <ol className="mt-4 space-y-3">
        {findings.map((f) => (
          <li
            key={f.title}
            className="rounded-xl border border-border bg-background p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  SEVERITY_TONE[f.severity],
                )}
              >
                {f.severity}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {f.title}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
              {f.consequence}
            </p>
            <p className="mt-1.5 text-[12px] font-medium text-muted-foreground">
              {f.location}
            </p>
            <blockquote className="mt-1 border-l-2 border-gold/50 pl-2.5 text-[13px] italic leading-relaxed text-muted-foreground">
              {f.excerpt}
            </blockquote>
            <p className="mt-2 text-[13px] leading-relaxed text-navy">
              <span className="font-semibold">Следваща стъпка: </span>
              {f.nextStep}
            </p>
          </li>
        ))}
      </ol>

      {size === "full" && (
        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <h4 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Пари, срокове и задължения
          </h4>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {CHECK_LEDGER.map((row) => (
              <div key={row.label} className="flex flex-wrap gap-x-2 text-[13px]">
                <dt className="font-medium text-muted-foreground">{row.label}:</dt>
                <dd className="text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Поправка ----------------------------- */

function ImprovePreview({ size }: { size: Size }) {
  const [active, setActive] = useState<ImproveStrategyId>("balanced");
  const groupId = useId();

  return (
    <>
      <DocHeader size={size} />
      <p className="text-[12px] font-medium text-muted-foreground">
        {IMPROVE_CLAUSE.location}
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-3">
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Преди
          </h4>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground line-through decoration-destructive/50">
            {IMPROVE_CLAUSE.before}
          </p>
        </div>
        <div className="rounded-xl border border-gold/40 bg-gold/[0.06] p-3">
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-gold">
            След
          </h4>
          {IMPROVE_STRATEGIES.map((s) => (
            <p
              key={s.id}
              hidden={s.id !== active}
              className="mt-1 text-[13px] leading-relaxed text-foreground"
            >
              {s.proposed}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p id={groupId} className="text-[13px] font-semibold text-foreground">
          Изберете вариант за тази клауза
        </p>
        <div
          role="radiogroup"
          aria-labelledby={groupId}
          className="mt-2 flex flex-wrap gap-2"
        >
          {IMPROVE_STRATEGIES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === active}
              onClick={() => setActive(s.id)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                s.id === active
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {IMPROVE_STRATEGIES.map((s) => (
          <p
            key={s.id}
            hidden={s.id !== active}
            className="mt-2 text-[13px] leading-relaxed text-muted-foreground"
          >
            <span className="font-semibold text-foreground">Компромисът: </span>
            {s.tradeoff}
          </p>
        ))}
      </div>

      {size === "full" && (
        <ul className="mt-4 space-y-1.5 border-t border-dashed border-border pt-3">
          {IMPROVE_DELIVERABLES.map((d) => (
            <li
              key={d}
              className="flex items-start gap-2 text-[13px] text-foreground"
            >
              <ListChecks
                className="mt-0.5 size-3.5 shrink-0 text-gold"
                aria-hidden="true"
              />
              {d}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------------------------- Пълен пакет ---------------------------- */

function PackagePreview({ size }: { size: Size }) {
  const [active, setActive] = useState<PackageTabId>("plan");
  const base = useId();

  return (
    <>
      <DocHeader size={size} />
      <div
        role="tablist"
        aria-label="Части от пакета за преговори"
        className="flex flex-wrap gap-2"
      >
        {PACKAGE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => setActive(t.id)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              t.id === active
                ? "border-gold bg-gold/15 text-gold"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-plan`}
        aria-labelledby={`${base}-tab-plan`}
        hidden={active !== "plan"}
        className="mt-3 grid gap-3 sm:grid-cols-2"
      >
        {PACKAGE_PLAN.map((block) => (
          <div
            key={block.heading}
            className="rounded-xl border border-border bg-background p-3"
          >
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {block.heading}
            </h4>
            <ul className="mt-1.5 space-y-1">
              {block.items.map((i) => (
                <li key={i} className="text-[13px] leading-relaxed text-foreground">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-actions`}
        aria-labelledby={`${base}-tab-actions`}
        hidden={active !== "actions"}
        className="mt-3 space-y-2"
      >
        {PACKAGE_ACTIONS.map((a) => (
          <div
            key={a.action}
            className="rounded-xl border border-border bg-background p-3"
          >
            <p className="text-[13px] font-semibold text-foreground">{a.action}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Кой: {a.owner} · Срок: {a.deadline} · {a.status}
            </p>
          </div>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-letters`}
        aria-labelledby={`${base}-tab-letters`}
        hidden={active !== "letters"}
        className="mt-3 space-y-2"
      >
        {PACKAGE_LETTERS.map((l) => (
          <div
            key={l.tone}
            className="rounded-xl border border-border bg-background p-3"
          >
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquareQuote className="size-3.5 text-gold" aria-hidden="true" />
              {l.tone}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
              {l.text}
            </p>
          </div>
        ))}
      </div>

      {size === "full" && (
        <ul className="mt-4 space-y-1.5 border-t border-dashed border-border pt-3">
          {PACKAGE_FINAL.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 text-[13px] text-foreground"
            >
              <ListChecks
                className="mt-0.5 size-3.5 shrink-0 text-gold"
                aria-hidden="true"
              />
              {f}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ProductResultPreview({
  productId,
  size = "full",
  className,
}: {
  productId: OneTimeProductId;
  size?: Size;
  className?: string;
}) {
  return (
    <Frame size={size} className={className}>
      {productId === "contract_check" && <CheckPreview size={size} />}
      {productId === "contract_improve" && <ImprovePreview size={size} />}
      {productId === "negotiation_package" && <PackagePreview size={size} />}
    </Frame>
  );
}
