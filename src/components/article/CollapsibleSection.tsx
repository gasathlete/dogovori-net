/**
 * CollapsibleSection — на телефон секцията е сгъната (но съдържанието остава в DOM за SEO),
 * на десктоп е винаги отворена.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "@/icons";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  id?: string;
  index?: number;
  heading: string;
  preview?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id,
  index,
  heading,
  preview,
  defaultOpen = false,
  children,
  className = "",
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(isMobile ? defaultOpen : true);
  }, [isMobile, defaultOpen]);

  return (
    <section id={id} className={"mt-8 md:mt-12 " + className}>
      <button
        type="button"
        onClick={() => isMobile && setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left md:pointer-events-none"
      >
        <h2 className="mb-0 font-serif text-xl font-bold leading-tight tracking-tight text-foreground md:mb-5 md:text-[28px]">
          {typeof index === "number" && (
            <span className="mr-2 font-serif text-sm font-normal text-gold/70">
              {String(index).padStart(2, "0")}
            </span>
          )}
          {heading}
        </h2>
        <ChevronDown
          className={
            "mt-1 h-5 w-5 shrink-0 text-gold transition-transform duration-200 md:hidden " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {!open && preview && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground md:hidden">
          {preview}
        </p>
      )}

      <div
        className={
          open
            ? "mt-3 md:mt-0"
            : "sr-only"
        }
      >
        {children}
      </div>

      {!open && (
        <div className="mt-3 h-px w-full bg-border/50 md:hidden" />
      )}
    </section>
  );
}
