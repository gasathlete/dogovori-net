import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Wraps content that should be visible to everyone but copy-protected
 * for guests. Authenticated users get normal selection.
 */
export function ProtectedContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { user } = useAuth();
  const guest = !user;

  const blockEvent = (e: React.SyntheticEvent) => {
    e.preventDefault();
    toast.message(
      guest ? "Влезте, за да свалите договора" : "Текстът е защитен — свалете PDF/DOCX",
      {
        description: guest
          ? "Безплатна регистрация на /auth."
          : "Прегледът не може да се копира. Използвайте бутона за сваляне.",
      },
    );
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        onCopy={blockEvent}
        onCut={blockEvent}
        onContextMenu={blockEvent}
        onDragStart={blockEvent as any}
        style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
      >
        {children}
      </div>
      {guest && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden"
        >
          <div className="rotate-[-22deg] whitespace-nowrap font-serif text-5xl font-bold text-gold/[0.06] md:text-7xl">
            dogovori.net · preview
          </div>
        </div>
      )}
    </div>
  );
}
