import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { FolderOpen, Database, DatabaseBackup, CheckCircle2, Loader2, CircleDot, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/app/workspace";
import { useSettings } from "@/app/settings";
import { useSaveStatus, saveState } from "@/app/saveStatus";
import { workspaceApi } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/core/utils/text";
import { fmtRelative } from "@/lib/format";
import { Tip } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

export function StatusBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const info = useWorkspace((w) => w.info);
  const backup = useSettings((s) => s.settings.backup);
  const settingsError = useSettings((s) => s.saveError);
  const save = useSaveStatus();
  const state = settingsError ? "error" : saveState(save);
  const backupAgeDays = backup.lastBackupAt ? (Date.now() - new Date(backup.lastBackupAt).getTime()) / 86400000 : null;
  const backupTone = backup.lastError ? "text-danger" : backupAgeDays === null ? "text-warning" : backupAgeDays > backup.intervalDays * 2 ? "text-warning" : "text-muted";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-elev px-3 text-[11px] text-muted">
      <Tip content={t("status.openWorkspace")}>
        <button type="button" className="flex min-w-0 items-center gap-1.5 hover:text-fg" onClick={() => workspaceApi.reveal().catch((e) => toast.error(errorMessage(e)))}>
          <FolderOpen className="size-3.5 shrink-0 text-accent" />
          <span className="truncate font-mono ltr" dir="ltr">{info?.path}</span>
        </button>
      </Tip>
      <Tip content={t("status.database")}>
        <span className="flex shrink-0 items-center gap-1.5">
          <Database className={cn("size-3.5", info?.dbOpen ? "text-success" : "text-danger")} />
          {info?.dbOpen ? t("status.dbOk") : t("status.dbClosed")}
          {info && <span className="text-subtle">· {formatBytes(info.dbSize)}</span>}
        </span>
      </Tip>
      <Tip content={backup.lastError ? `${t("status.backupFailed")}: ${backup.lastError}` : t("status.backupHint")}>
        <button type="button" onClick={() => navigate("/backup")} className={cn("flex shrink-0 items-center gap-1.5 hover:text-fg", backupTone)}>
          <DatabaseBackup className="size-3.5" />
          {backup.lastError ? t("status.backupFailed") : backup.lastBackupAt ? t("status.lastBackup", { when: fmtRelative(backup.lastBackupAt) }) : t("status.noBackup")}
        </button>
      </Tip>
      <span className="ms-auto flex shrink-0 items-center gap-1.5" aria-live="polite">
        {state === "saving" && (
          <>
            <Loader2 className="size-3.5 animate-spin" /> {t("status.saving")}
          </>
        )}
        {state === "saved" && (
          <>
            <CheckCircle2 className="size-3.5 text-success" /> {t("status.allSaved")}
          </>
        )}
        {state === "unsaved" && (
          <>
            <CircleDot className="size-3.5 text-warning" /> {t("status.unsaved")}
          </>
        )}
        {state === "error" && (
          <>
            <AlertTriangle className="size-3.5 text-danger" /> {t("status.saveError")}
          </>
        )}
      </span>
    </footer>
  );
}
