import * as React from "react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { TopBar, useQuickActionShortcuts } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { BackgroundJobs } from "./BackgroundJobs";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { useServices } from "@/app/services";
import { Spinner } from "@/components/ui/controls";

export function AppShell() {
  useQuickActionShortcuts();
  const loc = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [loc.pathname]);
  useServices();
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto" id="main">
            <React.Suspense fallback={<PageLoading />}>
              <Outlet />
            </React.Suspense>
          </main>
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
      <ShortcutsHelp />
      <BackgroundJobs />
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}
