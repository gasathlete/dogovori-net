import { useState, useEffect, type ReactNode } from "react";
import { Info, AlertTriangle, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "subtle" | "warning" | "danger";

interface Props {
  variant?: Variant;
  /** Unique key used to remember dismissal in localStorage. Omit to make it non-dismissible. */
  storageKey?: string;
  className?: string;
  children: ReactNode;
}

const STYLES: Record<Variant, { wrap: string; icon: typeof Info }> = {
  subtle:  { wrap: "border-border/60 bg-muted/40 text-muted-foreground", icon: Info },
  warning: { wrap: "border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200", icon: AlertTriangle },
  danger:  { wrap: "border-red-400/50 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-200", icon: ShieldAlert },
};

/**
 * Discrete legal-style banner. Renders nothing if the user previously dismissed it
 * (when storageKey is provided). Used for KEP, cash payment, PDF OCR, etc.
 */
export function LegalDisclaimer({ variant = "subtle", storageKey, className, children }: Props) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    if (typeof window !== "undefined" && localStorage.getItem(`disclaimer:${storageKey}`) === "1") {
      setHidden(true);
    }
  }, [storageKey]);

  if (hidden) return null;

  const { wrap, icon: Icon } = STYLES[variant];

  const dismiss = () => {
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(`disclaimer:${storageKey}`, "1");
    }
    setHidden(true);
  };

  return (
    <div
      role="note"
      className={cn(
        "relative flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed",
        wrap,
        className,
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
      {storageKey && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрий"
          className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
