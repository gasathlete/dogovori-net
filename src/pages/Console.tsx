import { Helmet } from "react-helmet-async";
import { ConsoleProvider, useConsoleShortcuts } from "@/hooks/useConsoleStore";
import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";
import { ConsoleListColumn } from "@/components/console/ConsoleListColumn";
import { ConsoleTabBar } from "@/components/console/ConsoleTabBar";
import { ConsoleCanvas } from "@/components/console/ConsoleCanvas";
import { Header } from "@/components/Header";

function ConsoleShell() {
  useConsoleShortcuts();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
        <ConsoleSidebar />
        <ConsoleListColumn />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ConsoleTabBar />
          <ConsoleCanvas />
        </div>
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
