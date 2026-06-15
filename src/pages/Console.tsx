import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ConsoleProvider, useConsoleShortcuts, useConsoleStore, type ConsoleSection } from "@/hooks/useConsoleStore";
import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";
import { ConsoleListColumn } from "@/components/console/ConsoleListColumn";
import { ConsoleTabBar } from "@/components/console/ConsoleTabBar";
import { ConsoleCanvas } from "@/components/console/ConsoleCanvas";
import { ConsoleFooter } from "@/components/console/ConsoleFooter";
import { Header } from "@/components/Header";
import { AssistantChat } from "@/components/AssistantChat";

const VALID_SECTIONS: ConsoleSection[] = [
  "assistant", "dashboard", "deals", "documents", "uploaded",
  "templates", "clients", "analyses", "signing", "team",
];

function ConsoleShell() {
  useConsoleShortcuts();
  const { state, setSection } = useConsoleStore();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const isAssistant = state.section === "assistant";

  // URL → store (one-way; sidebar navigates the URL, store follows)
  useEffect(() => {
    if (sectionParam && VALID_SECTIONS.includes(sectionParam as ConsoleSection)) {
      if (state.section !== sectionParam) setSection(sectionParam as ConsoleSection);
    }
  }, [sectionParam]); // eslint-disable-line react-hooks/exhaustive-deps

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
