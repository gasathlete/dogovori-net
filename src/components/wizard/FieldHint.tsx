import { Info } from "@/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Правна подсказка до етикета на поле.
 * Desktop → tooltip при hover/фокус; мобилно → popover при докосване.
 */
export function FieldHint({ hint }: { hint: string }) {
  return (
    <>
      {/* Desktop */}
      <span className="hidden md:inline-flex">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Правна подсказка"
                className="ml-1.5 inline-flex translate-y-[1px] text-muted-foreground transition-colors hover:text-gold focus-visible:text-gold"
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              {hint}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>

      {/* Mobile */}
      <span className="inline-flex md:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Правна подсказка"
              className="ml-1.5 inline-flex translate-y-[1px] text-muted-foreground"
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="max-w-[18rem] text-xs leading-relaxed">
            {hint}
          </PopoverContent>
        </Popover>
      </span>
    </>
  );
}
