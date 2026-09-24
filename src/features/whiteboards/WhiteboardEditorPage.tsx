import * as React from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Excalidraw, MainMenu, serializeAsJSON, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { FileDown, CheckCircle2, Loader2, CircleDot, AlertTriangle, FolderSearch } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { useSaveStatus } from "@/app/saveStatus";
import { useSettings } from "@/app/settings";
import { Breadcrumbs, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/controls";
import { openApi } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { safeFileName } from "@/core/utils/text";
import type { Whiteboard } from "@/core/model/types";

export function WhiteboardEditorPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const s = useServices();
  const { data: board, isLoading } = useQ(["whiteboard", id], () => s.repos.whiteboards.get(id), { staleTime: Infinity });
  const { data: scene, error } = useQ(
    ["whiteboard-scene", board?.fileRel],
    async () => JSON.parse(await s.ctx.fs.readText(board!.fileRel)) as { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> },
    { enabled: !!board, staleTime: Infinity },
  );
  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner className="size-6" /></div>;
  if (!board) return <EmptyState title={t("whiteboards.notFound")} />;
  if (error)
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title={t("whiteboards.fileMissing")}
        description={`${board.fileRel} — ${errorMessage(error)}`}
        action={<Button asChild><Link to="/whiteboards">{t("nav.whiteboards")}</Link></Button>}
      />
    );
  if (!scene) return <div className="flex h-full items-center justify-center"><Spinner className="size-6" /></div>;
  return <Board board={board} scene={scene} />;
}

function Board({ board, scene }: { board: Whiteboard; scene: { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> } }) {
  const { t, i18n } = useTranslation();
  const s = useServices();
  const theme = useSettings((st) => st.settings.theme);
  const api = React.useRef<ExcalidrawImperativeAPI | null>(null);
  const [state, setState] = React.useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = React.useRef<string>("");
  const key = `whiteboard:${board.id}`;

  const save = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const a = api.current;
    if (!a) return;
    const json = serializeAsJSON(a.getSceneElements(), a.getAppState(), a.getFiles(), "local");
    if (json === lastSaved.current) {
      useSaveStatus.getState().markClean(key);
      setState("saved");
      return;
    }
    setState("saving");
    useSaveStatus.getState().begin();
    try {
      await s.ctx.fs.writeText(board.fileRel, json);
      lastSaved.current = json;
      let thumbnail: string | null = null;
      const elements = a.getSceneElements();
      if (elements.length) {
        const svg = await exportToSvg({ elements, appState: { ...a.getAppState(), exportBackground: true }, files: a.getFiles() });
        const markup = new XMLSerializer().serializeToString(svg);
        if (markup.length < 400_000) thumbnail = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
      }
      await s.repos.whiteboards.update(board.id, { thumbnail });
      useSaveStatus.getState().end();
      useSaveStatus.getState().markClean(key);
      setState("saved");
      void invalidateAll();
    } catch (e) {
      useSaveStatus.getState().end(errorMessage(e));
      setState("error");
      toast.error(errorMessage(e));
    }
  }, [board.fileRel, board.id, key, s]);

  React.useEffect(() => () => void save(), [save]);

  const exportSvg = async () => {
    const a = api.current;
    if (!a) return;
    try {
      await save();
      const svg = await exportToSvg({ elements: a.getSceneElements(), appState: { ...a.getAppState(), exportBackground: true }, files: a.getFiles() });
      const rel = await s.ctx.fs.writeText(`Exports/Whiteboards/${safeFileName(board.title, "board")}.svg`, new XMLSerializer().serializeToString(svg));
      toast.success(t("whiteboards.exported"), { action: { label: t("files.reveal"), onClick: () => void openApi.reveal(rel) } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const exportFile = async () => {
    try {
      await save();
      const rel = await s.ctx.fs.writeText(`Exports/Whiteboards/${safeFileName(board.title, "board")}.excalidraw`, lastSaved.current || JSON.stringify(scene));
      toast.success(t("whiteboards.exported"), { action: { label: t("files.reveal"), onClick: () => void openApi.reveal(rel) } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Breadcrumbs items={[{ label: t("nav.whiteboards"), to: "/whiteboards" }, { label: board.title }]} />
        <span className="ms-auto flex items-center gap-1.5 text-xs text-muted" data-state={state}>
          {state === "saving" && <><Loader2 className="size-3.5 animate-spin" /> {t("status.saving")}</>}
          {state === "saved" && <><CheckCircle2 className="size-3.5 text-success" /> {t("status.allSaved")}</>}
          {state === "unsaved" && <><CircleDot className="size-3.5 text-warning" /> {t("status.unsaved")}</>}
          {state === "error" && <><AlertTriangle className="size-3.5 text-danger" /> {t("status.saveError")}</>}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void openApi.reveal(board.fileRel).catch((e) => toast.error(errorMessage(e)))}>
          <FolderSearch /> {t("files.reveal")}
        </Button>
        <Button size="sm" onClick={exportSvg}><FileDown /> {t("whiteboards.exportSvg")}</Button>
        <Button size="sm" onClick={exportFile}><FileDown /> {t("whiteboards.exportFile")}</Button>
      </div>
      <div className="whiteboard-host min-h-0 flex-1" dir="ltr">
        <Excalidraw
          excalidrawAPI={(a) => {
            api.current = a;
          }}
          initialData={{ elements: (scene.elements ?? []) as never, appState: { ...(scene.appState ?? {}), collaborators: new Map() } as never, files: (scene.files ?? {}) as never, scrollToContent: true }}
          theme={theme === "light" ? "light" : "dark"}
          langCode={i18n.language === "ar" ? "ar-SA" : "en"}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: true } }}
          onChange={() => {
            if (!api.current) return;
            setState("unsaved");
            useSaveStatus.getState().markDirty(key, save);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void save(), 1200);
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
}
