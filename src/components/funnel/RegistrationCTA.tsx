import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { registrationTarget, SIGNUP_LABEL } from "@/lib/registrationFunnel";
import { trackMetric } from "@/lib/metrics";

export function RegistrationCTA({ source, destination, className, id }: {
  source: "header" | "hero" | "plans_section" | "footer" | "sticky" | "story";
  destination?: string;
  className?: string;
  id?: string;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const intended = destination ?? (location.pathname === "/" ? "/build" : location.pathname + location.search);
  if (loading) return null;
  return <Button asChild id={id} className={className ?? "btn-gold min-h-11"}>
    <Link data-registration-cta={source} to={user ? "/build" : registrationTarget(intended)}
      onClick={() => trackMetric("registration_cta_clicked", { source, authenticated: Boolean(user) })}>
      {user ? "Изгответе документ" : SIGNUP_LABEL}
    </Link>
  </Button>;
}