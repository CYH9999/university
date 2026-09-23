import { useTranslation } from "react-i18next";
import { MapPin, Clock, AlarmClock, Plus } from "lucide-react";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useSubjectMap } from "@/lib/hooks";
import { EmptyState } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { CountdownBadge, PriorityBadge, SubjectChip, EnumBadge } from "@/components/common/badges";
import { useEditor } from "@/components/common/EntityDrawer";
import { DeadlineEditor } from "./DeadlineEditor";
import { fmtDate } from "@/lib/format";
import type { Deadline } from "@/core/model/types";
import type { DeadlineFilter } from "@/core/services/deadlines";
import { cn } from "@/lib/cn";

export function DeadlineRow({ d, onOpen, onToggle, showSubject = true }: { d: Deadline; onOpen: () => void; onToggle: () => void; showSubject?: boolean }) {
  const { t } = useTranslation();
  const subjects = useSubjectMap();
  const done = ["completed", "submitted"].includes(d.status);
  return (
    <li className={cn("group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/40", done && "opacity-60")}>
      <Checkbox checked={done} onCheckedChange={onToggle} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <div className={cn("truncate text-sm font-medium", done && "line-through")}>{d.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-subtle">
          <EnumBadge name="deadlineType" value={d.type} tone={d.type === "exam" || d.type === "quiz" ? "danger" : "neutral"} />
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {fmtDate(d.dueDate, "EEE d MMM yyyy")}
            {d.dueTime && <span dir="ltr">{d.dueTime}{d.endTime ? `–${d.endTime}` : ""}</span>}
          </span>
          {d.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {d.location}
            </span>
          )}
          {showSubject && <SubjectChip subject={d.subjectId ? subjects.get(d.subjectId) : null} link={false} />}
          {d.tags.map((tag) => (
            <span key={tag} className="text-accent/80">#{tag}</span>
          ))}
        </div>
      </button>
      {(d.priority === "high" || d.priority === "urgent") && <PriorityBadge priority={d.priority} />}
      <CountdownBadge deadline={d} />
      <span className="sr-only">{t(`enums.deadlineStatus.${d.status}`)}</span>
    </li>
  );
}

/** Embeddable list of deadlines (used by the Deadlines page, subject and project pages). */
export function DeadlineList({ filter, defaults, emptyTitle, showSubject = true, allowCreate = true }: { filter: DeadlineFilter & { types?: string[] }; defaults?: Partial<Deadline>; emptyTitle?: string; showSubject?: boolean; allowCreate?: boolean }) {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Deadline>();
  const { data = [], isLoading } = useQ(["deadlines", "list", filter], async () => {
    const rows = await s.deadlines.list(filter);
    return filter.types?.length ? rows.filter((r) => filter.types!.includes(r.type)) : rows;
  });
  const toggle = useMut((d: Deadline) => s.deadlines.setStatus(d.id, ["completed", "submitted"].includes(d.status) ? "pending" : d.type === "exam" || d.type === "quiz" ? "completed" : "submitted"));
  return (
    <div>
      {allowCreate && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="primary" onClick={() => editor.create(defaults ?? {})}>
            <Plus /> {t("deadlines.new")}
          </Button>
        </div>
      )}
      {!isLoading && data.length === 0 ? (
        <EmptyState compact icon={<AlarmClock />} title={emptyTitle ?? t("deadlines.empty")} />
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          {data.map((d) => (
            <DeadlineRow key={d.id} d={d} showSubject={showSubject} onOpen={() => editor.edit(d)} onToggle={() => toggle.mutate(d)} />
          ))}
        </ul>
      )}
      <DeadlineEditor editor={editor} />
    </div>
  );
}
