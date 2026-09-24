import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  FolderOpen,
  Upload,
  FolderPlus,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Search,
  MoreHorizontal,
  ExternalLink,
  FolderSearch,
  Pencil,
  Move,
  Copy,
  Info,
  Eye,
  Folder,
  ChevronRight,
  Home,
  Clock,
  Link2Off,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Toolbar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, NativeSelect } from "@/components/ui/input";
import { Segmented, Badge } from "@/components/ui/controls";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, Modal, Drawer } from "@/components/ui/overlay";
import { FileTypeIcon, FilePreview, canPreview, openFile, revealFile, RecentFileRow } from "@/components/common/files";
import { SubjectSelect, ProjectSelect } from "@/components/common/pickers";
import { TagInput } from "@/components/common/TagInput";
import { SubjectChip } from "@/components/common/badges";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { confirm, promptText } from "@/app/confirm";
import { dialogs, openApi } from "@/platform/tauri";
import { errorMessage, fileFailureMessage } from "@/lib/errors";
import { useDebounced, useSubjectMap } from "@/lib/hooks";
import { fmtDateTime, fmtRelative, fmtBytes } from "@/lib/format";
import { WORKSPACE_ROOTS, type MergedEntry } from "@/core/services/files";
import type { FileRecord } from "@/core/model/types";
import { cn } from "@/lib/cn";

type View = "browse" | "trash" | "missing" | "recent";

async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    await invalidateAll();
    if (success) toast.success(success);
    return r;
  } catch (e) {
    toast.error(errorMessage(e));
    return undefined;
  }
}

export function FilesPage() {
  const { t } = useTranslation();
  const s = useServices();
  const [params, setParams] = useSearchParams();
  const [view, setView] = React.useState<View>(params.get("view") === "missing" ? "missing" : "browse");
  const [dir, setDir] = React.useState<string>("Attachments");
  const [text, setText] = React.useState("");
  const [group, setGroup] = React.useState("all");
  const [sort, setSort] = React.useState<"name" | "modified" | "size">("name");
  const [preview, setPreview] = React.useState<{ relPath: string; name: string; ext: string } | null>(null);
  const [details, setDetails] = React.useState<FileRecord | null>(null);
  const [moving, setMoving] = React.useState<{ entry: MergedEntry; mode: "move" | "copy" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const dText = useDebounced(text, 250);
  const searching = !!dText.trim() || group !== "all";

  const upload = React.useCallback(async (target?: string) => {
    const picked = await dialogs.pickFiles(t("files.chooseFiles"));
    if (!picked.length) return;
    setBusy(true);
    const dest = target ?? (dir === "Trash" || dir.startsWith("Trash/") || dir === "Backups" ? "Attachments" : dir);
    const r = await run(() => s.files.importFiles({ sources: picked, destRel: dest }));
    setBusy(false);
    if (r) {
      if (r.imported.length) toast.success(t("files.importedTo", { count: r.imported.length, folder: dest }));
      if (r.linkedExisting.length) toast.info(t("files.duplicateSkipped", { count: r.linkedExisting.length }));
      for (const f of r.failed) toast.error(fileFailureMessage(f));
    }
  }, [dir, s, t]);

  React.useEffect(() => {
    if (params.get("upload") === "1") {
      const n = new URLSearchParams(params);
      n.delete("upload");
      setParams(n, { replace: true });
      void upload();
    }
    const fid = params.get("file");
    if (fid) {
      const n = new URLSearchParams(params);
      n.delete("file");
      setParams(n, { replace: true });
      void s.repos.files.get(fid).then((f) => {
        if (!f) return;
        setView("browse");
        setDir(f.relPath.split("/").slice(0, -1).join("/"));
        setDetails(f);
      });
    }
  }, [params, setParams, upload, s]);

  const { data: entries = [], isLoading, refetch } = useQ(["files", "dir", dir], () => s.files.listDir(dir), { enabled: view === "browse" && !searching });
  const { data: found = [] } = useQ(["files", "search", dText, group], () => s.files.search({ text: dText, group }), { enabled: view === "browse" && searching });
  const { data: stats } = useQ(["files", "stats"], () => s.files.stats());

  const sorted = React.useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (sort === "modified") return b.modified - a.modified;
      if (sort === "size") return b.size - a.size;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    return arr;
  }, [entries, sort]);

  const crumbs = dir.split("/").map((part, i, arr) => ({ label: part, path: arr.slice(0, i + 1).join("/") }));

  const rename = async (e: MergedEntry) => {
    const name = await promptText({ title: t("files.rename"), initial: e.name, confirmLabel: t("common.save") });
    if (!name || name === e.name) return;
    await run(() => s.files.rename(e.relPath, name), t("files.renamed"));
  };
  const newFolder = async () => {
    const name = await promptText({ title: t("files.newFolder"), placeholder: t("files.folderName"), confirmLabel: t("common.create") });
    if (!name?.trim()) return;
    await run(() => s.files.createFolder(dir, name.trim()), t("files.folderCreated"));
  };
  const remove = async (e: MergedEntry) => {
    if (!(await confirm({ title: t("files.trashTitle"), description: t(e.isDir ? "files.trashFolderBody" : "files.trashBody", { name: e.name }), confirmLabel: t("files.moveToTrash"), danger: true }))) return;
    await run(async () => {
      const item = await s.files.trash(e.relPath, e.isDir, e.size);
      toast.success(t("files.trashed"), { action: { label: t("common.undo"), onClick: () => void run(() => s.files.restoreFromTrash(item.id)) } });
    });
  };

  const isRoot = !dir.includes("/");

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<FolderOpen />}
        title={t("nav.files")}
        description={stats ? t("files.summary", { count: stats.count, size: fmtBytes(stats.bytes) }) : undefined}
        actions={
          <>
            <Button onClick={() => openApi.reveal(dir).catch((e) => toast.error(errorMessage(e)))}>
              <FolderSearch /> {t("files.revealFolder")}
            </Button>
            <Button onClick={newFolder} disabled={view !== "browse" || dir.startsWith("Trash") || dir === "Backups"}>
              <FolderPlus /> {t("files.newFolder")}
            </Button>
            <Button variant="primary" onClick={() => upload()} loading={busy}>
              <Upload /> {t("files.upload")}
            </Button>
          </>
        }
      >
        <Toolbar>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "browse", label: t("files.views.browse"), icon: <FolderOpen /> },
              { value: "recent", label: t("files.views.recent"), icon: <Clock /> },
              { value: "missing", label: t("files.views.missing"), icon: <AlertTriangle /> },
              { value: "trash", label: t("files.views.trash"), icon: <Trash2 /> },
            ]}
          />
          {view === "browse" && (
            <>
              <div className="relative w-64">
                <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-subtle" />
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("files.searchPlaceholder")} className="ps-8" />
              </div>
              <NativeSelect
                className="w-40"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                options={["all", "pdf", "document", "presentation", "spreadsheet", "image", "archive", "code", "media", "capture", "other"].map((g) => ({ value: g, label: t(`files.groups.${g}`) }))}
              />
              <NativeSelect className="w-36" value={sort} onChange={(e) => setSort(e.target.value as "name")} options={[{ value: "name", label: t("files.sort.name") }, { value: "modified", label: t("files.sort.modified") }, { value: "size", label: t("files.sort.size") }]} />
            </>
          )}
        </Toolbar>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        {view === "browse" && (
          <aside className="w-56 shrink-0 overflow-y-auto border-e border-border p-2">
            {WORKSPACE_ROOTS.map((r) => (
              <button key={r} type="button" onClick={() => { setDir(r); setText(""); setGroup("all"); }} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-muted hover:bg-surface-2 hover:text-fg", dir.split("/")[0] === r && "bg-accent/10 text-fg")}>
                <Folder className="size-4 text-accent" />
                <span className="truncate">{t(`files.roots.${r.replace(/ /g, "")}`)}</span>
              </button>
            ))}
          </aside>
        )}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {view === "browse" && !searching && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <Home className="size-4 text-muted" />
                <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label={t("files.path")}>
                  {crumbs.map((c, i) => (
                    <React.Fragment key={c.path}>
                      {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle rtl:rotate-180" />}
                      <button type="button" onClick={() => setDir(c.path)} className={cn("truncate rounded px-1 hover:bg-surface-2", i === crumbs.length - 1 ? "font-medium text-fg" : "text-muted")}>
                        {i === 0 ? t(`files.roots.${c.label.replace(/ /g, "")}`, { defaultValue: c.label }) : c.label}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>
                {!isRoot && (
                  <Button size="sm" variant="ghost" onClick={() => setDir(dir.split("/").slice(0, -1).join("/"))}>
                    {t("files.up")}
                  </Button>
                )}
                <Button size="icon-sm" variant="ghost" className="ms-auto" onClick={() => void refetch()} aria-label={t("common.refresh")}>
                  <RefreshCw />
                </Button>
              </div>
              {!isLoading && sorted.length === 0 ? (
                <EmptyState icon={<FolderOpen />} title={t("files.emptyFolder")} description={t("files.emptyFolderHint")} action={<Button variant="primary" onClick={() => upload()}><Upload /> {t("files.upload")}</Button>} />
              ) : (
                <FileTable
                  entries={sorted}
                  onOpenDir={setDir}
                  onPreview={(e) => setPreview({ relPath: e.relPath, name: e.name, ext: e.ext })}
                  onDetails={(f) => setDetails(f)}
                  onRename={rename}
                  onMove={(e) => setMoving({ entry: e, mode: "move" })}
                  onCopy={(e) => setMoving({ entry: e, mode: "copy" })}
                  onDelete={remove}
                  inTrash={dir.startsWith("Trash")}
                />
              )}
            </>
          )}
          {view === "browse" && searching && (
            found.length === 0 ? (
              <EmptyState icon={<Search />} title={t("search.noResults")} />
            ) : (
              <FileTable
                entries={found.map((f) => ({ name: f.name, relPath: f.relPath, isDir: false, size: f.size, modified: new Date(f.updatedAt).getTime(), ext: f.ext, file: f }))}
                showPath
                onOpenDir={setDir}
                onPreview={(e) => setPreview({ relPath: e.relPath, name: e.name, ext: e.ext })}
                onDetails={(f) => setDetails(f)}
                onRename={rename}
                onMove={(e) => setMoving({ entry: e, mode: "move" })}
                onCopy={(e) => setMoving({ entry: e, mode: "copy" })}
                onDelete={remove}
              />
            )
          )}
          {view === "trash" && <TrashView />}
          {view === "missing" && <MissingView />}
          {view === "recent" && <RecentView />}
        </div>
      </div>
      <FilePreview file={preview} onClose={() => setPreview(null)} />
      <FileDetails file={details} onClose={() => setDetails(null)} />
      <MoveDialog state={moving} onClose={() => setMoving(null)} />
    </div>
  );
}

function FileTable({
  entries,
  onOpenDir,
  onPreview,
  onDetails,
  onRename,
  onMove,
  onCopy,
  onDelete,
  showPath,
  inTrash,
}: {
  entries: MergedEntry[];
  onOpenDir: (rel: string) => void;
  onPreview: (e: MergedEntry) => void;
  onDetails: (f: FileRecord) => void;
  onRename: (e: MergedEntry) => void;
  onMove: (e: MergedEntry) => void;
  onCopy: (e: MergedEntry) => void;
  onDelete: (e: MergedEntry) => void;
  showPath?: boolean;
  inTrash?: boolean;
}) {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="px-4 py-2 text-start font-medium">{t("fields.name")}</th>
            <th className="w-40 px-3 py-2 text-start font-medium">{t("files.linkedTo")}</th>
            <th className="w-24 px-3 py-2 text-start font-medium">{t("files.size")}</th>
            <th className="w-40 px-3 py-2 text-start font-medium">{t("files.modified")}</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((e) => (
            <tr key={e.relPath} className="group hover:bg-surface-2/40" onDoubleClick={() => (e.isDir ? onOpenDir(e.relPath) : canPreview(e.ext) ? onPreview(e) : openFile({ relPath: e.relPath, id: e.file?.id ?? "", name: e.name }, s.files.markOpened))}>
              <td className="px-4 py-2">
                <button type="button" className="flex min-w-0 items-center gap-2.5 text-start" onClick={() => (e.isDir ? onOpenDir(e.relPath) : e.file ? onDetails(e.file) : onPreview(e))}>
                  <FileTypeIcon ext={e.ext} isDir={e.isDir} className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{e.name}</span>
                    {showPath && <span className="block truncate font-mono text-[11px] text-subtle" dir="ltr">{e.relPath}</span>}
                  </span>
                  {e.file?.tags.map((tag) => <Badge key={tag} tone="accent">#{tag}</Badge>)}
                </button>
              </td>
              <td className="px-3 py-2">{e.file?.subjectId && <SubjectChip subject={subjects.get(e.file.subjectId)} />}</td>
              <td className="px-3 py-2 text-xs tabular-nums text-muted">{e.isDir ? "—" : fmtBytes(e.size)}</td>
              <td className="px-3 py-2 text-xs text-muted">{e.modified ? fmtRelative(new Date(e.modified).toISOString()) : ""}</td>
              <td className="px-1">
                <Menu>
                  <MenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={t("common.actions")}>
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {e.isDir ? (
                      <MenuItem icon={<FolderOpen />} onSelect={() => onOpenDir(e.relPath)}>{t("common.open")}</MenuItem>
                    ) : (
                      <>
                        {canPreview(e.ext) && <MenuItem icon={<Eye />} onSelect={() => onPreview(e)}>{t("files.preview")}</MenuItem>}
                        <MenuItem icon={<ExternalLink />} onSelect={() => void openFile({ relPath: e.relPath, id: e.file?.id ?? "", name: e.name }, s.files.markOpened)}>{t("files.openExternal")}</MenuItem>
                      </>
                    )}
                    <MenuItem icon={<FolderSearch />} onSelect={() => void revealFile(e.relPath)}>{t("files.reveal")}</MenuItem>
                    {!inTrash && (
                      <>
                        {e.file && <MenuItem icon={<Info />} onSelect={() => onDetails(e.file!)}>{t("files.details")}</MenuItem>}
                        <MenuSeparator />
                        <MenuItem icon={<Pencil />} onSelect={() => onRename(e)}>{t("files.rename")}</MenuItem>
                        <MenuItem icon={<Move />} onSelect={() => onMove(e)}>{t("files.move")}</MenuItem>
                        <MenuItem icon={<Copy />} onSelect={() => onCopy(e)}>{t("files.copy")}</MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<Trash2 />} danger onSelect={() => onDelete(e)}>{t("files.moveToTrash")}</MenuItem>
                      </>
                    )}
                  </MenuContent>
                </Menu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Folder chooser used by move/copy (browses the real workspace folders). */
function MoveDialog({ state, onClose }: { state: { entry: MergedEntry; mode: "move" | "copy" } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useServices();
  const [dir, setDir] = React.useState("Attachments");
  const { data: dirs = [] } = useQ(["files", "dirs", dir], async () => (await s.ctx.fs.listDir(dir)).filter((e) => e.isDir), { enabled: !!state });
  const go = async () => {
    if (!state) return;
    const r = await run(() => (state.mode === "move" ? s.files.move(state.entry.relPath, dir) : s.files.copy(state.entry.relPath, dir)), state.mode === "move" ? t("files.moved") : t("files.copied"));
    if (r !== undefined) onClose();
  };
  return (
    <Modal
      open={!!state}
      onOpenChange={(o) => !o && onClose()}
      title={state?.mode === "move" ? t("files.moveTitle", { name: state?.entry.name }) : t("files.copyTitle", { name: state?.entry.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={go}>{state?.mode === "move" ? t("files.moveHere") : t("files.copyHere")}</Button>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {WORKSPACE_ROOTS.filter((r) => r !== "Backups").map((r) => (
          <Button key={r} size="sm" variant={dir.split("/")[0] === r ? "primary" : "ghost"} onClick={() => setDir(r)}>
            {t(`files.roots.${r.replace(/ /g, "")}`)}
          </Button>
        ))}
      </div>
      <div className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-xs" dir="ltr">
          {dir}
          {dir.includes("/") && (
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setDir(dir.split("/").slice(0, -1).join("/"))}>..</Button>
          )}
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {dirs.length === 0 && <li className="px-3 py-3 text-xs text-subtle">{t("files.noSubfolders")}</li>}
          {dirs.map((d) => (
            <li key={d.relPath}>
              <button type="button" onClick={() => setDir(d.relPath)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-surface-2">
                <Folder className="size-4 text-accent" /> {d.name}
                <ChevronRight className="ms-auto size-4 text-subtle rtl:rotate-180" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function FileDetails({ file, onClose }: { file: FileRecord | null; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useServices();
  const [draft, setDraft] = React.useState<Partial<FileRecord>>({});
  React.useEffect(() => setDraft(file ? { description: file.description, subjectId: file.subjectId, projectId: file.projectId, tags: file.tags } : {}), [file]);
  const { data: links = [] } = useQ(["file-links", file?.id], () => (file ? s.files.linksOf(file.id) : Promise.resolve([])), { enabled: !!file });
  const { data: exists } = useQ(["file-exists", file?.relPath], () => (file ? s.files.existence([file]) : Promise.resolve(new Map())), { enabled: !!file });
  if (!file) return null;
  const missing = exists?.get(file.id) === false;
  const save = async () => {
    const r = await run(() => s.repos.files.update(file.id, draft), t("toast.saved"));
    if (r) onClose();
  };
  return (
    <Drawer
      open={!!file}
      onOpenChange={(o) => !o && onClose()}
      title={file.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save}>{t("common.save")}</Button>
        </>
      }
    >
      {missing && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="size-4" /> {t("files.missingHint")}
        </div>
      )}
      <div className="mb-4 flex gap-2">
        <Button size="sm" onClick={() => openFile(file, s.files.markOpened)} disabled={missing}><ExternalLink /> {t("files.openExternal")}</Button>
        <Button size="sm" variant="ghost" onClick={() => revealFile(file.relPath)}><FolderSearch /> {t("files.reveal")}</Button>
      </div>
      <dl className="mb-5 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted">{t("files.path")}</dt>
        <dd className="break-all font-mono" dir="ltr">{file.relPath}</dd>
        <dt className="text-muted">{t("files.size")}</dt>
        <dd>{fmtBytes(file.size)}</dd>
        <dt className="text-muted">{t("files.type")}</dt>
        <dd className="uppercase">{file.ext || "—"}</dd>
        <dt className="text-muted">SHA-256</dt>
        <dd className="break-all font-mono text-[10px] text-subtle" dir="ltr">{file.sha256 ?? t("files.notComputed")}</dd>
        <dt className="text-muted">{t("fields.createdAt")}</dt>
        <dd>{fmtDateTime(file.createdAt)}</dd>
        <dt className="text-muted">{t("files.lastOpened")}</dt>
        <dd>{file.lastOpenedAt ? fmtDateTime(file.lastOpenedAt) : "—"}</dd>
      </dl>
      <div className="space-y-3">
        <Field label={t("fields.subjectId")}>
          <SubjectSelect value={draft.subjectId} onChange={(v) => setDraft((d) => ({ ...d, subjectId: v }))} />
        </Field>
        <Field label={t("fields.projectId")}>
          <ProjectSelect value={draft.projectId} onChange={(v) => setDraft((d) => ({ ...d, projectId: v }))} />
        </Field>
        <Field label={t("fields.description")}>
          <Textarea value={draft.description ?? ""} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
        </Field>
        <Field label={t("fields.tags")}>
          <TagInput value={draft.tags ?? []} onChange={(v) => setDraft((d) => ({ ...d, tags: v }))} />
        </Field>
      </div>
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold">{t("files.linkedItems")}</h3>
        {links.length === 0 ? (
          <p className="text-xs text-subtle">{t("files.noLinks")}</p>
        ) : (
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={`${l.entityType}:${l.entityId}`} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
                <span>{t(`entity.${l.entityType}`)}</span>
                <Button size="sm" variant="ghost" onClick={() => run(() => s.files.unlink(file.id, l.entityType, l.entityId))}>
                  <Link2Off /> {t("files.unlink")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

function TrashView() {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [], isLoading } = useQ(["files", "trash"], () => s.files.trashItems());
  const empty = async () => {
    if (!(await confirm({ title: t("files.emptyTrashTitle"), description: t("files.emptyTrashBody"), confirmLabel: t("files.emptyTrash"), danger: true, typeToConfirm: t("files.emptyTrashWord") }))) return;
    await run(() => s.files.emptyTrash(), t("files.trashEmptied"));
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-subtle">{t("files.trashHint")}</p>
        <Button variant="danger-ghost" size="sm" onClick={empty} disabled={!data.length}>
          <Trash2 /> {t("files.emptyTrash")}
        </Button>
      </div>
      {!isLoading && data.length === 0 ? (
        <EmptyState icon={<Trash2 />} title={t("files.trashEmpty")} />
      ) : (
        <ul className="card divide-y divide-border">
          {data.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileTypeIcon ext={it.name.split(".").pop()} isDir={it.isDir} className="size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{it.name}</div>
                <div className="truncate font-mono text-[11px] text-subtle" dir="ltr">{it.originalRel}</div>
              </div>
              <span className="text-xs text-subtle">{fmtRelative(it.deletedAt)}</span>
              <Button size="sm" onClick={() => run(() => s.files.restoreFromTrash(it.id), t("files.restored"))}>
                <RotateCcw /> {t("files.restore")}
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                onClick={async () => {
                  if (await confirm({ title: t("files.deleteForeverTitle"), description: t("files.deleteForeverBody", { name: it.name }), confirmLabel: t("files.deleteForever"), danger: true })) await run(() => s.files.deleteFromTrash(it.id), t("toast.deleted"));
                }}
              >
                {t("files.deleteForever")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MissingView() {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [], isLoading, refetch, isFetching } = useQ(["files", "missing"], () => s.files.findMissing(), { staleTime: 0 });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-subtle">{t("files.missingViewHint")}</p>
        <Button size="sm" onClick={() => void refetch()} loading={isFetching}>
          <RefreshCw /> {t("files.checkAgain")}
        </Button>
      </div>
      {!isLoading && data.length === 0 ? (
        <EmptyState icon={<AlertTriangle />} title={t("files.noMissing")} />
      ) : (
        <ul className="card divide-y divide-border">
          {data.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <AlertTriangle className="size-4 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{f.name}</div>
                <div className="truncate font-mono text-[11px] text-subtle" dir="ltr">{f.relPath}</div>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  const rel = await promptText({ title: t("files.relink"), label: t("files.relinkHint"), initial: f.relPath, confirmLabel: t("common.save") });
                  if (!rel) return;
                  const [st] = await s.ctx.fs.statMany([rel]);
                  if (!st?.exists) return void toast.error(t("files.relinkNotFound"));
                  await run(() => s.files.relink(f.id, rel), t("files.relinked"));
                }}
              >
                {t("files.relink")}
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                onClick={async () => {
                  if (await confirm({ title: t("files.forgetTitle"), description: t("files.forgetBody"), confirmLabel: t("files.forget"), danger: true })) await run(() => s.files.forget(f.id), t("toast.deleted"));
                }}
              >
                {t("files.forget")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentView() {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["files", "recent", 50], () => s.files.recent(50));
  if (!data.length) return <EmptyState icon={<Clock />} title={t("dashboard.noRecentFiles")} />;
  return (
    <div className="card p-2">
      {data.map((f) => (
        <RecentFileRow key={f.id} f={f} />
      ))}
    </div>
  );
}
