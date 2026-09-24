import * as React from "react";
import { useTranslation } from "react-i18next";
import { History, RotateCcw, Trash2, Eye, GitCompare, Camera, Tag } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { confirm } from "@/app/confirm";
import { Button } from "@/components/ui/button";
import { Badge, Segmented } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { RichView } from "@/components/editor/RichEditor";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { diffLines } from "@/core/utils/diff";
import type { ContentVersion } from "@/core/model/types";
import { cn } from "@/lib/cn";

export function VersionHistory({
  entityType,
  entityId,
  currentText,
  restore,
  onBeforeRestore,
  onRestored,
}: {
  entityType: string;
  entityId: string;
  currentText: () => string;
  restore: (versionId: string) => Promise<unknown>;
  onBeforeRestore?: () => Promise<void>;
  onRestored: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [], isLoading } = useQ(["versions", entityType, entityId], () => s.versions.list(entityType, entityId));
  const [open, setOpen] = React.useState<ContentVersion | null>(null);
  const [mode, setMode] = React.useState<"preview" | "compare">("preview");

  const doRestore = async (v: ContentVersion) => {
    if (!(await confirm({ title: t("versions.restoreTitle"), description: t("versions.restoreBody", { date: fmtDateTime(v.createdAt) }), confirmLabel: t("versions.restore") }))) return;
    try {
      await onBeforeRestore?.();
      await restore(v.id);
      await onRestored();
      setOpen(null);
      toast.success(t("versions.restored"));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (v: ContentVersion) => {
    if (!(await confirm({ title: t("versions.deleteTitle"), description: t("versions.deleteBody"), confirmLabel: t("common.delete"), danger: true }))) return;
    await s.versions.remove(v.id);
    await invalidateAll();
    setOpen(null);
  };

  const pruneOld = async () => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    if (!(await confirm({ title: t("versions.pruneTitle"), description: t("versions.pruneBody"), confirmLabel: t("common.delete"), danger: true }))) return;
    const n = await s.versions.removeOlderThan(entityType, entityId, cutoff);
    await invalidateAll();
    toast.success(t("versions.pruned", { count: n }));
  };

  return (
    <div>
      <p className="mb-3 text-xs leading-relaxed text-subtle">{t("versions.hint")}</p>
      {!isLoading && data.length === 0 && <EmptyState compact icon={<History />} title={t("versions.empty")} />}
      <ul className="space-y-1.5">
        {data.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => { setOpen(v); setMode("preview"); }} className="flex w-full items-center gap-2 rounded-md border border-border bg-sunken px-3 py-2 text-start hover:border-accent/40">
              {v.kind === "manual" ? <Camera className="size-4 text-accent" /> : v.kind === "restore" ? <RotateCcw className="size-4 text-warning" /> : <History className="size-4 text-muted" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{fmtDateTime(v.createdAt)}</div>
                <div className="flex items-center gap-2 text-[11px] text-subtle">
                  <span>{t(`versions.kinds.${v.kind}`)}</span>·<span>{fmtRelative(v.createdAt)}</span>
                </div>
              </div>
              {v.label && (
                <Badge tone="accent">
                  <Tag className="size-3" /> {v.label}
                </Badge>
              )}
            </button>
          </li>
        ))}
      </ul>
      {data.length > 5 && (
        <Button className="mt-3" size="sm" variant="ghost" onClick={pruneOld}>
          <Trash2 /> {t("versions.pruneOld")}
        </Button>
      )}

      <Modal
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        size="lg"
        title={open ? `${t("versions.version")} · ${fmtDateTime(open.createdAt)}` : ""}
        description={open?.label ?? t(`versions.kinds.${open?.kind ?? "auto"}`)}
        footer={
          open && (
            <>
              <Button variant="danger-ghost" className="me-auto" onClick={() => remove(open)}>
                <Trash2 /> {t("common.delete")}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(null)}>{t("common.close")}</Button>
              <Button variant="primary" onClick={() => doRestore(open)}>
                <RotateCcw /> {t("versions.restore")}
              </Button>
            </>
          )
        }
      >
        {open && (
          <>
            <Segmented className="mb-3" value={mode} onChange={setMode} options={[{ value: "preview", label: t("versions.preview"), icon: <Eye /> }, { value: "compare", label: t("versions.compare"), icon: <GitCompare /> }]} />
            {mode === "preview" ? (
              <div className="rounded-md border border-border p-4">
                {open.title && <h2 className="mb-3 text-xl font-semibold">{open.title}</h2>}
                <RichView content={open.content} />
              </div>
            ) : (
              <DiffView from={open.contentText ?? ""} to={currentText()} />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function DiffView({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const lines = React.useMemo(() => diffLines(from, to), [from, to]);
  const changed = lines.filter((l) => l.type !== "same").length;
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {t("versions.compareHint")} · {t("versions.changedLines", { count: changed })}
      </p>
      <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-sunken p-2 text-sm" dir="auto">
        {lines.map((l, i) => (
          <div key={i} className={cn("whitespace-pre-wrap rounded px-2 py-0.5", l.type === "add" && "bg-success/12 text-success", l.type === "del" && "bg-danger/12 text-danger line-through")}>
            <span className="me-2 inline-block w-3 select-none text-subtle">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
            {l.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}
