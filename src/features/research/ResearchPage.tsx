import * as React from "react";
import { useTranslation } from "react-i18next";
import { Library, Plus, Star, ExternalLink, FileText, Upload, Copy, BookOpenCheck, Link2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Toolbar, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/controls";
import { SubjectSelect, EnumSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { SubjectChip } from "@/components/common/badges";
import { AttachmentsPanel, openFile, FileTypeIcon } from "@/components/common/files";
import { useServices } from "@/app/services";
import { useQ, useMut, invalidateAll } from "@/app/query";
import { useNewParam, useOpenParam, useSubjectMap, useDebounced } from "@/lib/hooks";
import { dialogs, openApi } from "@/platform/tauri";
import { errorMessage, fileFailureMessage } from "@/lib/errors";
import type { ResearchResource, FileRecord } from "@/core/model/types";
import { cn } from "@/lib/cn";

const READ_TONE = { unread: "neutral", reading: "info", read: "success", reference: "accent" } as const;

export function ResourceEditor({ editor }: { editor: ReturnType<typeof useEditor<ResearchResource>> }) {
  const { t } = useTranslation();
  const s = useServices();
  return (
    <EntityDrawer<ResearchResource>
      editor={editor}
      title={{ create: "research.new", edit: "research.edit" }}
      initial={(e, d) => (e ? { ...e } : { type: "pdf", readStatus: "unread", ...d })}
      fields={[
        { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
        { name: "type", kind: "enum", enum: "resourceType", required: true },
        { name: "readStatus", kind: "enum", enum: "readStatus", required: true },
        { name: "authors", kind: "text", span: 2 },
        { name: "subjectId", kind: "subject" },
        { name: "projectId", kind: "project" },
        { name: "year", kind: "number", min: 0, max: 3000 },
        { name: "publisher", kind: "text" },
        { name: "url", kind: "url", span: 2 },
        { name: "description", kind: "textarea", span: 2 },
        { name: "notes", kind: "textarea", span: 2, rows: 4 },
        { name: "citation", kind: "textarea", span: 2, rows: 2, hint: "research.citationHint" },
        { name: "tags", kind: "tags", span: 2 },
        { name: "favorite", kind: "bool" },
      ]}
      onSave={(d, e) => (e ? s.repos.resources.update(e.id, d as Partial<ResearchResource>) : s.repos.resources.create(d as never))}
      onDelete={(e) => s.repos.resources.remove(e.id)}
      onRestore={(snap) => s.repos.resources.restore(snap)}
    >
      {(e) => (e ? <AttachmentsPanel entityType="resource" entityId={e.id} title={t("research.files")} /> : <p className="text-xs text-subtle">{t("files.saveFirst")}</p>)}
    </EntityDrawer>
  );
}

function citationFor(r: ResearchResource): string {
  if (r.citation) return r.citation;
  const parts = [r.authors, r.year ? `(${r.year})` : null, r.title, r.publisher, r.url].filter(Boolean);
  return parts.join(". ");
}

export function ResourceCard({ r, onOpen, file }: { r: ResearchResource; onOpen: () => void; file?: FileRecord | null }) {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const toggleFav = useMut(() => s.repos.resources.update(r.id, { favorite: !r.favorite }));
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
          {file ? <FileTypeIcon ext={file.ext} className="size-4" /> : r.url ? <Link2 className="size-4 text-info" /> : <BookOpenCheck className="size-4 text-muted" />}
        </div>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
          <h3 className="line-clamp-2 text-sm font-medium" dir="auto">{r.title}</h3>
          {r.authors && <p className="mt-0.5 truncate text-xs text-muted">{r.authors}{r.year ? ` · ${r.year}` : ""}</p>}
        </button>
        <button type="button" onClick={() => toggleFav.mutate(undefined)} aria-label={t("notes.favorite")} className="text-muted hover:text-warning">
          <Star className={cn("size-4", r.favorite && "fill-warning text-warning")} />
        </button>
      </div>
      {r.description && <p className="mt-2 line-clamp-2 text-xs text-muted" dir="auto">{r.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge>{t(`enums.resourceType.${r.type}`)}</Badge>
        <Badge tone={READ_TONE[r.readStatus]}>{t(`enums.readStatus.${r.readStatus}`)}</Badge>
        <SubjectChip subject={r.subjectId ? subjects.get(r.subjectId) : null} />
      </div>
      <div className="mt-auto flex flex-wrap gap-1 pt-3">
        {file && (
          <Button size="sm" variant="ghost" onClick={() => openFile(file, s.files.markOpened)}>
            <FileText /> {t("research.openFile")}
          </Button>
        )}
        {r.url && (
          <Button size="sm" variant="ghost" onClick={() => openApi.url(r.url!).catch((e) => toast.error(errorMessage(e)))}>
            <ExternalLink /> {t("research.openLink")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(citationFor(r));
            toast.success(t("research.citationCopied"));
          }}
        >
          <Copy /> {t("research.copyCitation")}
        </Button>
      </div>
    </Card>
  );
}

export function ResourceGrid({ subjectId, projectIds, emptyTitle, readStatus, type, text, favorite }: { subjectId?: string | null; projectIds?: string[]; emptyTitle?: string; readStatus?: string | null; type?: string | null; text?: string; favorite?: boolean }) {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<ResearchResource>();
  const where: string[] = [];
  const params: string[] = [];
  if (subjectId) {
    where.push("t.subject_id = ?");
    params.push(subjectId);
  }
  if (projectIds) {
    if (!projectIds.length) where.push("0");
    else {
      where.push(`t.id IN (${projectIds.map(() => "?").join(",")})`);
      params.push(...projectIds);
    }
  }
  if (readStatus) {
    where.push("t.read_status = ?");
    params.push(readStatus);
  }
  if (type) {
    where.push("t.type = ?");
    params.push(type);
  }
  if (favorite) where.push("t.favorite = 1");
  if (text?.trim()) {
    where.push("(t.title LIKE ? OR t.authors LIKE ? OR t.description LIKE ? OR t.notes LIKE ?)");
    params.push(...Array(4).fill(`%${text.trim()}%`));
  }
  const { data = [], isLoading } = useQ(["resources", "list", where, params], () => s.repos.resources.list({ where, params, limit: 5000 }));
  const fileIds = data.map((r) => r.id);
  const { data: files } = useQ(["resources", "files", fileIds.join()], async () => {
    const out = new Map<string, FileRecord>();
    for (const r of data) {
      const f = r.fileId ? await s.repos.files.get(r.fileId) : (await s.files.forEntity("resource", r.id))[0];
      if (f) out.set(r.id, f);
    }
    return out;
  }, { enabled: data.length > 0 });
  useOpenParam((id) => void s.repos.resources.get(id).then((r) => r && editor.edit(r)));
  useNewParam((p) => editor.create({ subjectId: p.get("subjectId") ?? subjectId ?? null }));

  return (
    <>
      {!isLoading && data.length === 0 ? (
        <EmptyState icon={<Library />} title={emptyTitle ?? t("research.empty")} description={t("research.emptyHint")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => (
            <ResourceCard key={r.id} r={r} file={files?.get(r.id)} onOpen={() => editor.edit(r)} />
          ))}
        </div>
      )}
      <ResourceEditor editor={editor} />
    </>
  );
}

/** Imports local PDFs/documents into the Research Library and creates one resource per file. */
export function useImportResources() {
  const { t } = useTranslation();
  const s = useServices();
  return async (subjectId: string | null, projectId: string | null = null) => {
    const picked = await dialogs.pickFiles(t("research.chooseFiles"));
    if (!picked.length) return;
    try {
      let n = 0;
      for (const src of picked) {
        const name = src.split(/[\\/]/).pop() ?? src;
        const title = name.replace(/\.[^.]+$/, "");
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        const r = await s.repos.resources.create({ title, type: ext === "pdf" ? "pdf" : "article", subjectId, projectId, readStatus: "unread" } as never);
        const res = await s.files.attach("resource", r.id, [src]);
        const f = res.imported[0] ?? res.linkedExisting[0];
        if (f) await s.repos.resources.update(r.id, { fileId: f.id });
        else await s.repos.resources.remove(r.id);
        if (f) n++;
        for (const fail of res.failed) toast.error(fileFailureMessage(fail));
      }
      await invalidateAll();
      toast.success(t("research.imported", { count: n }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
}

export function ResearchPage() {
  const { t } = useTranslation();
  const editor = useEditor<ResearchResource>();
  const importFiles = useImportResources();
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [type, setType] = React.useState<string | null>(null);
  const [readStatus, setReadStatus] = React.useState<string | null>(null);
  const [favorite, setFavorite] = React.useState(false);
  const [text, setText] = React.useState("");
  const dText = useDebounced(text);
  return (
    <div>
      <PageHeader
        icon={<Library />}
        title={t("nav.research")}
        description={t("research.lead")}
        actions={
          <>
            <Button onClick={() => importFiles(subjectId)}>
              <Upload /> {t("research.importFiles")}
            </Button>
            <Button variant="primary" onClick={() => editor.create({ subjectId })}>
              <Plus /> {t("research.new")}
            </Button>
          </>
        }
      >
        <Toolbar>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("common.filter")} className="w-56" />
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-48" />
          <EnumSelect name="resourceType" value={type} onChange={setType} placeholder={t("filters.allTypes")} className="w-40" />
          <EnumSelect name="readStatus" value={readStatus} onChange={setReadStatus} placeholder={t("filters.anyStatus")} className="w-36" />
          <Button size="sm" variant={favorite ? "primary" : "ghost"} onClick={() => setFavorite((f) => !f)}>
            <Star /> {t("notes.scopes.favorites")}
          </Button>
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        <ResourceGrid subjectId={subjectId} type={type} readStatus={readStatus} favorite={favorite} text={dText} />
      </div>
      <ResourceEditor editor={editor} />
    </div>
  );
}
