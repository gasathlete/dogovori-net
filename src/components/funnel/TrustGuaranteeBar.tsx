import { ShieldCheck, CreditCard, RotateCcw, Lock, Headphones } from "@/icons";

type Item = { icon: React.ComponentType<{ className?: string }>; title: string; sub: string };

const ITEMS: Item[] = [
  { icon: CreditCard, title: "Без карта", sub: "5 безпл. операции през първите 30 дни" },
  { icon: RotateCcw, title: "Отказ по всяко време", sub: "Един клик от профила" },
  { icon: ShieldCheck, title: "ДДС включено", sub: "Прозрачни цени в евро" },
  { icon: Lock, title: "GDPR & TLS 1.3", sub: "Криптиране в покой и при пренос" },
  { icon: Headphones, title: "Поддръжка на БГ", sub: "Отговор < 24 ч. в раб. дни" },
];

/**
 * Compact trust strip used near pricing decisions and inside the AuthGate.
 * Emerald accents — matches the new plans branding.
 */
export function TrustGuaranteeBar({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
          : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      }
      role="list"
      aria-label="Гаранции и сигурност"
    >
      {ITEMS.map(({ icon: Icon, title, sub }) => (
        <div
          key={title}
          role="listitem"
          className="flex items-start gap-2.5 border-t border-border py-4"
        >
          <span className="mt-0.5 flex shrink-0 items-center text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-foreground">{title}</div>
            <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TrustGuaranteeBar;
