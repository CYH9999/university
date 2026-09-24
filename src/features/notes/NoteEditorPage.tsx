import * as React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { History, PanelRight, MoreHorizontal, Pin, Star, Archive, Copy, FileDown, Trash2, Camera, CheckCircle2, Loader2, CircleDot, AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { useServices } from "@/app/services";
import { useQ, invalidateAll, queryClient } from "@/app/query";
import { useSaveStatus } from "@/app/saveStatus";
import { useSettings } from "@/app/settings";
import { confirm, promptText } from "@/app/confirm";
import { RichEditor } from "@/components/editor/RichEditor";
import { RecordForm } from "@/components/common/RecordForm";
import { AttachmentsPanel } from "@/components/common/files";
import { Breadcrumbs, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Tabs, Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/overlay";
import { Tip, Spinner } from "@/components/ui/controls";
import { VersionHistory } from "./VersionHistory";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { safeFileName } from "@/core/utils/text";
import { docToHtml, docToMarkdown, htmlDocument, parseDoc } from "@/core/utils/richtext";
import { openApi } from "@/platform/tauri";
import { useSubjectMap } from "@/lib/hooks";
import type { Note } from "@/core/model/types";
import { cn } from "@/lib/cn";
import i18n from "@/i18n";

type Pending = { title?: string; content?: string | null; contentText?: string };

export function NoteEditorPage() {
  const { id = "" } = useParams();
  const s = useServices();
  const { t } = useTranslation();
  const { data: note, isLoading, error } = useQ(["note", id], () => s.repos.notes.get(id), { staleTime: Infinity, refetchOnMount: "always" });
  React.useEffect(() => {
    if (note) {
      void s.notes.markOpened(note.id);
      void s.recent.touch("note", note.id, note.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);
  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner className="size-6" /></div>;
  if (error || !note) return <EmptyState title={t("notes.notFound")} description={error ? errorMessage(error) : undefined} />;
  return <Editor key={note.id} note={note} />;
}

function Editor({ note }: { note: Note }) {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fresh = params.get("fresh") === "1";
  const subjects = useSubjectMap();
  const editorWidth = useSettings((st) => st.settings.editorWidth);
  const updateSettings = useSettings((st) => st.update);
  const [title, setTitle] = React.useState(note.title);
  const [meta, setMeta] = React.useState<Note>(note);
  const [metaErrors, setMetaErrors] = React.useState<Record<string, string>>({});
  const [panel, setPanel] = React.useState<"details" | "files" | "history" | null>("details");
  const [editorKey, setEditorKey] = React.useState(0);
  const [content, setContent] = React.useState(note.content);
  const [state, setState] = React.useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [savedAt, setSavedAt] = React.useState<string | null>(note.updatedAt);
  const pending = React.useRef<Pending | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const edited = React.useRef(false);
  const saveKey = `note:${note.id}`;
  const status = useSaveStatus.getState();

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState("saving");
    status.begin();
    try {
      const saved = await s.notes.saveContent(note.id, p);
      setSavedAt(saved.updatedAt);
      status.end();
      if (!pending.current) {
        setState("saved");
        useSaveStatus.getState().markClean(saveKey);
      }
      void queryClient.invalidateQueries({ queryKey: ["data", "notes"] });
    } catch (e) {
      pending.current = { ...p, ...(pending.current ?? {}) };
      status.end(errorMessage(e));
      setState("error");
      toast.error(errorMessage(e));
    }
  }, [note.id, s, saveKey, status]);

  const schedule = (patch: Pending) => {
    edited.current = true;
    pending.current = { ...(pending.current ?? {}), ...patch };
    setState("unsaved");
    useSaveStatus.getState().markDirty(saveKey, flush);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };

  // Flush on unmount; discard a brand-new note that was never touched. The deferred
  // check keeps React StrictMode's simulated unmount/remount from deleting anything.
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      setTimeout(() => {
        if (alive.current) return;
        void (async () => {
          await flush();
          useSaveStatus.getState().markClean(saveKey);
          if (fresh && !edited.current) {
            const current = await s.repos.notes.get(note.id);
            if (current && !current.contentText.trim() && current.title === i18n.t("notes.untitled")) {
              await s.repos.notes.remove(note.id);
              void invalidateAll();
            }
          }
        })();
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush().then(() => toast.success(t("toast.saved")));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush, t]);

  const saveMeta = async (patch: Partial<Note>) => {
    const next = { ...meta, ...patch };
    setMeta(next);
    edited.current = true;
    try {
      await flush();
      await s.repos.notes.update(note.id, { ...patch });
      setMetaErrors({});
      void invalidateAll();
    } catch (e) {
      setMetaErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    }
  };

  const exportAs = async (format: "md" | "html") => {
    await flush();
    const n = await s.repos.notes.require(note.id);
    const doc = parseDoc(n.content);
    const body = format === "md" ? `# ${n.title}\n\n${doc ? docToMarkdown(doc) : n.contentText}` : htmlDocument(n.title, doc ? docToHtml(doc) : `<pre>${n.contentText}</pre>`, document.dir === "rtl" ? "rtl" : "ltr");
    try {
      const rel = await s.ctx.fs.writeText(`Exports/Notes/${safeFileName(n.title, "note")}.${format}`, body);
      toast.success(t("notes.exported"), { action: { label: t("files.reveal"), onClick: () => void openApi.reveal(rel) } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: t("confirm.deleteTitle"), description: t("notes.deleteBody"), confirmLabel: t("common.delete"), danger: true }))) return;
    pending.current = null;
    useSaveStatus.getState().markClean(saveKey);
    const snap = await s.repos.notes.remove(note.id);
    await invalidateAll();
    navigate("/notes");
    toast.success(t("toast.deleted"), { action: { label: t("common.undo"), onClick: () => void s.repos.notes.restore(snap).then(invalidateAll) } });
  };

  const snapshot = async () => {
    await flush();
    const label = await promptText({ title: t("versions.snapshot"), label: t("versions.labelPrompt"), confirmLabel: t("common.save") });
    if (label === null) return;
    await s.notes.snapshot(note.id, label.trim() || null);
    void invalidateAll();
    toast.success(t("versions.snapshotSaved"));
  };

  const subject = meta.subjectId ? subjects.get(meta.subjectId) : null;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-2.5">
          <Breadcrumbs items={[{ label: t("nav.notes"), to: "/notes" }, ...(subject ? [{ label: subject.name, to: `/subjects/${subject.id}/notes` }] : []), { label: title || t("notes.untitled") }]} />
          <div className="ms-auto flex items-center gap-1">
            <SaveIndicator state={state} savedAt={savedAt} />
            <Tip content={meta.pinned ? t("notes.unpin") : t("notes.pin")}>
              <Button size="icon" variant="ghost" onClick={() => saveMeta({ pinned: !meta.pinned })} aria-pressed={meta.pinned}>
                <Pin className={cn(meta.pinned && "fill-accent text-accent")} />
              </Button>
            </Tip>
            <Tip content={meta.favorite ? t("notes.unfavorite") : t("notes.favorite")}>
              <Button size="icon" variant="ghost" onClick={() => saveMeta({ favorite: !meta.favorite })} aria-pressed={meta.favorite}>
                <Star className={cn(meta.favorite && "fill-warning text-warning")} />
              </Button>
            </Tip>
            <Tip content={t("versions.title")}>
              <Button size="icon" variant="ghost" onClick={() => setPanel(panel === "history" ? null : "history")}>
                <History />
              </Button>
            </Tip>
            <Tip content={editorWidth === "wide" ? t("notes.narrow") : t("notes.wide")}>
              <Button size="icon" variant="ghost" onClick={() => updateSettings({ editorWidth: editorWidth === "wide" ? "narrow" : "wide" })}>
                {editorWidth === "wide" ? <Minimize2 /> : <Maximize2 />}
              </Button>
            </Tip>
            <Tip content={t("notes.togglePanel")}>
              <Button size="icon" variant="ghost" onClick={() => setPanel(panel ? null : "details")}>
                <PanelRight className="rtl:-scale-x-100" />
              </Button>
            </Tip>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label={t("common.actions")}>
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Camera />} onSelect={() => void snapshot()}>{t("versions.snapshot")}</MenuItem>
                <MenuItem icon={<Copy />} onSelect={async () => { await flush(); const d = await s.notes.duplicate(note.id, `(${t("common.copy")})`); await invalidateAll(); navigate(`/notes/${d.id}`); }}>
                  {t("common.duplicate")}
                </MenuItem>
                <MenuItem icon={<FileDown />} onSelect={() => void exportAs("md")}>{t("notes.exportMd")}</MenuItem>
                <MenuItem icon={<FileDown />} onSelect={() => void exportAs("html")}>{t("notes.exportHtml")}</MenuItem>
                <MenuItem icon={<Archive />} onSelect={() => void saveMeta({ archived: !meta.archived })}>{meta.archived ? t("common.unarchive") : t("common.archive")}</MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger onSelect={() => void remove()}>{t("common.delete")}</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
        {meta.archived && <div className="border-b border-warning/30 bg-warning/10 px-6 py-1.5 text-xs text-warning">{t("notes.archivedBanner")}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn("mx-auto px-8 pb-24 pt-6", editorWidth === "wide" ? "max-w-6xl" : "max-w-3xl")}>
            <input
              value={title}
              autoFocus={fresh}
              onFocus={(e) => fresh && title === i18n.t("notes.untitled") && e.currentTarget.select()}
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) schedule({ title: e.target.value });
              }}
              placeholder={t("notes.titlePlaceholder")}
              className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-subtle"
              dir="auto"
              aria-label={t("fields.title")}
            />
            <RichEditor
              key={editorKey}
              className="mt-4"
              content={content}
              autoFocus={!fresh}
              onChange={(json, text) => schedule({ content: json, contentText: text })}
            />
          </div>
        </div>
      </div>

      {panel && (
        <aside className="flex w-[360px] shrink-0 flex-col border-s border-border bg-elev">
          <Tabs
            value={panel}
            onValueChange={(v) => setPanel(v as "details")}
            tabs={[
              { value: "details", label: t("notes.details") },
              { value: "files", label: t("files.attachments") },
              { value: "history", label: t("versions.title") },
            ]}
            listClassName="px-3"
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panel === "details" && (
              <RecordForm
                columns={1}
                value={meta as unknown as Record<string, unknown>}
                errors={metaErrors}
                onChange={(p) => void saveMeta(p as Partial<Note>)}
                fields={[
                  { name: "noteType", kind: "enum", enum: "noteType", required: true },
                  { name: "status", kind: "enum", enum: "noteStatus", required: true },
                  { name: "subjectId", kind: "subject" },
                  { name: "lectureId", kind: "lecture", subjectField: "subjectId" },
                  { name: "lectureDate", kind: "date" },
                  { name: "projectId", kind: "project" },
                  { name: "cyberTopic", kind: "enum", enum: "cyberTopic" },
                  { name: "tags", kind: "tags" },
                  { name: "links", kind: "links" },
                ]}
              />
            )}
            {panel === "details" && (
              <div className="mt-6 space-y-1 border-t border-border pt-3 text-xs text-subtle">
                <div>{t("fields.createdAt")}: {fmtDateTime(note.createdAt)}</div>
                <div>{t("fields.updatedAt")}: {fmtDateTime(savedAt)}</div>
                <div>{t("notes.words", { count: meta.wordCount })}</div>
              </div>
            )}
            {panel === "files" && <AttachmentsPanel entityType="note" entityId={note.id} />}
            {panel === "history" && (
              <VersionHistory
                entityType="note"
                entityId={note.id}
                currentText={() => pending.current?.contentText ?? meta.contentText}
                onBeforeRestore={flush}
                onRestored={async () => {
                  const n = await s.repos.notes.require(note.id);
                  setContent(n.content);
                  setTitle(n.title);
                  setMeta(n);
                  setEditorKey((k) => k + 1);
                  void invalidateAll();
                }}
                restore={(vid) => s.notes.restoreVersion(note.id, vid)}
              />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function SaveIndicator({ state, savedAt }: { state: "saved" | "saving" | "unsaved" | "error"; savedAt: string | null }) {
  const { t } = useTranslation();
  return (
    <span className="me-2 flex items-center gap-1.5 text-xs text-muted" aria-live="polite" data-testid="save-indicator" data-state={state}>
      {state === "saving" && (<><Loader2 className="size-3.5 animate-spin" /> {t("status.saving")}</>)}
      {state === "saved" && (<><CheckCircle2 className="size-3.5 text-success" /> {t("status.savedAt", { time: savedAt ? new Date(savedAt).toLocaleTimeString(i18n.language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "" })}</>)}
      {state === "unsaved" && (<><CircleDot className="size-3.5 text-warning" /> {t("status.unsaved")}</>)}
      {state === "error" && (<><AlertTriangle className="size-3.5 text-danger" /> {t("status.saveError")}</>)}
    </span>
  );
}
