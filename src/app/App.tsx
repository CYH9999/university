import * as React from "react";
import { RouterProvider } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { Loader2, MonitorX, AlertOctagon } from "lucide-react";
import { queryClient } from "./query";
import { router } from "./router";
import { useWorkspace, installCloseGuard } from "./workspace";
import { ServicesProvider } from "./services";
import { ConfirmHost } from "./confirm";
import { useSettings } from "./settings";
import { TooltipProvider } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { WorkspaceSelect } from "@/features/onboarding/WorkspaceSelect";
import { RecoveryScreen } from "@/features/onboarding/RecoveryScreen";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { logApi } from "@/platform/tauri";

function useGlobalErrorLogging() {
  React.useEffect(() => {
    const onError = (e: ErrorEvent) => void logApi.write("error", `Uncaught: ${e.message} @ ${e.filename}:${e.lineno}`);
    const onRejection = (e: PromiseRejectionEvent) => void logApi.write("error", `Unhandled rejection: ${e.reason instanceof Error ? e.reason.stack ?? e.reason.message : String(e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

export function App() {
  const phase = useWorkspace((w) => w.phase);
  const boot = useWorkspace((w) => w.boot);
  const theme = useSettings((s) => s.settings.theme);
  useGlobalErrorLogging();
  React.useEffect(() => {
    installCloseGuard();
    void boot();
  }, [boot]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ServicesProvider>
          {phase === "ready" ? <RouterProvider router={router} /> : <Gate />}
          <ConfirmHost />
          <Toaster position="bottom-left" theme={theme === "light" ? "light" : "dark"} richColors closeButton toastOptions={{ className: "font-sans" }} />
        </ServicesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Gate() {
  const { t } = useTranslation();
  const { phase, openingStep, error, retry } = useWorkspace();
  if (phase === "select") return <WorkspaceSelect />;
  if (phase === "recovery") return <RecoveryScreen />;
  if (phase === "onboarding") return <Onboarding />;
  if (phase === "no-desktop")
    return (
      <Centered>
        <MonitorX className="size-10 text-warning" />
        <h1 className="text-lg font-semibold">{t("boot.noDesktopTitle")}</h1>
        <p className="max-w-md text-sm text-muted">{t("boot.noDesktopBody")}</p>
      </Centered>
    );
  if (phase === "error")
    return (
      <Centered>
        <AlertOctagon className="size-10 text-danger" />
        <h1 className="text-lg font-semibold">{t("boot.errorTitle")}</h1>
        <pre className="max-w-xl whitespace-pre-wrap rounded-md border border-border bg-sunken p-3 text-xs text-danger">{error}</pre>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void retry()}>
            {t("common.retry")}
          </Button>
          <Button onClick={() => useWorkspace.setState({ phase: "select", selectReason: "switch" })}>{t("workspace.chooseAnother")}</Button>
        </div>
      </Centered>
    );
  return (
    <Centered>
      <img src="/logo.svg" alt="" className="size-14" />
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        {phase === "opening" ? t(`boot.step.${openingStep ?? "database"}`) : t("boot.checking")}
      </div>
    </Centered>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">{children}</div>;
}
