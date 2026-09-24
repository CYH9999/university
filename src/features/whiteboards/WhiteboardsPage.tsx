import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { PenTool, Plus, MoreHorizontal, Pencil, Trash2, FolderSearch } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Toolbar, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/overlay";
import { SubjectSelect, ProjectSelect } from "@/components/common/pickers";
import { SubjectChip } from "@/components/common/badges";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { confirm } from "@/app/confirm";
import { useNewParam, useSubjectMap, useProjectMap } from "@/lib/hooks";
import { fmtRelative } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { safeFileName } from "@/core/utils/text";
import { openApi } from "@/platform/tauri";
import type { Whiteboard } from "@/core/model/types";

/** An empty Excalidraw scene in the standard .excalidraw file format. */
export function emptyScene(): string {
  return JSON.stringify({ type: "excalidraw", version: 2, source: "unios", elements: [], appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} }, null, 2);
}

export function WhiteboardsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const subjects = useSubjectMap();
  const projects = useProjectMap();
  const editor = useEditor<Whiteboard>();
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  useNewParam((p) => editor.create({ subjectId: p.get("subjectId"), projectId: p.get("projectId") }));

  const where: string[] = [];
  const params: string[] = [];
  if (subjectId) {
    where.push("t.subject_id = ?");
    params.push(subjectId);
  }
  if (projectId) {
    where.push("t.project_id = ?");
    params.push(projectId);
  }
  const { data = [], isLoading } = useQ(["whiteboards", where, params], () => s.repos.whiteboards.list({ where, params }));

  const remove = async (w: Whiteboard) => {
    if (!(await confirm({ title: t("whiteboards.deleteTitle"), description: t("whiteboards.deleteBody", { name: w.title }), confirmLabel: t("files.moveToTrash"), danger: true }))) return;
    try {
      const [st] = await s.ctx.fs.statMany([w.fileRel]);
      if (st?.exists) await s.files.trash(w.fileRel, false, st.size);
      await s.repos.whiteboards.remove(w.id);
      await invalidateAll();
      toast.success(t("whiteboards.deleted"));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader
        icon={<PenTool />}
        title={t("nav.whiteboards")}
        description={t("whiteboards.lead")}
        actions={
          <Button variant="primary" onClick={() => editor.create({ subjectId, projectId })}>
            <Plus /> {t("whiteboards.new")}
          </Button>
        }
      >
        <Toolbar>
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-52" />
          <ProjectSelect value={projectId} onChange={setProjectId} placeholder={t("filters.allProjects")} className="w-48" />
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<PenTool />} title={t("whiteboards.empty")} description={t("whiteboards.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("whiteboards.new")}</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((w) => (
              <Card key={w.id} className="group overflow-hidden">
                <Link to={`/whiteboards/${w.id}`} className="flex h-36 items-center justify-center border-b border-border bg-sunken">
                  {w.thumbnail ? <img src={w.thumbnail} alt="" className="max-h-full max-w-full object-contain p-2" /> : <PenTool className="size-8 text-subtle" />}
                </Link>
                <div className="flex items-start gap-2 p-3">
                  <Link to={`/whiteboards/${w.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-medium group-hover:text-accent">{w.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                      <SubjectChip subject={w.subjectId ? subjects.get(w.subjectId) : null} link={false} />
                      {w.projectId && projects.get(w.projectId) && <span>▸ {projects.get(w.projectId)!.name}</span>}
                      <span>{fmtRelative(w.updatedAt)}</span>
                    </div>
                  </Link>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={t("common.actions")}><MoreHorizontal /></Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<PenTool />} onSelect={() => navigate(`/whiteboards/${w.id}`)}>{t("common.open")}</MenuItem>
                      <MenuItem icon={<Pencil />} onSelect={() => editor.edit(w)}>{t("whiteboards.renameLink")}</MenuItem>
                      <MenuItem icon={<FolderSearch />} onSelect={() => void openApi.reveal(w.fileRel).catch((e) => toast.error(errorMessage(e)))}>{t("files.reveal")}</MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 />} danger onSelect={() => void remove(w)}>{t("common.delete")}</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <EntityDrawer<Whiteboard>
        editor={editor}
        title={{ create: "whiteboards.new", edit: "whiteboards.edit" }}
        initial={(e, d) => (e ? { ...e } : { title: "", fileRel: "pending", ...d })}
        fields={[
          { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
          { name: "subjectId", kind: "subject" },
          { name: "projectId", kind: "project" },
          { name: "tags", kind: "tags", span: 2 },
        ]}
        onSave={async (d, e) => {
          if (e) {
            const title = String(d.title ?? e.title).trim();
            let fileRel = e.fileRel;
            if (title && title !== e.title) {
              const [st] = await s.ctx.fs.statMany([e.fileRel]);
              if (st?.exists) fileRel = await s.files.rename(e.fileRel, `${safeFileName(title, "board")}.excalidraw`);
            }
            return s.repos.whiteboards.update(e.id, { ...(d as Partial<Whiteboard>), fileRel });
          }
          const title = String(d.title ?? "").trim() || t("whiteboards.untitled");
          const base = safeFileName(title, "board");
          const existing = await s.ctx.fs.statMany([`Whiteboards/${base}.excalidraw`]);
          const name = existing[0]?.exists ? `${base} ${Date.now()}` : base;
          const fileRel = await s.ctx.fs.writeText(`Whiteboards/${name}.excalidraw`, emptyScene());
          const w = await s.repos.whiteboards.create({ ...d, title, fileRel } as never);
          navigate(`/whiteboards/${w.id}`);
          return w;
        }}
      />
    </div>
  );
}
