import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Users, Trash2, Mail, Phone, CalendarDays, CheckCircle2, Circle, Flag, Milestone as MilestoneIcon, Link2, Unlink, Library, User } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge, Checkbox, ProgressBar } from "@/components/ui/controls";
import { DatePicker } from "@/components/common/DatePicker";
import { Modal } from "@/components/ui/overlay";
import { ResourceCard } from "@/features/research/ResearchPage";
import { fmtDate } from "@/lib/format";
import { toDateKey, diffDays } from "@/core/utils/dates";
import type { Meeting, Milestone, ProjectMember, ActionItem, Project, ResearchResource } from "@/core/model/types";
import { openApi } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/cn";

export function MilestonesPanel({ project }: { project: Project }) {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Milestone>();
  const { data = [] } = useQ(["milestones", project.id], () => s.projects.milestones(project.id));
  const toggle = useMut((id: string) => s.projects.toggleMilestone(id));
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="primary" onClick={() => editor.create({ projectId: project.id })}>
          <Plus /> {t("projects.milestones.new")}
        </Button>
      </div>
      {data.length === 0 ? (
        <EmptyState compact icon={<MilestoneIcon />} title={t("projects.milestones.empty")} />
      ) : (
        <ul className="card divide-y divide-border">
          {data.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <Checkbox checked={m.done} onCheckedChange={() => toggle.mutate(m.id)} />
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => editor.edit(m)}>
                <div className={cn("text-sm", m.done && "text-subtle line-through")}>{m.title}</div>
                {m.description && <div className="truncate text-xs text-subtle">{m.description}</div>}
              </button>
              {m.dueDate && <span className={cn("text-xs", !m.done && m.dueDate < toDateKey(new Date()) ? "text-danger" : "text-muted")}>{fmtDate(m.dueDate)}</span>}
            </li>
          ))}
        </ul>
      )}
      <EntityDrawer<Milestone>
        editor={editor}
        title={{ create: "projects.milestones.new", edit: "projects.milestones.edit" }}
        fields={[
          { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
          { name: "dueDate", kind: "date" },
          { name: "done", kind: "bool" },
          { name: "description", kind: "textarea", span: 2 },
        ]}
        onSave={(d, e) =>
          e
            ? s.repos.milestones.update(e.id, { ...(d as Partial<Milestone>), completedAt: d.done ? e.completedAt ?? new Date().toISOString() : null })
            : s.repos.milestones.create({ ...d, projectId: project.id, completedAt: d.done ? new Date().toISOString() : null } as never)
        }
        onDelete={(e) => s.repos.milestones.remove(e.id)}
        onRestore={(snap) => s.repos.milestones.restore(snap)}
      />
    </div>
  );
}

export function TeamPanel({ project }: { project: Project }) {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<ProjectMember>();
  const { data = [] } = useQ(["members", project.id], () => s.projects.members(project.id));
  const { data: workload } = useQ(["members", "workload", project.id], () => s.projects.memberWorkload(project.id));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-subtle">{t("projects.team.localNote")}</p>
        <Button size="sm" variant="primary" onClick={() => editor.create({ projectId: project.id })}>
          <Plus /> {t("projects.team.add")}
        </Button>
      </div>
      {data.length === 0 ? (
        <EmptyState compact icon={<Users />} title={t("projects.team.empty")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((m) => {
            const w = workload?.get(m.id);
            const total = (w?.open ?? 0) + (w?.done ?? 0);
            return (
              <Card key={m.id} className="p-4">
                <button type="button" className="flex w-full items-start gap-3 text-start" onClick={() => editor.edit(m)}>
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent">{m.name.slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{m.name}</span>
                      {m.isMe && <Badge tone="accent">{t("projects.team.me")}</Badge>}
                      <Badge tone={m.status === "done" ? "success" : m.status === "inactive" ? "neutral" : "info"}>{t(`enums.memberStatus.${m.status}`)}</Badge>
                    </div>
                    {m.role && <div className="text-xs text-muted">{m.role}</div>}
                  </div>
                </button>
                {m.responsibilities && <p className="mt-3 whitespace-pre-wrap text-xs text-muted" dir="auto">{m.responsibilities}</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                  {m.email && (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-accent" dir="ltr" onClick={() => openApi.url(`mailto:${m.email}`).catch((e) => toast.error(errorMessage(e)))}>
                      <Mail className="size-3" /> {m.email}
                    </button>
                  )}
                  {m.phone && <span className="inline-flex items-center gap-1" dir="ltr"><Phone className="size-3" /> {m.phone}</span>}
                  {m.contact && <span>{m.contact}</span>}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px] text-subtle">
                    <span>{t("projects.team.tasks", { open: w?.open ?? 0, done: w?.done ?? 0 })}</span>
                    {total > 0 && <span>{Math.round(((w?.done ?? 0) / total) * 100)}%</span>}
                  </div>
                  <ProgressBar value={total ? ((w?.done ?? 0) / total) * 100 : 0} tone="success" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <EntityDrawer<ProjectMember>
        editor={editor}
        title={{ create: "projects.team.add", edit: "projects.team.edit" }}
        initial={(e, d) => (e ? { ...e } : { status: "active", ...d })}
        fields={[
          { name: "name", kind: "text", required: true, autoFocus: true },
          { name: "role", kind: "text" },
          { name: "email", kind: "email" },
          { name: "phone", kind: "text" },
          { name: "contact", kind: "text", span: 2, hint: "projects.team.contactHint" },
          { name: "status", kind: "enum", enum: "memberStatus", required: true },
          { name: "isMe", kind: "bool", label: "projects.team.isMe" },
          { name: "responsibilities", kind: "textarea", span: 2, rows: 3 },
          { name: "notes", kind: "textarea", span: 2, rows: 2 },
        ]}
        onSave={(d, e) => (e ? s.repos.members.update(e.id, d as Partial<ProjectMember>) : s.repos.members.create({ ...d, projectId: project.id } as never))}
        onDelete={(e) => s.repos.members.remove(e.id)}
        onRestore={(snap) => s.repos.members.restore(snap)}
      />
    </div>
  );
}

function ActionItemsField({ value, onChange, members }: { value: ActionItem[]; onChange: (v: ActionItem[]) => void; members: ProjectMember[] }) {
  const { t } = useTranslation();
  const [text, setText] = React.useState("");
  const add = () => {
    if (!text.trim()) return;
    onChange([...value, { id: crypto.randomUUID(), text: text.trim(), assigneeId: null, dueDate: null, done: false }]);
    setText("");
  };
  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-sunken p-2">
          <Checkbox checked={a.done} onCheckedChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, done: v } : x)))} />
          <Input className="min-w-[160px] flex-1" value={a.text} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <NativeSelect className="w-36" value={a.assigneeId ?? ""} placeholder={t("common.unassigned")} options={members.map((m) => ({ value: m.id, label: m.name }))} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, assigneeId: e.target.value || null } : x)))} />
          <DatePicker className="w-44" value={a.dueDate} onChange={(d) => onChange(value.map((x, j) => (j === i ? { ...x, dueDate: d } : x)))} />
          {a.taskId && <Badge tone="accent">{t("projects.meetings.linkedTask")}</Badge>}
          <Button size="icon-sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t("common.remove")}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("projects.meetings.addAction")} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button size="icon" onClick={add} aria-label={t("common.add")}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export function MeetingsPanel({ project }: { project: Project }) {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Meeting>();
  const { data = [] } = useQ(["meetings", project.id], () => s.projects.meetings(project.id));
  const { data: members = [] } = useQ(["members", project.id], () => s.projects.members(project.id));
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="primary" onClick={() => editor.create({ projectId: project.id, date: toDateKey(new Date()) })}>
          <Plus /> {t("projects.meetings.new")}
        </Button>
      </div>
      {data.length === 0 ? (
        <EmptyState compact icon={<CalendarDays />} title={t("projects.meetings.empty")} />
      ) : (
        <div className="space-y-3">
          {data.map((m) => (
            <Card key={m.id} className="p-4">
              <button type="button" className="w-full text-start" onClick={() => editor.edit(m)}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{m.title}</h3>
                  <span className="text-xs text-muted">{fmtDate(m.date, "EEE d MMM yyyy")}{m.time ? ` · ${m.time}` : ""}</span>
                </div>
                {m.attendees.length > 0 && <div className="mt-1 text-xs text-subtle">{m.attendees.map(memberName).filter(Boolean).join("، ")}</div>}
              </button>
              {m.decisions && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase text-subtle">{t("fields.decisions")}</div>
                  <p className="whitespace-pre-wrap text-sm" dir="auto">{m.decisions}</p>
                </div>
              )}
              {m.actionItems.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {m.actionItems.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      {a.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted" />}
                      <span className={cn(a.done && "text-subtle line-through")}>{a.text}</span>
                      {a.assigneeId && <span className="inline-flex items-center gap-1 text-xs text-muted"><User className="size-3" />{memberName(a.assigneeId)}</span>}
                      {a.dueDate && <span className="text-xs text-subtle">{fmtDate(a.dueDate, "d MMM")}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      <EntityDrawer<Meeting>
        editor={editor}
        width="w-[680px]"
        title={{ create: "projects.meetings.new", edit: "projects.meetings.edit" }}
        initial={(e, d) => (e ? { ...e, createTasks: true } : { attendees: [], actionItems: [], createTasks: true, ...d })}
        fields={[
          { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
          { name: "date", kind: "date", required: true },
          { name: "time", kind: "time" },
          { name: "location", kind: "text", span: 2 },
          {
            name: "attendees",
            kind: "custom",
            span: 2,
            render: (v, set) => (
              <div className="flex flex-wrap gap-3">
                {members.length === 0 && <span className="text-xs text-subtle">{t("projects.team.empty")}</span>}
                {members.map((m) => {
                  const cur = (v.attendees as string[]) ?? [];
                  return <Checkbox key={m.id} checked={cur.includes(m.id)} onCheckedChange={(c) => set({ attendees: c ? [...cur, m.id] : cur.filter((x) => x !== m.id) })} label={m.name} />;
                })}
              </div>
            ),
          },
          { name: "agenda", kind: "textarea", span: 2, rows: 3 },
          { name: "notes", kind: "textarea", span: 2, rows: 4 },
          { name: "decisions", kind: "textarea", span: 2, rows: 3 },
          { name: "actionItems", kind: "custom", span: 2, render: (v, set) => <ActionItemsField value={(v.actionItems as ActionItem[]) ?? []} members={members} onChange={(a) => set({ actionItems: a })} /> },
          { name: "createTasks", kind: "bool", label: "projects.meetings.createTasks", description: "projects.meetings.createTasksHint", span: 2 },
        ]}
        onSave={(d) => {
          const { createTasks, ...rest } = d as Record<string, unknown> & { createTasks?: boolean };
          return s.projects.saveMeeting({ ...(rest as Partial<Meeting>), projectId: project.id }, !!createTasks);
        }}
        onDelete={(e) => s.repos.meetings.remove(e.id)}
        onRestore={(snap) => s.repos.meetings.restore(snap)}
      />
    </div>
  );
}

export function TimelinePanel({ project }: { project: Project }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["projects", "timeline", project.id], () => s.projects.timeline(project.id));
  const today = toDateKey(new Date());
  if (!data.length) return <EmptyState compact icon={<Flag />} title={t("projects.timeline.empty")} description={t("projects.timeline.emptyHint")} />;
  const first = data[0].date;
  const last = data[data.length - 1].date;
  const span = Math.max(1, diffDays(first, last));
  const todayPos = Math.min(100, Math.max(0, (diffDays(first, today) / span) * 100));
  const color = { start: "bg-info", deadline: "bg-danger", milestone: "bg-accent", meeting: "bg-warning", task: "bg-muted" } as const;
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="relative h-16">
          <div className="absolute inset-x-0 top-7 h-0.5 bg-border" />
          {today >= first && today <= last && (
            <div className="absolute top-2 h-12 w-px bg-danger/70" style={{ insetInlineStart: `${todayPos}%` }}>
              <span className="absolute -top-1 -translate-x-1/2 text-[10px] text-danger rtl:translate-x-1/2">{t("common.today")}</span>
            </div>
          )}
          {data.map((it, i) => (
            <div key={`${it.kind}-${it.id}-${i}`} className="absolute top-5" style={{ insetInlineStart: `${(diffDays(first, it.date) / span) * 100}%` }} title={`${it.title} · ${fmtDate(it.date)}`}>
              <span className={cn("block size-4 -translate-x-1/2 rounded-full border-2 border-bg rtl:translate-x-1/2", color[it.kind], it.done && "opacity-50")} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-subtle">
          <span>{fmtDate(first)}</span>
          <span>{fmtDate(last)}</span>
        </div>
      </Card>
      <ol className="relative space-y-3 border-s border-border ps-5">
        {data.map((it, i) => (
          <li key={`${it.kind}-${it.id}-${i}`} className="relative">
            <span className={cn("absolute -start-[27px] top-1.5 size-3 rounded-full border-2 border-bg", color[it.kind])} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs tabular-nums text-muted">{fmtDate(it.date, "EEE d MMM yyyy")}</span>
              <Badge>{t(`projects.timeline.kinds.${it.kind}`)}</Badge>
              <span className={cn("text-sm", it.done && it.kind !== "start" && "text-subtle line-through")}>{it.title}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ProjectResearchPanel({ project }: { project: Project }) {
  const { t } = useTranslation();
  const s = useServices();
  const [picker, setPicker] = React.useState(false);
  const { data: ids = [] } = useQ(["project-resources", project.id], () => s.links.targets("project", project.id, "resource"));
  const { data: direct = [] } = useQ(["project-resources-direct", project.id], () => s.repos.resources.list({ where: ["t.project_id = ?"], params: [project.id] }));
  const allIds = [...new Set([...ids, ...direct.map((r) => r.id)])];
  const { data: resources = [] } = useQ(["resources", "byIds", allIds.join()], () => s.repos.resources.getMany(allIds));
  const { data: all = [] } = useQ(["resources", "all-picker"], () => s.repos.resources.list({ limit: 5000 }), { enabled: picker });
  const link = useMut((rid: string) => s.links.link("project", project.id, "resource", rid, "source"));
  const unlink = useMut(async (r: ResearchResource) => {
    await s.links.unlink("project", project.id, "resource", r.id);
    if (r.projectId === project.id) await s.repos.resources.update(r.id, { projectId: null });
  });
  return (
    <div>
      <div className="mb-3 flex justify-end gap-2">
        <Button size="sm" onClick={() => setPicker(true)}>
          <Link2 /> {t("projects.research.linkExisting")}
        </Button>
      </div>
      {resources.length === 0 ? (
        <EmptyState compact icon={<Library />} title={t("projects.research.empty")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((r) => (
            <div key={r.id} className="relative">
              <ResourceCard r={r} onOpen={() => undefined} />
              <Button size="icon-sm" variant="ghost" className="absolute end-2 bottom-2" onClick={() => unlink.mutate(r)} aria-label={t("files.unlink")}>
                <Unlink />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Modal open={picker} onOpenChange={setPicker} title={t("projects.research.linkExisting")}>
        {all.length === 0 ? (
          <EmptyState compact title={t("research.empty")} />
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {all.map((r) => {
              const linked = allIds.includes(r.id);
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                  <Button size="sm" variant={linked ? "ghost" : "outline"} disabled={linked} onClick={() => link.mutate(r.id)}>
                    {linked ? t("projects.research.linked") : t("projects.research.link")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </div>
  );
}

