import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { WorkStateShell } from "@/components/workspace/WorkStateShell";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <WorkStateShell
          testId="protected-loading"
          tone="loading"
          eyebrow="Dogovori.net"
          title="Отваряме профила Ви"
          description="Проверяваме дали сте влезли в акаунта си."
        />
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}
