import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { FolderKanban, Plus, CalendarDays, Users } from "lucide-react";
import { PageHeader, Toolbar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar, Segmented } from "@/components/ui/controls";
import { SubjectSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { PriorityBadge, SubjectChip } from "@/components/common/badges";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useNewParam, useSubjectMap, useActiveSemester } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { diffDays, toDateKey } from "@/core/utils/dates";
import type { Project } from "@/core/model/types";
import { PALETTE } from "@/components/ui/controls";

export const PROJECT_TONE = { idea: "neutral", planning: "info", in_progress: "accent", review: "warning", submitted: "success", completed: "success", archived: "neutral" } as const;

export function ProjectEditor({ editor }: { editor: ReturnType<typeof useEditor<Project>> }) {
  const { t } = useTranslation();
  const s = useServices();
  return (
    <EntityDrawer<Project>
      editor={editor}
      width="w-[620px]"
      title={{ create: "projects.new", edit: "projects.edit" }}
      initial={(e, d) => (e ? { ...e } : { status: "planning", priority: "medium", progressMode: "tasks", color: PALETTE[1], startDate: toDateKey(new Date()), ...d })}
      fields={(d) => [
        { name: "name", kind: "text", required: true, span: 2, autoFocus: true },
        { name: "status", kind: "enum", enum: "projectStatus", required: true },
        { name: "priority", kind: "enum", enum: "priority", required: true },
        { name: "subjectId", kind: "subject" },
        { name: "semesterId", kind: "semester" },
        { name: "professor", kind: "text" },
        { name: "color", kind: "color" },
        { name: "startDate", kind: "date" },
        { name: "deadline", kind: "date" },
        { name: "progressMode", kind: "enum", enum: "progressMode", required: true, hint: "projects.progressModeHint" },
        d.progressMode === "manual" ? { name: "progress", kind: "number", min: 0, max: 100 } : null,
        { name: "description", kind: "textarea", span: 2, rows: 4 },
        { name: "links", kind: "links", span: 2, label: "projects.links" },
        { name: "tags", kind: "tags", span: 2 },
      ]}
      onSave={async (d, e) => {
        if (e) return s.repos.projects.update(e.id, d as Partial<Project>);
        const p = await s.projects.create(d as Partial<Project>);
        await s.files.ensureProjectFolder(p).catch(() => undefined);
        return p;
      }}
      onDelete={(e) => s.repos.projects.remove(e.id)}
      deleteConfirm={(e) => ({ description: t("projects.deleteBody"), typeToConfirm: e.name })}
    />
  );
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const editor = useEditor<Project>();
  const { semester } = useActiveSemester();
  const [status, setStatus] = React.useState<string>("active");
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  useNewParam((p) => editor.create({ subjectId: p.get("subjectId"), semesterId: semester?.id ?? null }));

  const { data = [], isLoading } = useQ(["projects", "page", status, subjectId], async () => {
    const all = await s.projects.list({ subjectId, includeArchived: true });
    if (status === "active") return all.filter((p) => !["completed", "archived", "submitted"].includes(p.status));
    if (status === "all") return all;
    return all.filter((p) => p.status === status);
  });
  const { data: prog } = useQ(["projects", "progress", data.map((p) => p.id).join()], () => s.projects.progress(data.map((p) => p.id)), { enabled: data.length > 0 });
  const { data: teamSizes } = useQ(["projects", "team", data.map((p) => p.id).join()], async () => {
    const rows = await s.db.query<{ project_id: string; n: number }>("SELECT project_id, COUNT(*) AS n FROM project_members GROUP BY project_id");
    return new Map(rows.map((r) => [r.project_id, r.n]));
  });
  const today = toDateKey(new Date());

  return (
    <div>
      <PageHeader
        icon={<FolderKanban />}
        title={t("nav.projects")}
        description={t("projects.lead")}
        actions={
          <Button variant="primary" onClick={() => editor.create({ subjectId, semesterId: semester?.id ?? null })}>
            <Plus /> {t("projects.new")}
          </Button>
        }
      >
        <Toolbar>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: t("projects.filters.active") },
              { value: "idea", label: t("enums.projectStatus.idea") },
              { value: "submitted", label: t("enums.projectStatus.submitted") },
              { value: "completed", label: t("enums.projectStatus.completed") },
              { value: "archived", label: t("enums.projectStatus.archived") },
              { value: "all", label: t("common.all") },
            ]}
          />
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-52" />
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<FolderKanban />} title={t("projects.empty")} description={t("projects.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("projects.new")}</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((p) => {
              const pr = prog?.get(p.id);
              const days = p.deadline ? diffDays(today, p.deadline) : null;
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="card group flex flex-col p-4 transition-colors hover:border-accent/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color ?? "rgb(var(--accent))" }} />
                      <h3 className="truncate font-semibold group-hover:text-accent">{p.name}</h3>
                    </div>
                    <Badge tone={PROJECT_TONE[p.status]}>{t(`enums.projectStatus.${p.status}`)}</Badge>
                  </div>
                  {p.description && <p className="mt-2 line-clamp-2 text-xs text-muted" dir="auto">{p.description}</p>}
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{t("projects.progress")}</span>
                      <span className="tabular-nums">{pr?.percent ?? p.progress}%</span>
                    </div>
                    <ProgressBar value={pr?.percent ?? p.progress} />
                    {pr && pr.tasksTotal > 0 && <div className="mt-1 text-[11px] text-subtle">{t("projects.tasksDone", { done: pr.tasksDone, total: pr.tasksTotal })}</div>}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 text-xs text-muted">
                    <SubjectChip subject={p.subjectId ? subjects.get(p.subjectId) : null} link={false} />
                    {p.deadline && (
                      <span className={days !== null && days < 0 && !["completed", "submitted"].includes(p.status) ? "text-danger" : ""}>
                        <CalendarDays className="me-1 inline size-3" />
                        {fmtDate(p.deadline)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" /> {teamSizes?.get(p.id) ?? 0}
                    </span>
                    {(p.priority === "high" || p.priority === "urgent") && <PriorityBadge priority={p.priority} />}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <ProjectEditor editor={editor} />
    </div>
  );
}
