import { useAuth } from "@/hooks/useAuth";
import { RegistrationCTA, type RegistrationSource } from "./RegistrationCTA";

/**
 * Quiet inline invitation at a natural value moment (no popup, no timer).
 * One per place; hidden for signed-in users and while auth is loading.
 */
export function RegistrationInvite({ source, destination, text }: {
  source: RegistrationSource;
  destination?: string;
  text: string;
}) {
  const { user, loading } = useAuth();
  if (loading || user) return null;
  return (
    <aside
      data-testid="registration-invite"
      aria-label="Безплатен профил"
      className="mb-10 flex flex-col gap-3 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="max-w-[52ch] text-sm leading-relaxed text-foreground">{text}</p>
      <RegistrationCTA source={source} destination={destination} variant="outline" className="min-h-11 shrink-0 border-foreground/50 px-5" />
    </aside>
  );
}
