import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV } from "@/app/nav";
import { useSettings } from "@/app/settings";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { Tip } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useSettings((s) => s.settings.sidebarCollapsed);
  const update = useSettings((s) => s.update);
  const s = useServices();
  const { data: unread = 0 } = useQ(["notifications", "unread"], () => s.notifications.unreadCount(), { refetchInterval: 60_000 });
  const { data: taskCounts } = useQ(["tasks", "counts"], () => s.tasks.counts());

  const badge = (to: string): number => {
    if (to === "/notifications") return unread;
    if (to === "/tasks") return (taskCounts?.today ?? 0) + (taskCounts?.overdue ?? 0);
    return 0;
  };

  return (
    <aside className={cn("flex h-full shrink-0 flex-col border-e border-border bg-elev transition-[width] duration-150", collapsed ? "w-[60px]" : "w-[232px]")}>
      <div className={cn("flex h-12 items-center gap-2 border-b border-border px-3", collapsed && "justify-center px-0")}>
        <img src="/logo.svg" alt="" className="size-7 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold tracking-tight">UniOS</div>
            <div className="truncate text-[10px] text-subtle">{t("app.tagline")}</div>
          </div>
        )}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label={t("nav.main")}>
        {NAV.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">{t(group.label)}</div>}
            {collapsed && <div className="mx-2 my-2 h-px bg-border first:hidden" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const n = badge(item.to);
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.to === "/" || item.to === "/cyber"}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg",
                        isActive && "bg-accent/10 font-medium text-fg before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-accent",
                        collapsed && "justify-center px-0",
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>}
                    {n > 0 && (
                      <span className={cn("rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold tabular-nums text-accent", collapsed && "absolute end-0.5 top-0.5 px-1")}>
                        {n > 99 ? "99+" : n}
                      </span>
                    )}
                  </NavLink>
                );
                return <li key={item.to}>{collapsed ? <Tip content={t(item.label)} side="right">{link}</Tip> : link}</li>;
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => update({ sidebarCollapsed: !collapsed })}
          className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted hover:bg-surface-2 hover:text-fg", collapsed && "justify-center px-0")}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {collapsed ? <PanelLeftOpen className="size-4 rtl:rotate-180" /> : <PanelLeftClose className="size-4 rtl:rotate-180" />}
          {!collapsed && <span>{t("nav.collapse")}</span>}
          {!collapsed && <span className="ms-auto font-mono text-[10px] text-subtle ltr">Ctrl+B</span>}
        </button>
      </div>
    </aside>
  );
}
