import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  FileText,
  FileImage,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Presentation,
  File as FileIconBase,
  Folder,
  FileVideo,
  Network,
  Paperclip,
  ExternalLink,
  FolderSearch,
  Unlink,
  AlertTriangle,
  Upload,
  Eye,
} from "lucide-react";
import { fileGroup } from "@/core/services/files";
import type { FileRecord } from "@/core/model/types";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { openApi, dialogs } from "@/platform/tauri";
import { errorMessage, fileFailureMessage } from "@/lib/errors";
import { fmtRelative, fmtBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";

export function FileTypeIcon({ ext, isDir, className }: { ext?: string; isDir?: boolean; className?: string }) {
  if (isDir) return <Folder className={cn("text-accent", className)} />;
  const g = fileGroup(ext ?? "");
  const map: Record<string, [typeof FileText, string]> = {
    pdf: [FileText, "text-red-400"],
    document: [FileText, "text-sky-400"],
    presentation: [Presentation, "text-orange-400"],
    spreadsheet: [FileSpreadsheet, "text-emerald-400"],
    image: [FileImage, "text-violet-400"],
    archive: [FileArchive, "text-yellow-400"],
    code: [FileCode, "text-teal-400"],
    media: [FileVideo, "text-pink-400"],
    capture: [Network, "text-cyan-400"],
  };
  const [Icon, color] = map[g] ?? [FileIconBase, "text-muted"];
  return <Icon className={cn(color, className)} />;
}

export function canPreview(ext: string): "image" | "pdf" | "text" | null {
  const e = ext.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(e)) return "image";
  if (e === "pdf") return "pdf";
  if (["txt", "md", "csv", "json", "log", "py", "js", "ts", "c", "cpp", "h", "sh", "ps1", "yml", "yaml", "sql", "html", "css", "xml", "ini", "conf", "rs", "go", "java", "rb", "php"].includes(e)) return "text";
  return null;
}

export async function openFile(file: Pick<FileRecord, "relPath" | "id" | "name"> & Partial<FileRecord>, markOpened?: (f: FileRecord) => Promise<void>) {
  try {
    await openApi.file(file.relPath);
    if (markOpened && file.id) await markOpened(file as FileRecord);
    void invalidateAll();
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

export async function revealFile(relPath: string) {
  try {
    await openApi.reveal(relPath);
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

export function FilePreview({ file, onClose }: { file: { relPath: string; name: string; ext: string } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const kind = file ? canPreview(file.ext) : null;
  const { data, error, isLoading } = useQ(
    ["preview", file?.relPath],
    async () => {
      if (!file || !kind) return null;
      if (kind === "text") return { text: (await openApi.readText(file.relPath)).slice(0, 400_000) };
      return { url: await openApi.assetUrl(file.relPath) };
    },
    { enabled: !!file && !!kind, staleTime: 0 },
  );
  return (
    <Modal
      open={!!file}
      onOpenChange={(o) => !o && onClose()}
      title={file?.name ?? ""}
      size="xl"
      footer={
        file && (
          <>
            <Button variant="ghost" onClick={() => revealFile(file.relPath)}>
              <FolderSearch /> {t("files.reveal")}
            </Button>
            <Button variant="primary" onClick={() => openFile({ relPath: file.relPath, id: "", name: file.name })}>
              <ExternalLink /> {t("files.openExternal")}
            </Button>
          </>
        )
      }
    >
      {isLoading && <div className="py-20 text-center text-sm text-muted">{t("common.loading")}</div>}
      {error && <div className="py-10 text-center text-sm text-danger">{errorMessage(error)}</div>}
      {data && "url" in data && kind === "image" && <img src={data.url} alt={file?.name} className="mx-auto max-h-[65vh] rounded-md object-contain" />}
      {data && "url" in data && kind === "pdf" && <iframe title={file?.name} src={data.url} className="h-[65vh] w-full rounded-md border border-border bg-white" />}
      {data && "text" in data && <pre className="max-h-[65vh] overflow-auto rounded-md border border-border bg-sunken p-3 text-xs">{data.text}</pre>}
      {!kind && <EmptyState compact title={t("files.noPreview")} description={t("files.noPreviewHint")} />}
    </Modal>
  );
}

/**
 * Files linked to any entity: upload (copied into the Workspace), open, reveal, preview,
 * unlink, and a clear warning when a linked file is missing on disk.
 */
export function AttachmentsPanel({ entityType, entityId, title, compact, hideUpload }: { entityType: string; entityId: string; title?: string; compact?: boolean; hideUpload?: boolean }) {
  const { t } = useTranslation();
  const s = useServices();
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<FileRecord | null>(null);
  const { data: files = [], isLoading } = useQ(["attachments", entityType, entityId], () => s.files.forEntity(entityType, entityId));
  const { data: exists } = useQ(["attachments-exist", entityType, entityId, files.map((f) => f.relPath).join("|")], () => s.files.existence(files), { enabled: files.length > 0 });

  const upload = async () => {
    const picked = await dialogs.pickFiles(t("files.chooseFiles"));
    if (!picked.length) return;
    setBusy(true);
    try {
      const r = await s.files.attach(entityType, entityId, picked);
      if (r.imported.length) toast.success(t("files.importedCount", { count: r.imported.length }));
      if (r.linkedExisting.length) toast.info(t("files.linkedExisting", { count: r.linkedExisting.length }));
      for (const f of r.failed) toast.error(fileFailureMessage(f));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (f: FileRecord) => {
    try {
      await s.files.unlink(f.id, entityType, entityId);
      if ((entityType === "subject" && f.subjectId === entityId) || (entityType === "project" && f.projectId === entityId)) {
        await s.repos.files.update(f.id, entityType === "subject" ? { subjectId: null } : { projectId: null });
      }
      await invalidateAll();
      toast.success(t("files.unlinked"));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="size-4 text-muted" /> {title ?? t("files.attachments")}
          {files.length > 0 && <span className="text-xs font-normal text-subtle">({files.length})</span>}
        </h3>
        {!hideUpload && (
          <Button size="sm" onClick={upload} loading={busy}>
            <Upload /> {t("files.upload")}
          </Button>
        )}
      </div>
      {!isLoading && files.length === 0 && !compact && <EmptyState compact icon={<Paperclip />} title={t("files.noAttachments")} description={t("files.noAttachmentsHint")} />}
      <ul className="space-y-1">
        {files.map((f) => {
          const missing = exists?.get(f.id) === false;
          return (
            <li key={f.id} className={cn("group flex items-center gap-2 rounded-md border border-border bg-sunken px-2 py-1.5", missing && "border-danger/40 bg-danger/5")}>
              <FileTypeIcon ext={f.ext} className="size-4 shrink-0" />
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => (missing ? undefined : canPreview(f.ext) ? setPreview(f) : openFile(f, s.files.markOpened))}>
                <div className="truncate text-sm">{f.name}</div>
                <div className="truncate text-[11px] text-subtle">
                  {missing ? (
                    <span className="inline-flex items-center gap-1 text-danger">
                      <AlertTriangle className="size-3" /> {t("files.missing")}
                    </span>
                  ) : (
                    <>
                      {fmtBytes(f.size)} · <span className="ltr">{f.relPath}</span>
                    </>
                  )}
                </div>
              </button>
              <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                {!missing && canPreview(f.ext) && (
                  <Tip content={t("files.preview")}>
                    <Button size="icon-sm" variant="ghost" onClick={() => setPreview(f)}>
                      <Eye />
                    </Button>
                  </Tip>
                )}
                {!missing && (
                  <Tip content={t("files.openExternal")}>
                    <Button size="icon-sm" variant="ghost" onClick={() => openFile(f, s.files.markOpened)}>
                      <ExternalLink />
                    </Button>
                  </Tip>
                )}
                <Tip content={t("files.reveal")}>
                  <Button size="icon-sm" variant="ghost" onClick={() => revealFile(f.relPath)}>
                    <FolderSearch />
                  </Button>
                </Tip>
                <Tip content={t("files.unlink")}>
                  <Button size="icon-sm" variant="ghost" onClick={() => unlink(f)}>
                    <Unlink />
                  </Button>
                </Tip>
              </div>
            </li>
          );
        })}
      </ul>
      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export function RecentFileRow({ f }: { f: FileRecord }) {
  const s = useServices();
  return (
    <button type="button" onClick={() => openFile(f, s.files.markOpened)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-surface-2">
      <FileTypeIcon ext={f.ext} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
      <span className="shrink-0 text-[11px] text-subtle">{fmtRelative(f.lastOpenedAt)}</span>
    </button>
  );
}
