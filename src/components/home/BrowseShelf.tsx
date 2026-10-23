import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "@/icons";

/** Native horizontal browsing: manual, keyboard operable and motion-aware. */
export function BrowseShelf({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const move = (direction: number) => {
    const shelf = ref.current;
    if (!shelf) return;
    const first = shelf.firstElementChild;
    const distance = first ? first.getBoundingClientRect().width + 20 : shelf.clientWidth;
    shelf.scrollBy({ left: direction * distance, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div className="mt-7 min-w-0"><div className="mb-4 flex items-center justify-between gap-4"><span /><div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" className="size-11" aria-label={`Назад: ${label}`} onClick={() => move(-1)}><ArrowLeft /></Button><Button variant="outline" size="icon" className="size-11" aria-label={`Напред: ${label}`} onClick={() => move(1)}><ArrowRight /></Button></div></div><ul ref={ref} tabIndex={0} aria-label={label} className="browse-shelf" onKeyDown={(e) => { if (e.target !== e.currentTarget || !["ArrowLeft", "ArrowRight"].includes(e.key)) return; e.preventDefault(); move(e.key === "ArrowRight" ? 1 : -1); }}>{children}</ul></div>;
}