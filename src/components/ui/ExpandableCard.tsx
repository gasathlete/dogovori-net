import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Generic "See more" wrapper using the grid-template-rows 0fr → 1fr trick
 * for a JS-free smooth height transition. Children of `expandedContent`
 * appear under a chevron toggle.
 */
export function ExpandableCard({
  children,
  expandedContent,
  triggerLabel = "Виж детайли",
  triggerLabelOpen = "Скрий",
  triggerClassName,
  className,
  initialOpen = false,
}: {
  children: ReactNode;
  expandedContent: ReactNode;
  triggerLabel?: string;
  triggerLabelOpen?: string;
  triggerClassName?: string;
  className?: string;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div className={className}>
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className={cn(
          "mt-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/80 transition-colors hover:text-gold focus-visible:text-gold",
          triggerClassName,
        )}
      >
        {open ? triggerLabelOpen : triggerLabel}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "pt-3 transition-opacity duration-300 motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {expandedContent}
          </div>
        </div>
      </div>
    </div>
  );
}
