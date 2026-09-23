import { useTranslation } from "react-i18next";
import { Badge, ColorDot } from "@/components/ui/controls";
import { countdown } from "@/core/services/deadlines";
import type { Deadline, Subject } from "@/core/model/types";
import { useNow } from "@/lib/hooks";
import { Link } from "react-router";

export function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useTranslation();
  const tone = ({ urgent: "danger", high: "warning", medium: "info", low: "neutral" } as const)[priority as "low"] ?? "neutral";
  return <Badge tone={tone}>{t(`enums.priority.${priority}`)}</Badge>;
}

export function EnumBadge({ name, value, tone = "neutral" }: { name: string; value: string; tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info" }) {
  const { t } = useTranslation();
  return <Badge tone={tone}>{t(`enums.${name}.${value}`)}</Badge>;
}

export function SubjectChip({ subject, link = true }: { subject: Subject | null | undefined; link?: boolean }) {
  if (!subject) return null;
  const inner = (
    <span className="inline-flex max-w-[220px] items-center gap-1.5 truncate text-xs text-muted hover:text-fg">
      <ColorDot color={subject.color} />
      <span className="truncate">{subject.code || subject.name}</span>
    </span>
  );
  return link ? (
    <Link to={`/subjects/${subject.id}`} onClick={(e) => e.stopPropagation()} title={subject.name}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** "Exam in 7 days", "Due tomorrow", "Due today", "Overdue by 2 days". */
export function CountdownBadge({ deadline }: { deadline: Pick<Deadline, "dueDate" | "dueTime" | "status" | "type"> }) {
  const { t } = useTranslation();
  const now = useNow(60_000);
  const c = countdown(deadline, now);
  const type = t(`enums.deadlineType.${deadline.type}`);
  switch (c.state) {
    case "done":
      return <Badge tone="success">{t(`enums.deadlineStatus.${deadline.status}`)}</Badge>;
    case "overdue":
      return <Badge tone="danger">{c.days < 0 ? t("countdown.overdueDays", { count: -c.days }) : t("countdown.overdueToday")}</Badge>;
    case "today":
      return <Badge tone="danger">{c.minutes !== null && c.minutes < 180 ? t("countdown.inMinutes", { type, count: c.minutes }) : t("countdown.today", { type })}</Badge>;
    case "tomorrow":
      return <Badge tone="warning">{t("countdown.tomorrow", { type })}</Badge>;
    case "soon":
      return <Badge tone="info">{t("countdown.inDays", { type, count: c.days })}</Badge>;
    default:
      return <Badge>{t("countdown.inDays", { type, count: c.days })}</Badge>;
  }
}
