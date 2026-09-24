import * as React from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Search, Plus, Bell, Sun, Moon, Languages, NotebookPen, ListTodo, AlarmClock, BookOpen, Upload, FolderKanban, Wallet, ShieldCheck, Timer, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, Tip } from "@/components/ui/controls";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel } from "@/components/ui/overlay";
import { useSettings, applyTheme } from "@/app/settings";
import { applyLanguage } from "@/i18n";
import { useActiveSemester } from "@/lib/hooks";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { usePalette } from "./CommandPalette";

export const QUICK_ACTIONS = [
  { key: "note", icon: NotebookPen, to: "/notes?new=1", shortcut: "Ctrl+N" },
  { key: "task", icon: ListTodo, to: "/tasks?new=1", shortcut: "Ctrl+Shift+T" },
  { key: "exam", icon: GraduationCap, to: "/deadlines?new=1&type=exam" },
  { key: "assignment", icon: AlarmClock, to: "/deadlines?new=1&type=assignment" },
  { key: "subject", icon: BookOpen, to: "/subjects?new=1" },
  { key: "upload", icon: Upload, to: "/files?upload=1" },
  { key: "project", icon: FolderKanban, to: "/projects?new=1" },
  { key: "expense", icon: Wallet, to: "/expenses?new=1" },
  { key: "cyberNote", icon: ShieldCheck, to: "/notes?new=1&cyber=1" },
  { key: "study", icon: Timer, to: "/study?start=1" },
] as const;

export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const { semester, semesters } = useActiveSemester();
  const openPalette = usePalette((p) => p.setOpen);
  const s = useServices();
  const { data: unread = 0 } = useQ(["notifications", "unread"], () => s.notifications.unreadCount(), { refetchInterval: 60_000 });

  const toggleLang = () => {
    const lang = settings.language === "ar" ? "en" : "ar";
    update({ language: lang });
    applyLanguage(lang);
  };
  const toggleTheme = () => {
    const theme = settings.theme === "light" ? "dark" : "light";
    update({ theme });
    applyTheme(theme, settings.accent);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-elev/60 px-3">
      <div className="flex items-center">
        <Tip content={`${t("nav.back")} (Alt+←)`}>
          <Button size="icon" variant="ghost" onClick={() => navigate(-1)} aria-label={t("nav.back")}>
            <ArrowLeft className="rtl:rotate-180" />
          </Button>
        </Tip>
        <Tip content={`${t("nav.forward")} (Alt+→)`}>
          <Button size="icon" variant="ghost" onClick={() => navigate(1)} aria-label={t("nav.forward")}>
            <ArrowRight className="rtl:rotate-180" />
          </Button>
        </Tip>
      </div>

      <button
        type="button"
        onClick={() => openPalette(true)}
        className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-sunken px-3 text-sm text-subtle transition-colors hover:border-border-strong"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-start">{t("search.placeholder")}</span>
        <Kbd>Ctrl K</Kbd>
      </button>

      <div className="ms-auto flex items-center gap-1">
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="ghost" className="max-w-[220px]">
              <span className="size-2 rounded-full bg-accent" />
              <span className="truncate">{semester?.name ?? t("semesters.none")}</span>
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>{t("semesters.viewing")}</MenuLabel>
            {semesters.filter((x) => x.status !== "archived" || x.id === semester?.id).map((x) => (
              <MenuItem key={x.id} onSelect={() => update({ selectedSemesterId: x.id })}>
                <span className={x.id === semester?.id ? "font-semibold text-accent" : ""}>{x.name}</span>
                {x.isCurrent && <span className="ms-2 text-[10px] text-subtle">({t("semesters.current")})</span>}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => navigate("/semesters")}>{t("semesters.manage")}</MenuItem>
          </MenuContent>
        </Menu>

        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="primary">
              <Plus /> {t("common.new")}
            </Button>
          </MenuTrigger>
          <MenuContent className="w-60">
            <MenuLabel>{t("dashboard.quickActions")}</MenuLabel>
            {QUICK_ACTIONS.map((a) => (
              <MenuItem key={a.key} icon={<a.icon />} onSelect={() => navigate(a.to)} shortcut={"shortcut" in a ? a.shortcut : undefined}>
                {t(`quick.${a.key}`)}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>

        <Tip content={t("nav.notifications")}>
          <Button size="icon" variant="ghost" onClick={() => navigate("/notifications")} aria-label={t("nav.notifications")} className="relative">
            <Bell />
            {unread > 0 && <span className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
          </Button>
        </Tip>
        <Tip content={t("settings.language")}>
          <Button size="sm" variant="ghost" onClick={toggleLang} aria-label={t("settings.language")} data-testid="lang-toggle">
            <Languages /> <span className="text-xs">{settings.language === "ar" ? "EN" : "ع"}</span>
          </Button>
        </Tip>
        <Tip content={t("settings.theme")}>
          <Button size="icon" variant="ghost" onClick={toggleTheme} aria-label={t("settings.theme")}>
            {settings.theme === "light" ? <Moon /> : <Sun />}
          </Button>
        </Tip>
      </div>
    </header>
  );
}

export function useQuickActionShortcuts() {
  const navigate = useNavigate();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (mod && !e.shiftKey && e.key.toLowerCase() === "n" && !typing) {
        e.preventDefault();
        navigate("/notes?new=1");
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        navigate("/tasks?new=1");
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(-1);
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        navigate(1);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
      } else if (mod && e.key.toLowerCase() === "b" && !typing) {
        e.preventDefault();
        const st = useSettings.getState();
        st.update({ sidebarCollapsed: !st.settings.sidebarCollapsed });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
