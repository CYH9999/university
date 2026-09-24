import i18n from "@/i18n";
import type { AppNotification } from "@/core/model/types";
import { fmtDate } from "@/lib/format";

/** Notifications store an i18n key + params, so they always render in the current language. */
export function notificationText(n: Pick<AppNotification, "title" | "body">): { title: string; body: string } {
  const t = i18n.t.bind(i18n);
  let params: Record<string, unknown> = {};
  try {
    params = n.body ? (JSON.parse(n.body) as Record<string, unknown>) : {};
  } catch {
    params = {};
  }
  if (!n.title.startsWith("notif.")) return { title: n.title, body: typeof n.body === "string" ? n.body : "" };
  if (typeof params.type === "string") params.typeLabel = t(`enums.deadlineType.${params.type}`);
  if (typeof params.date === "string") params.date = fmtDate(params.date, "EEEE d MMM");
  // Day counts drive pluralization ("in 1 day" / "in 3 days"); "today" gets its own wording.
  if (typeof params.days === "number") {
    params.count = Math.abs(params.days);
    if (params.days === 0) params.context = "today";
  }
  params.at = typeof params.time === "string" && params.time ? t("notif.atTime", { time: params.time }) : "";
  params.where = typeof params.room === "string" && params.room ? t("notif.inRoom", { room: params.room }) : "";
  return { title: t(`${n.title}.title`, params), body: t(`${n.title}.body`, params) };
}
