import { Helmet } from "react-helmet-async";
import { ConsoleProvider, useConsoleShortcuts, useConsoleStore } from "@/hooks/useConsoleStore";
import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";
import { ConsoleListColumn } from "@/components/console/ConsoleListColumn";
import { ConsoleTabBar } from "@/components/console/ConsoleTabBar";
import { ConsoleCanvas } from "@/components/console/ConsoleCanvas";
import { ConsoleFooter } from "@/components/console/ConsoleFooter";
import { Header } from "@/components/Header";
import { AssistantChat } from "@/components/AssistantChat";

function ConsoleShell() {
  useConsoleShortcuts();
  const { state } = useConsoleStore();
  const isAssistant = state.section === "assistant";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
        <ConsoleSidebar />
        {isAssistant ? (
          <div className="flex flex-1 flex-col overflow-hidden p-3">
            <AssistantChat compact />
          </div>
        ) : (
          <>
            <ConsoleListColumn />
            <div className="flex flex-1 flex-col overflow-hidden">
              <ConsoleTabBar />
              <ConsoleCanvas />
              <ConsoleFooter />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Console() {
  return (
    <>
      <Helmet>
        <title>Console · Dogovori.net</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <ConsoleProvider>
        <ConsoleShell />
      </ConsoleProvider>
    </>
  );
}
