import * as React from "react";
import { Command } from "cmdk";
import { create } from "zustand";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Dialog as D } from "radix-ui";
import { Search, CornerDownLeft, History } from "lucide-react";
import { NAV, routeFor } from "@/app/nav";
import { QUICK_ACTIONS } from "./TopBar";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useDebounced } from "@/lib/hooks";
import { Kbd } from "@/components/ui/controls";
import { entityIcon } from "@/features/search/entityIcons";
import type { Services } from "@/core";

export const usePalette = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }));

/** Resolves the route of an entity (some need a parent lookup). */
export async function resolveRoute(s: Services, entityType: string, id: string, subjectId?: string | null): Promise<string> {
  if (entityType === "meeting") {
    const m = await s.repos.meetings.get(id);
    return routeFor("meeting", id, { projectId: m?.projectId });
  }
  if (entityType === "lecture") {
    const l = await s.repos.lectures.get(id);
    return routeFor("lecture", id, { subjectId: l?.subjectId ?? subjectId });
  }
  return routeFor(entityType, id);
}

export function CommandPalette() {
  const { t } = useTranslation();
  const open = usePalette((p) => p.open);
  const setOpen = usePalette((p) => p.setOpen);
  const navigate = useNavigate();
  const s = useServices();
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q, 150);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "p")) {
        e.preventDefault();
        setOpen(!usePalette.getState().open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const { data: hits = [] } = useQ(["palette", dq], () => s.search(dq, { limit: 30 }), { enabled: open && dq.trim().length > 0 });
  const { data: recent = [] } = useQ(["palette-recent"], () => s.recent.list(8), { enabled: open });

  const go = async (to: string | Promise<string>) => {
    setOpen(false);
    navigate(await to);
  };

  const navItems = NAV.flatMap((g) => g.items);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[70] bg-black/50 animate-in" />
        <D.Content className="fixed left-1/2 top-[12vh] z-[70] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-elev shadow-2xl animate-in">
          <D.Title className="sr-only">{t("search.title")}</D.Title>
          <D.Description className="sr-only">{t("search.placeholder")}</D.Description>
          <Command shouldFilter={false} loop className="flex max-h-[70vh] flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <Command.Input value={q} onValueChange={setQ} placeholder={t("search.placeholder")} className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" dir="auto" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted">{t("search.noResults")}</Command.Empty>
              {q.trim() && hits.length > 0 && (
                <Command.Group heading={t("search.results")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle">
                  {hits.map((h) => {
                    const Icon = entityIcon(h.entityType);
                    return (
                      <Command.Item key={`${h.entityType}:${h.entityId}`} value={`${h.entityType}:${h.entityId}`} onSelect={() => go(resolveRoute(s, h.entityType, h.entityId, h.subjectId))} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-surface-2">
                        <Icon className="size-4 shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{h.title}</div>
                          {h.snippet && (h.snippet.match || h.snippet.before) && (
                            <div className="truncate text-xs text-subtle" dir="auto">
                              {h.snippet.before}
                              <mark className="rounded bg-accent/25 px-0.5 text-fg">{h.snippet.match}</mark>
                              {h.snippet.after}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-subtle">{t(`entity.${h.entityType}`)}</span>
                      </Command.Item>
                    );
                  })}
                  <Command.Item value="__all" onSelect={() => go(`/search?q=${encodeURIComponent(q)}`)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-accent aria-selected:bg-surface-2">
                    <CornerDownLeft className="size-4 rtl:-scale-x-100" /> {t("search.seeAll")}
                  </Command.Item>
                </Command.Group>
              )}
              {!q.trim() && recent.length > 0 && (
                <Command.Group heading={t("search.recent")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle">
                  {recent.map((r) => (
                    <Command.Item key={`${r.entityType}:${r.entityId}`} value={`recent:${r.entityType}:${r.entityId}`} onSelect={() => go(resolveRoute(s, r.entityType, r.entityId))} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-surface-2">
                      <History className="size-4 text-muted" />
                      <span className="flex-1 truncate">{r.title}</span>
                      <span className="text-[11px] text-subtle">{t(`entity.${r.entityType}`)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={t("dashboard.quickActions")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle">
                {QUICK_ACTIONS.filter((a) => !q.trim() || t(`quick.${a.key}`).toLowerCase().includes(q.toLowerCase())).map((a) => (
                  <Command.Item key={a.key} value={`qa:${a.key}`} onSelect={() => go(a.to)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-surface-2">
                    <a.icon className="size-4 text-muted" />
                    <span className="flex-1">{t(`quick.${a.key}`)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading={t("search.goTo")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle">
                {navItems
                  .filter((n) => !q.trim() || t(n.label).toLowerCase().includes(q.toLowerCase()))
                  .map((n) => (
                    <Command.Item key={n.to} value={`nav:${n.to}`} onSelect={() => go(n.to)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-surface-2">
                      <n.icon className="size-4 text-muted" />
                      <span className="flex-1">{t(n.label)}</span>
                    </Command.Item>
                  ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
