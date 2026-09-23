import i18n from "@/i18n";
import type { AppNotification } from "@/core/model/types";

/** Notifications store an i18n key + params, so they always render in the current language. */
export function notificationText(n: Pick<AppNotification, "title" | "body">): { title: string; body: string } {
  const t = i18n.t.bind(i18n);
  let params: Record<string, unknown> = {};
  try {
    params = n.body ? (JSON.parse(n.body) as Record<string, unknown>) : {};
  } catch {
    params = {};
  }
  if (typeof params.type === "string") params.typeLabel = t(`enums.deadlineType.${params.type}`);
  if (typeof params.days === "number") params.count = params.days;
  if (!n.title.startsWith("notif.")) return { title: n.title, body: typeof n.body === "string" ? n.body : "" };
  return { title: t(`${n.title}.title`, params), body: t(`${n.title}.body`, params) };
}
