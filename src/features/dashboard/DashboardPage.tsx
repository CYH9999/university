import * as React from "react";
import { useTranslation } from "react-i18next";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LayoutDashboard, SlidersHorizontal, GripVertical, EyeOff, Eye, RotateCcw, Check } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useSettings, DASHBOARD_WIDGETS, type DashboardWidget } from "@/app/settings";
import { WIDGETS, WIDGET_META } from "./widgets";
import { fmtDate, fmtWeekday } from "@/lib/format";
import { toDateKey } from "@/core/utils/dates";
import { cn } from "@/lib/cn";

function SortableWidget({ id, editing, onHide }: { id: DashboardWidget; editing: boolean; onHide: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  const Widget = WIDGETS[id];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", WIDGET_META[id].wide && "md:col-span-2", isDragging && "z-10 opacity-80")}
    >
      <Card className={cn("h-full min-h-[180px] overflow-hidden", editing && "ring-1 ring-dashed ring-accent/40")}>
        <Widget />
      </Card>
      {editing && (
        <div className="absolute end-2 top-2 flex gap-1 rounded-md border border-border bg-elev p-0.5 shadow">
          <button type="button" className="cursor-grab rounded p-1 text-muted hover:text-fg active:cursor-grabbing" aria-label={t("dashboard.drag")} {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
          <button type="button" className="rounded p-1 text-muted hover:text-danger" aria-label={t("dashboard.hide")} onClick={onHide}>
            <EyeOff className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const dashboard = useSettings((s) => s.settings.dashboard);
  const update = useSettings((s) => s.update);
  const [editing, setEditing] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const visible = dashboard.order.filter((w) => !dashboard.hidden.includes(w));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = dashboard.order.indexOf(e.active.id as DashboardWidget);
    const to = dashboard.order.indexOf(e.over.id as DashboardWidget);
    update({ dashboard: { order: arrayMove(dashboard.order, from, to) } });
  };
  const now = new Date();

  return (
    <div>
      <PageHeader
        icon={<LayoutDashboard />}
        title={t("nav.dashboard")}
        description={`${fmtWeekday(now)} · ${fmtDate(toDateKey(now), "d MMMM yyyy")}`}
        actions={
          editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => update({ dashboard: { order: [...DASHBOARD_WIDGETS], hidden: [] } })}>
                <RotateCcw /> {t("dashboard.reset")}
              </Button>
              <Button size="sm" variant="primary" onClick={() => setEditing(false)}>
                <Check /> {t("common.done")}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              <SlidersHorizontal /> {t("dashboard.customize")}
            </Button>
          )
        }
      />
      {editing && dashboard.hidden.length > 0 && (
        <div className="mx-6 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs">
          <span className="text-muted">{t("dashboard.hiddenWidgets")}:</span>
          {dashboard.hidden.map((w) => (
            <Button key={w} size="sm" variant="outline" onClick={() => update({ dashboard: { hidden: dashboard.hidden.filter((x) => x !== w) } })}>
              <Eye /> {t(`dashboard.widgets.${w}`)}
            </Button>
          ))}
        </div>
      )}
      <div className="p-6">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((w) => (
                <SortableWidget key={w} id={w} editing={editing} onHide={() => update({ dashboard: { hidden: [...dashboard.hidden, w] } })} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
