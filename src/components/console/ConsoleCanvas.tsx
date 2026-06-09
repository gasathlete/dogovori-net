import { lazy, Suspense, useMemo } from "react";
import { useConsoleStore, type ConsoleTab } from "@/hooks/useConsoleStore";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const DashboardPane = lazy(() => import("./panes/DashboardPane").then((m) => ({ default: m.DashboardPane })));
const DealPane = lazy(() => import("./panes/DealPane").then((m) => ({ default: m.DealPane })));
const DocumentPane = lazy(() => import("./panes/DocumentPane").then((m) => ({ default: m.DocumentPane })));
const UploadedPane = lazy(() => import("./panes/UploadedPane").then((m) => ({ default: m.UploadedPane })));
const ClientPane = lazy(() => import("./panes/ClientPane").then((m) => ({ default: m.ClientPane })));
const TemplatePane = lazy(() => import("./panes/TemplatePane").then((m) => ({ default: m.TemplatePane })));
const AnalysisPane = lazy(() => import("./panes/AnalysisPane").then((m) => ({ default: m.AnalysisPane })));
const SigningPane = lazy(() => import("./panes/SigningPane").then((m) => ({ default: m.SigningPane })));
const GenericPane = lazy(() => import("./panes/GenericPane").then((m) => ({ default: m.GenericPane })));

function PaneRouter({ tab }: { tab: ConsoleTab }) {
  switch (tab.kind) {
    case "dashboard":
      return <DashboardPane />;
    case "deal":
      return <DealPane dealId={tab.entityId!} tabId={tab.id} />;
    case "document":
      return <DocumentPane documentId={tab.entityId!} tabId={tab.id} />;
    case "uploaded":
      return <UploadedPane uploadedId={tab.entityId!} tabId={tab.id} />;
    case "client":
      return <ClientPane counterparty={tab.entityId!} />;
    case "template":
      return <TemplatePane slug={tab.entityId!} />;
    case "analysis":
      return <AnalysisPane analysisId={tab.entityId!} />;
    case "signing":
      return <SigningPane requestId={tab.entityId!} />;
    default:
      return <GenericPane title={tab.title} />;
  }
}

export function ConsoleCanvas() {
  const { state } = useConsoleStore();
  const active = state.activeId;
  return (
    <div className="relative flex-1 overflow-hidden bg-background">
      {state.tabs.map((tab) => (
        <div
          key={tab.id}
          aria-hidden={tab.id !== active}
          className={cn(
            "absolute inset-0 overflow-auto",
            tab.id === active ? "visible" : "invisible",
          )}
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <PaneRouter tab={tab} />
          </Suspense>
        </div>
      ))}
      {state.tabs.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Няма отворени табове.
        </div>
      )}
    </div>
  );
}
