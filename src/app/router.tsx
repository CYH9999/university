import * as React from "react";
import { createHashRouter, useRouteError, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { AlertOctagon } from "lucide-react";
import { AppShell } from "./shell/AppShell";
import { Button } from "@/components/ui/button";
import { logApi } from "@/platform/tauri";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lazy = <T extends Record<string, any>>(loader: () => Promise<T>, name: keyof T) =>
  React.lazy(async () => ({ default: (await loader())[name] as React.ComponentType }));

const Dashboard = lazy(() => import("@/features/dashboard/DashboardPage"), "DashboardPage");
const SearchPage = lazy(() => import("@/features/search/SearchPage"), "SearchPage");
const NotificationsPage = lazy(() => import("@/features/notifications/NotificationsPage"), "NotificationsPage");
const SemestersPage = lazy(() => import("@/features/semesters/SemestersPage"), "SemestersPage");
const SubjectsPage = lazy(() => import("@/features/subjects/SubjectsPage"), "SubjectsPage");
const SubjectPage = lazy(() => import("@/features/subjects/SubjectPage"), "SubjectPage");
const TimetablePage = lazy(() => import("@/features/timetable/TimetablePage"), "TimetablePage");
const NotesPage = lazy(() => import("@/features/notes/NotesPage"), "NotesPage");
const NoteEditorPage = lazy(() => import("@/features/notes/NoteEditorPage"), "NoteEditorPage");
const DeadlinesPage = lazy(() => import("@/features/deadlines/DeadlinesPage"), "DeadlinesPage");
const TasksPage = lazy(() => import("@/features/tasks/TasksPage"), "TasksPage");
const GradesPage = lazy(() => import("@/features/grades/GradesPage"), "GradesPage");
const QuestionsPage = lazy(() => import("@/features/questions/QuestionsPage"), "QuestionsPage");
const ProjectsPage = lazy(() => import("@/features/projects/ProjectsPage"), "ProjectsPage");
const ProjectPage = lazy(() => import("@/features/projects/ProjectPage"), "ProjectPage");
const FilesPage = lazy(() => import("@/features/files/FilesPage"), "FilesPage");
const ResearchPage = lazy(() => import("@/features/research/ResearchPage"), "ResearchPage");
const WhiteboardsPage = lazy(() => import("@/features/whiteboards/WhiteboardsPage"), "WhiteboardsPage");
const WhiteboardEditorPage = lazy(() => import("@/features/whiteboards/WhiteboardEditorPage"), "WhiteboardEditorPage");
const JournalPage = lazy(() => import("@/features/journal/JournalPage"), "JournalPage");
const GoalsPage = lazy(() => import("@/features/goals/GoalsPage"), "GoalsPage");
const StudyPage = lazy(() => import("@/features/study/StudyPage"), "StudyPage");
const ExpensesPage = lazy(() => import("@/features/expenses/ExpensesPage"), "ExpensesPage");
const CyberHome = lazy(() => import("@/features/cyber/CyberHome"), "CyberHome");
const CommandsPage = lazy(() => import("@/features/cyber/CommandsPage"), "CommandsPage");
const CtfPage = lazy(() => import("@/features/cyber/CtfPage"), "CtfPage");
const CtfDetailPage = lazy(() => import("@/features/cyber/CtfDetailPage"), "CtfDetailPage");
const LabsPage = lazy(() => import("@/features/cyber/LabsPage"), "LabsPage");
const LabDetailPage = lazy(() => import("@/features/cyber/LabDetailPage"), "LabDetailPage");
const RoadmapsPage = lazy(() => import("@/features/cyber/RoadmapsPage"), "RoadmapsPage");
const AnalyticsPage = lazy(() => import("@/features/analytics/AnalyticsPage"), "AnalyticsPage");
const BackupPage = lazy(() => import("@/features/backup/BackupPage"), "BackupPage");
const DataPage = lazy(() => import("@/features/data/DataPage"), "DataPage");
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"), "SettingsPage");

function RouteError() {
  const err = useRouteError();
  const { t } = useTranslation();
  React.useEffect(() => {
    void logApi.write("error", `Render error: ${err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}`);
  }, [err]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <AlertOctagon className="size-10 text-danger" />
      <h1 className="text-lg font-semibold">{t("errors.pageCrashed")}</h1>
      <p className="max-w-md text-sm text-muted">{t("errors.pageCrashedHint")}</p>
      <pre className="max-w-xl overflow-auto rounded-md border border-border bg-sunken p-3 text-start text-xs text-danger">{err instanceof Error ? err.message : String(err)}</pre>
      <Button asChild variant="primary">
        <Link to="/">{t("nav.dashboard")}</Link>
      </Button>
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl font-bold text-subtle">404</p>
      <p className="text-sm text-muted">{t("errors.notFound")}</p>
      <Button asChild>
        <Link to="/">{t("nav.dashboard")}</Link>
      </Button>
    </div>
  );
}

const el = (C: React.ComponentType) => <C />;

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: el(Dashboard), errorElement: <RouteError /> },
      { path: "search", element: el(SearchPage), errorElement: <RouteError /> },
      { path: "notifications", element: el(NotificationsPage), errorElement: <RouteError /> },
      { path: "semesters", element: el(SemestersPage), errorElement: <RouteError /> },
      { path: "subjects", element: el(SubjectsPage), errorElement: <RouteError /> },
      { path: "subjects/:id/:tab?", element: el(SubjectPage), errorElement: <RouteError /> },
      { path: "timetable", element: el(TimetablePage), errorElement: <RouteError /> },
      { path: "notes", element: el(NotesPage), errorElement: <RouteError /> },
      { path: "notes/:id", element: el(NoteEditorPage), errorElement: <RouteError /> },
      { path: "deadlines", element: el(DeadlinesPage), errorElement: <RouteError /> },
      { path: "tasks", element: el(TasksPage), errorElement: <RouteError /> },
      { path: "grades", element: el(GradesPage), errorElement: <RouteError /> },
      { path: "questions", element: el(QuestionsPage), errorElement: <RouteError /> },
      { path: "projects", element: el(ProjectsPage), errorElement: <RouteError /> },
      { path: "projects/:id/:tab?", element: el(ProjectPage), errorElement: <RouteError /> },
      { path: "files", element: el(FilesPage), errorElement: <RouteError /> },
      { path: "research", element: el(ResearchPage), errorElement: <RouteError /> },
      { path: "whiteboards", element: el(WhiteboardsPage), errorElement: <RouteError /> },
      { path: "whiteboards/:id", element: el(WhiteboardEditorPage), errorElement: <RouteError /> },
      { path: "journal", element: el(JournalPage), errorElement: <RouteError /> },
      { path: "goals", element: el(GoalsPage), errorElement: <RouteError /> },
      { path: "study", element: el(StudyPage), errorElement: <RouteError /> },
      { path: "expenses", element: el(ExpensesPage), errorElement: <RouteError /> },
      { path: "cyber", element: el(CyberHome), errorElement: <RouteError /> },
      { path: "cyber/commands", element: el(CommandsPage), errorElement: <RouteError /> },
      { path: "cyber/ctf", element: el(CtfPage), errorElement: <RouteError /> },
      { path: "cyber/ctf/:id", element: el(CtfDetailPage), errorElement: <RouteError /> },
      { path: "cyber/labs", element: el(LabsPage), errorElement: <RouteError /> },
      { path: "cyber/labs/:id", element: el(LabDetailPage), errorElement: <RouteError /> },
      { path: "cyber/roadmaps", element: el(RoadmapsPage), errorElement: <RouteError /> },
      { path: "analytics", element: el(AnalyticsPage), errorElement: <RouteError /> },
      { path: "backup", element: el(BackupPage), errorElement: <RouteError /> },
      { path: "data", element: el(DataPage), errorElement: <RouteError /> },
      { path: "settings", element: el(SettingsPage), errorElement: <RouteError /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
