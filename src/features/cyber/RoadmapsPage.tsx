import * as React from "react";
import { useTranslation } from "react-i18next";
import { Route, Plus, ArrowUp, ArrowDown, Trash2, ExternalLink, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar, Checkbox } from "@/components/ui/controls";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/overlay";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { useServices } from "@/app/services";
import { useQ, useMut, invalidateAll } from "@/app/query";
import { confirm } from "@/app/confirm";
import { useSettings } from "@/app/settings";
import { useNewParam, useOpenParam } from "@/lib/hooks";
import { openApi } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { roadmapTemplate } from "@/core/templates";
import type { Roadmap, RoadmapItem } from "@/core/model/types";
import { cn } from "@/lib/cn";

export function RoadmapsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const lang = useSettings((x) => x.settings.language);
  const editor = useEditor<Roadmap>();
  const itemEditor = useEditor<RoadmapItem>();
  const [openId, setOpenId] = React.useState<string | null>(null);
  useNewParam(() => editor.create({}));
  useOpenParam((id) => setOpenId(id));
  const { data: roadmaps = [], isLoading } = useQ(["roadmaps"], () => s.repos.roadmaps.list());
  const { data: items = [] } = useQ(["roadmap-items"], () => s.repos.roadmapItems.list({ limit: 10000 }));
  const byRoadmap = React.useMemo(() => {
    const m = new Map<string, RoadmapItem[]>();
    for (const i of items) m.set(i.roadmapId, [...(m.get(i.roadmapId) ?? []), i]);
    return m;
  }, [items]);
  const selected = roadmaps.find((r) => r.id === openId) ?? roadmaps[0] ?? null;
  const list = selected ? byRoadmap.get(selected.id) ?? [] : [];

  const setStatus = useMut(({ it, done }: { it: RoadmapItem; done: boolean }) => s.repos.roadmapItems.update(it.id, { status: done ? "done" : "todo", completedAt: done ? new Date().toISOString() : null }));
  const move = async (idx: number, dir: -1 | 1) => {
    const a = list[idx];
    const b = list[idx + dir];
    if (!a || !b) return;
    try {
      await s.db.batch([
        { sql: "UPDATE roadmap_items SET sort_order = ? WHERE id = ?", params: [b.sortOrder, a.id] },
        { sql: "UPDATE roadmap_items SET sort_order = ? WHERE id = ?", params: [a.sortOrder, b.id] },
      ]);
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const [quick, setQuick] = React.useState("");
  const addItem = useMut((title: string) => s.repos.roadmapItems.create({ roadmapId: selected!.id, title, sortOrder: (list.at(-1)?.sortOrder ?? 0) + 1 } as never), { onSuccess: () => setQuick("") });
  const removeRoadmap = async (r: Roadmap) => {
    if (!(await confirm({ title: t("confirm.deleteTitle"), description: t("roadmaps.deleteBody", { name: r.title }), confirmLabel: t("common.delete"), danger: true }))) return;
    await s.repos.roadmaps.remove(r.id);
    await invalidateAll();
    setOpenId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Route />} title={t("nav.roadmaps")} description={t("roadmaps.lead")} actions={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("roadmaps.new")}</Button>} />
      {!isLoading && roadmaps.length === 0 ? (
        <div className="p-6"><EmptyState icon={<Route />} title={t("roadmaps.empty")} description={t("roadmaps.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("roadmaps.new")}</Button>} /></div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-72 shrink-0 space-y-1 overflow-y-auto border-e border-border p-3">
            {roadmaps.map((r) => {
              const its = byRoadmap.get(r.id) ?? [];
              const done = its.filter((i) => i.status === "done").length;
              const pct = its.length ? Math.round((done / its.length) * 100) : 0;
              return (
                <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className={cn("w-full rounded-md px-3 py-2 text-start hover:bg-surface-2", selected?.id === r.id && "bg-accent/10")}>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: r.color ?? "rgb(var(--accent))" }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                    <span className="text-[11px] tabular-nums text-subtle">{pct}%</span>
                  </div>
                  <ProgressBar className="mt-1.5" value={pct} tone={pct === 100 ? "success" : "accent"} />
                </button>
              );
            })}
          </aside>
          {selected && (
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{selected.title}</h2>
                  <p className="text-xs text-muted">{t(`enums.roadmapTrack.${selected.track}`)}{selected.description ? ` · ${selected.description}` : ""}</p>
                </div>
                <Menu>
                  <MenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={t("common.actions")}><MoreHorizontal /></Button></MenuTrigger>
                  <MenuContent>
                    <MenuItem icon={<Pencil />} onSelect={() => editor.edit(selected)}>{t("common.edit")}</MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} danger onSelect={() => void removeRoadmap(selected)}>{t("common.delete")}</MenuItem>
                  </MenuContent>
                </Menu>
              </div>
              <Card className="divide-y divide-border">
                {list.length === 0 && <p className="px-4 py-3 text-xs text-subtle">{t("roadmaps.noItems")}</p>}
                {list.map((it, i) => (
                  <div key={it.id} className="group flex items-center gap-3 px-4 py-2.5">
                    <Checkbox checked={it.status === "done"} onCheckedChange={(v) => setStatus.mutate({ it, done: v })} />
                    <button type="button" className="min-w-0 flex-1 text-start" onClick={() => itemEditor.edit(it)}>
                      <div className={cn("text-sm", it.status === "done" && "text-subtle line-through", it.status === "skipped" && "text-subtle")}>{it.title}</div>
                      {it.notes && <div className="truncate text-xs text-subtle">{it.notes}</div>}
                    </button>
                    {it.status === "in_progress" && <span className="text-[11px] text-info">{t("enums.roadmapItemStatus.in_progress")}</span>}
                    {it.resourceUrl && <Button size="icon-sm" variant="ghost" onClick={() => openApi.url(it.resourceUrl!).catch((e) => toast.error(errorMessage(e)))} aria-label={t("common.open")}><ExternalLink /></Button>}
                    <div className="flex opacity-0 group-hover:opacity-100">
                      <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("common.moveUp")}><ArrowUp /></Button>
                      <Button size="icon-sm" variant="ghost" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={t("common.moveDown")}><ArrowDown /></Button>
                    </div>
                  </div>
                ))}
              </Card>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (quick.trim()) addItem.mutate(quick.trim()); }}>
                <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t("roadmaps.addItem")} />
                <Button type="submit"><Plus /> {t("common.add")}</Button>
              </form>
            </div>
          )}
        </div>
      )}
      <EntityDrawer<Roadmap>
        editor={editor}
        title={{ create: "roadmaps.new", edit: "roadmaps.edit" }}
        initial={(e, d) => (e ? { ...e } : { track: "linux", useTemplate: true, ...d })}
        fields={(d) => [
          { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
          { name: "track", kind: "enum", enum: "roadmapTrack", required: true },
          { name: "color", kind: "color" },
          { name: "description", kind: "textarea", span: 2 },
          !editor.entity && d.track !== "custom" ? { name: "useTemplate", kind: "bool", label: "roadmaps.useTemplate", description: "roadmaps.useTemplateHint", span: 2 } : null,
        ]}
        onSave={async (d, e) => {
          const { useTemplate, ...rest } = d as Record<string, unknown> & { useTemplate?: boolean };
          if (e) return s.repos.roadmaps.update(e.id, rest as Partial<Roadmap>);
          const r = await s.repos.roadmaps.create(rest as never);
          if (useTemplate) {
            const titles = roadmapTemplate(r.track, lang);
            await s.db.batch(titles.flatMap((title, i) => s.repos.roadmapItems.createStatements(s.repos.roadmapItems.build({ roadmapId: r.id, title, sortOrder: i } as never))));
          }
          setOpenId(r.id);
          return r;
        }}
      />
      <EntityDrawer<RoadmapItem>
        editor={itemEditor}
        title={{ create: "roadmaps.newItem", edit: "roadmaps.editItem" }}
        fields={[
          { name: "title", kind: "text", required: true, span: 2 },
          { name: "status", kind: "enum", enum: "roadmapItemStatus", required: true },
          { name: "resourceUrl", kind: "url" },
          { name: "description", kind: "textarea", span: 2 },
          { name: "notes", kind: "textarea", span: 2, rows: 4 },
        ]}
        onSave={(d, e) => s.repos.roadmapItems.update(e!.id, { ...(d as Partial<RoadmapItem>), completedAt: d.status === "done" ? e!.completedAt ?? new Date().toISOString() : null })}
        onDelete={(e) => s.repos.roadmapItems.remove(e.id)}
        onRestore={(snap) => s.repos.roadmapItems.restore(snap)}
      />
    </div>
  );
}
