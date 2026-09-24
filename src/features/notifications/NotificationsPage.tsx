import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router";
import { Bell, CheckCheck, MoreHorizontal, Mail, MailOpen, Clock, Archive, Trash2, ExternalLink, Settings2, MonitorCheck } from "lucide-react";
import { PageHeader, Toolbar, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Segmented, Badge, Tip } from "@/components/ui/controls";
import { EnumSelect } from "@/components/common/pickers";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/overlay";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { notificationText } from "@/app/shell/notificationText";
import { fmtRelative, fmtDateTime } from "@/lib/format";
import type { AppNotification } from "@/core/model/types";
import { cn } from "@/lib/cn";

type Status = "active" | "unread" | "read" | "archived";

export function NotificationsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<Status>("active");
  const [category, setCategory] = React.useState<string | null>(null);
  const { data = [], isLoading } = useQ(["notifications", "page", status, category], () => s.notifications.list({ status, category, limit: 500 }));
  const { data: snoozed = [] } = useQ(["notifications", "snoozed"], () => s.notifications.snoozed());
  const setSt = useMut(({ id, st }: { id: string; st: AppNotification["status"] }) => s.notifications.setStatus(id, st));
  const snooze = useMut(({ id, min }: { id: string; min: number }) => s.notifications.snooze(id, min), { success: "notifications.snoozed" });
  const remove = useMut((id: string) => s.notifications.remove(id), { success: "toast.deleted" });
  const markAll = useMut(() => s.notifications.markAllRead(), { success: "notifications.allRead" });
  const scan = useMut(() => s.notifications.scan(), { success: (r) => t("notifications.scanned", { count: r.length }) });

  const open = async (n: AppNotification) => {
    if (n.status === "unread") await s.notifications.setStatus(n.id, "read");
    if (n.route) navigate(n.route);
  };

  return (
    <div>
      <PageHeader
        icon={<Bell />}
        title={t("nav.notifications")}
        description={t("notifications.lead")}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to="/settings?tab=notifications"><Settings2 /> {t("notifications.preferences")}</Link>
            </Button>
            <Button onClick={() => scan.mutate(undefined)} loading={scan.isPending}>{t("notifications.checkNow")}</Button>
            <Button onClick={() => markAll.mutate(undefined)}><CheckCheck /> {t("notifications.markAllRead")}</Button>
          </>
        }
      >
        <Toolbar>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: t("notifications.filters.active") },
              { value: "unread", label: t("notifications.filters.unread") },
              { value: "read", label: t("notifications.filters.read") },
              { value: "archived", label: t("notifications.filters.archived") },
            ]}
          />
          <EnumSelect name="notificationCategory" value={category} onChange={setCategory} placeholder={t("filters.allCategories")} className="w-48" />
        </Toolbar>
      </PageHeader>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Bell />} title={t("notifications.empty")} description={t("notifications.emptyHint")} />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {data.map((n) => {
              const txt = notificationText(n);
              return (
                <div key={n.id} className={cn("flex items-start gap-3 px-4 py-3", n.status === "unread" && "bg-accent/[0.04]")}>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.status === "unread" ? "bg-accent" : "bg-transparent")} />
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => void open(n)}>
                    <div className={cn("text-sm", n.status === "unread" && "font-medium")}>{txt.title}</div>
                    <div className="mt-0.5 text-xs text-muted" dir="auto">{txt.body}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                      <Badge>{t(`enums.notificationCategory.${n.category}`)}</Badge>
                      <span title={fmtDateTime(n.triggerAt)}>{fmtRelative(n.triggerAt)}</span>
                      {n.osDelivered && (
                        <Tip content={t("notifications.osDelivered")}>
                          <MonitorCheck className="size-3.5" />
                        </Tip>
                      )}
                    </div>
                  </button>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={t("common.actions")}><MoreHorizontal /></Button>
                    </MenuTrigger>
                    <MenuContent>
                      {n.route && <MenuItem icon={<ExternalLink />} onSelect={() => void open(n)}>{t("notifications.openItem")}</MenuItem>}
                      {n.status === "unread" ? (
                        <MenuItem icon={<MailOpen />} onSelect={() => setSt.mutate({ id: n.id, st: "read" })}>{t("notifications.markRead")}</MenuItem>
                      ) : (
                        <MenuItem icon={<Mail />} onSelect={() => setSt.mutate({ id: n.id, st: "unread" })}>{t("notifications.markUnread")}</MenuItem>
                      )}
                      <MenuItem icon={<Clock />} onSelect={() => snooze.mutate({ id: n.id, min: 60 })}>{t("notifications.snooze1h")}</MenuItem>
                      <MenuItem icon={<Clock />} onSelect={() => snooze.mutate({ id: n.id, min: 60 * 24 })}>{t("notifications.snooze1d")}</MenuItem>
                      <MenuItem icon={<Clock />} onSelect={() => snooze.mutate({ id: n.id, min: 60 * 24 * 7 })}>{t("notifications.snooze1w")}</MenuItem>
                      {n.status !== "archived" && <MenuItem icon={<Archive />} onSelect={() => setSt.mutate({ id: n.id, st: "archived" })}>{t("notifications.dismiss")}</MenuItem>}
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 />} danger onSelect={() => remove.mutate(n.id)}>{t("common.delete")}</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              );
            })}
          </Card>
        )}
        {snoozed.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t("notifications.snoozedList")}</h2>
            <Card className="divide-y divide-border">
              {snoozed.map((n) => (
                <div key={n.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Clock className="size-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{notificationText(n).title}</span>
                  <span className="text-xs text-subtle">{t("notifications.until", { time: fmtDateTime(n.snoozedUntil) })}</span>
                  <Button size="sm" variant="ghost" onClick={() => snooze.mutate({ id: n.id, min: 0 })}>{t("notifications.unsnooze")}</Button>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
