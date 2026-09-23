import {
  LayoutDashboard,
  Search,
  Bell,
  CalendarRange,
  BookOpen,
  CalendarClock,
  NotebookPen,
  AlarmClock,
  ListTodo,
  GraduationCap,
  CircleHelp,
  FolderKanban,
  FolderOpen,
  Library,
  PenTool,
  CalendarHeart,
  Target,
  Wallet,
  Timer,
  ShieldCheck,
  Terminal,
  Flag,
  FlaskConical,
  Route,
  BarChart3,
  DatabaseBackup,
  ArrowLeftRight,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "nav.group.overview",
    items: [
      { to: "/", label: "nav.dashboard", icon: LayoutDashboard },
      { to: "/search", label: "nav.search", icon: Search },
      { to: "/notifications", label: "nav.notifications", icon: Bell },
    ],
  },
  {
    label: "nav.group.academic",
    items: [
      { to: "/semesters", label: "nav.semesters", icon: CalendarRange },
      { to: "/subjects", label: "nav.subjects", icon: BookOpen },
      { to: "/timetable", label: "nav.timetable", icon: CalendarClock },
      { to: "/notes", label: "nav.notes", icon: NotebookPen },
      { to: "/deadlines", label: "nav.deadlines", icon: AlarmClock },
      { to: "/tasks", label: "nav.tasks", icon: ListTodo },
      { to: "/grades", label: "nav.grades", icon: GraduationCap },
      { to: "/questions", label: "nav.questions", icon: CircleHelp },
    ],
  },
  {
    label: "nav.group.work",
    items: [
      { to: "/projects", label: "nav.projects", icon: FolderKanban },
      { to: "/files", label: "nav.files", icon: FolderOpen },
      { to: "/research", label: "nav.research", icon: Library },
      { to: "/whiteboards", label: "nav.whiteboards", icon: PenTool },
    ],
  },
  {
    label: "nav.group.personal",
    items: [
      { to: "/journal", label: "nav.journal", icon: CalendarHeart },
      { to: "/goals", label: "nav.goals", icon: Target },
      { to: "/study", label: "nav.study", icon: Timer },
      { to: "/expenses", label: "nav.expenses", icon: Wallet },
    ],
  },
  {
    label: "nav.group.cyber",
    items: [
      { to: "/cyber", label: "nav.cyberHome", icon: ShieldCheck },
      { to: "/cyber/commands", label: "nav.commands", icon: Terminal },
      { to: "/cyber/ctf", label: "nav.ctf", icon: Flag },
      { to: "/cyber/labs", label: "nav.labs", icon: FlaskConical },
      { to: "/cyber/roadmaps", label: "nav.roadmaps", icon: Route },
    ],
  },
  {
    label: "nav.group.system",
    items: [
      { to: "/analytics", label: "nav.analytics", icon: BarChart3 },
      { to: "/backup", label: "nav.backup", icon: DatabaseBackup },
      { to: "/data", label: "nav.data", icon: ArrowLeftRight },
      { to: "/settings", label: "nav.settings", icon: Settings },
    ],
  },
];

/** Where to navigate for a search hit / recent item / notification. */
export function routeFor(entityType: string, id: string, extra?: { subjectId?: string | null; projectId?: string | null }): string {
  switch (entityType) {
    case "subject":
      return `/subjects/${id}`;
    case "note":
      return `/notes/${id}`;
    case "project":
      return `/projects/${id}`;
    case "task":
      return `/tasks?open=${id}`;
    case "deadline":
      return `/deadlines?open=${id}`;
    case "question":
      return `/questions?open=${id}`;
    case "journal":
      return `/journal?id=${id}`;
    case "resource":
      return `/research?open=${id}`;
    case "goal":
      return `/goals?open=${id}`;
    case "expense":
      return `/expenses?open=${id}`;
    case "whiteboard":
      return `/whiteboards/${id}`;
    case "command":
      return `/cyber/commands?open=${id}`;
    case "ctf":
      return `/cyber/ctf/${id}`;
    case "lab":
      return `/cyber/labs/${id}`;
    case "roadmap":
      return `/cyber/roadmaps?open=${id}`;
    case "roadmap_item":
      return `/cyber/roadmaps`;
    case "file":
      return `/files?file=${id}`;
    case "lecture":
      return extra?.subjectId ? `/subjects/${extra.subjectId}/lectures` : "/subjects";
    case "meeting":
      return extra?.projectId ? `/projects/${extra.projectId}/meetings` : "/projects";
    default:
      return "/";
  }
}
