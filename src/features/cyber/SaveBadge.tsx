import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, CircleDot, AlertTriangle } from "lucide-react";

export function SaveBadge({ state }: { state: "saved" | "saving" | "unsaved" | "error" }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite" data-state={state}>
      {state === "saving" && <><Loader2 className="size-3.5 animate-spin" /> {t("status.saving")}</>}
      {state === "saved" && <><CheckCircle2 className="size-3.5 text-success" /> {t("status.allSaved")}</>}
      {state === "unsaved" && <><CircleDot className="size-3.5 text-warning" /> {t("status.unsaved")}</>}
      {state === "error" && <><AlertTriangle className="size-3.5 text-danger" /> {t("status.saveError")}</>}
    </span>
  );
}
