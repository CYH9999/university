import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NotebookPen, Plus, Pin, Star, Archive, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Toolbar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Badge } from "@/components/ui/controls";
import { SubjectSelect, EnumSelect } from "@/components/common/pickers";
import { SubjectChip } from "@/components/common/badges";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { useNewParam, useSubjectMap, useDebounced, useSearchParam } from "@/lib/hooks";
import { fmtRelative, fmtDate } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { noteTemplate, templateKindForTopic } from "@/core/templates";
import type { Note } from "@/core/model/types";
import type { NoteFilter } from "@/core/services/notes";
import type { CyberTopic } from "@/core/model/enums";
import { useSettings } from "@/app/settings";
import { truncate } from "@/core/utils/text";
import i18n from "@/i18n";

/** Creates a note immediately (so nothing can be lost) and opens the editor. */
export function useCreateNote() {
  const s = useServices();
  const navigate = useNavigate();
  const lang = useSettings((st) => st.settings.language);
  return async (opts: Partial<Note> & { template?: "concept" | "lab" | "ctf" | "incident" | "lecture" } = {}) => {
    try {
      const { template, ...rest } = opts;
      const content = template ? noteTemplate(template, lang) : null;
      const n = await s.notes.create({ title: i18n.t("notes.untitled"), content, contentText: "", ...rest });
      await invalidateAll();
      navigate(`/notes/${n.id}?fresh=1`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
}

export function NoteCard({ n }: { n: Note }) {
  const { t } = useTranslation();
  const subjects = useSubjectMap();
  return (
    <Link to={`/notes/${n.id}`} className="card flex h-full flex-col p-4 transition-colors hover:border-accent/40">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate font-medium">{n.title}</h3>
        {n.pinned && <Pin className="size-3.5 shrink-0 text-accent" />}
        {n.favorite && <Star className="size-3.5 shrink-0 fill-warning text-warning" />}
      </div>
      <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-relaxed text-muted" dir="auto">
        {n.contentText ? truncate(n.contentText, 240) : <span className="italic text-subtle">{t("notes.emptyNote")}</span>}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
        <Badge>{t(`enums.noteType.${n.noteType}`)}</Badge>
        {n.cyberTopic && <Badge tone="accent">{t(`enums.cyberTopic.${n.cyberTopic}`)}</Badge>}
        <SubjectChip subject={n.subjectId ? subjects.get(n.subjectId) : null} link={false} />
        <span className="ms-auto">{fmtRelative(n.updatedAt)}</span>
      </div>
    </Link>
  );
}

export function NoteList({ filter, emptyTitle, onCreate }: { filter: NoteFilter; emptyTitle?: string; onCreate?: () => void }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [], isLoading } = useQ(["notes", "list", filter], () => s.notes.list(filter));
  if (!isLoading && data.length === 0)
    return <EmptyState compact icon={<NotebookPen />} title={emptyTitle ?? t("notes.empty")} action={onCreate && <Button size="sm" variant="primary" onClick={onCreate}><Plus /> {t("notes.new")}</Button>} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((n) => (
        <NoteCard key={n.id} n={n} />
      ))}
    </div>
  );
}

export function NotesPage() {
  const { t } = useTranslation();
  const s = useServices();
  const createNote = useCreateNote();
  const [cyberParam] = useSearchParam("cyber");
  const [subjectId, setSubjectId] = useSearchParam("subject");
  const [noteType, setNoteType] = React.useState<string | null>(null);
  const [cyberTopic, setCyberTopic] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<"all" | "favorites" | "archived" | "cyber">(cyberParam === "1" ? "cyber" : "all");
  const [tag, setTag] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [layout, setLayout] = React.useState<"grid" | "list">("grid");
  const dText = useDebounced(text, 250);

  useNewParam((p) => {
    const cyber = p.get("cyber") === "1";
    void createNote({
      subjectId: p.get("subjectId"),
      lectureId: p.get("lectureId"),
      projectId: p.get("projectId"),
      noteType: cyber ? "cyber_concept" : ((p.get("type") as Note["noteType"]) ?? "lecture"),
      cyberTopic: (p.get("topic") as CyberTopic) ?? null,
      lectureDate: p.get("date"),
      template: cyber ? templateKindForTopic((p.get("topic") as CyberTopic) ?? null) : undefined,
    });
  });

  const filter: NoteFilter = {
    subjectId,
    noteType,
    cyberTopic,
    cyberOnly: scope === "cyber",
    favorite: scope === "favorites",
    archived: scope === "archived",
    tag,
    text: dText,
    limit: 5000,
  };
  const { data = [], isLoading } = useQ(["notes", "page", filter], () => s.notes.list(filter));
  const { data: tags = [] } = useQ(["tags", "all"], () => s.tags.list());

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<NotebookPen />}
        title={t("nav.notes")}
        description={t("notes.count", { count: data.length })}
        actions={
          <>
            <Button onClick={() => createNote({ noteType: "cyber_concept", template: "concept" })}>
              <ShieldCheck /> {t("quick.cyberNote")}
            </Button>
            <Button variant="primary" onClick={() => createNote({ subjectId })}>
              <Plus /> {t("notes.new")}
            </Button>
          </>
        }
      >
        <Toolbar>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-subtle" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("notes.filterPlaceholder")} className="ps-8" />
          </div>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: t("notes.scopes.all") },
              { value: "favorites", label: t("notes.scopes.favorites"), icon: <Star /> },
              { value: "cyber", label: t("notes.scopes.cyber"), icon: <ShieldCheck /> },
              { value: "archived", label: t("notes.scopes.archived"), icon: <Archive /> },
            ]}
          />
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-48" />
          <EnumSelect name="noteType" value={noteType} onChange={setNoteType} placeholder={t("filters.allTypes")} className="w-44" />
          {scope === "cyber" && <EnumSelect name="cyberTopic" value={cyberTopic} onChange={setCyberTopic} placeholder={t("filters.allTopics")} className="w-48" />}
          <select className="input-base w-36" value={tag ?? ""} onChange={(e) => setTag(e.target.value || null)} aria-label={t("fields.tags")}>
            <option value="">{t("filters.anyTag")}</option>
            {tags.map((x) => (
              <option key={x.id} value={x.name}>#{x.name} ({x.count})</option>
            ))}
          </select>
          <Segmented size="sm" value={layout} onChange={setLayout} options={[{ value: "grid", label: t("views.grid") }, { value: "list", label: t("views.list") }]} />
        </Toolbar>
      </PageHeader>
      <div className="min-h-0 flex-1 p-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<NotebookPen />} title={t("notes.empty")} description={t("notes.emptyHint")} action={<Button variant="primary" onClick={() => createNote({ subjectId })}><Plus /> {t("notes.new")}</Button>} />
        ) : layout === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.map((n) => (
              <NoteCard key={n.id} n={n} />
            ))}
          </div>
        ) : (
          <VirtualNoteList notes={data} />
        )}
      </div>
    </div>
  );
}

/** Virtualized list for large collections (thousands of notes). */
function VirtualNoteList({ notes }: { notes: Note[] }) {
  const { t } = useTranslation();
  const subjects = useSubjectMap();
  const parentRef = React.useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: notes.length, getScrollElement: () => parentRef.current, estimateSize: () => 52, overscan: 12 });
  return (
    <div ref={parentRef} className="card h-[calc(100vh-260px)] overflow-y-auto">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((item) => {
          const n = notes[item.index];
          return (
            <Link
              key={n.id}
              to={`/notes/${n.id}`}
              style={{ position: "absolute", top: 0, insetInlineStart: 0, width: "100%", height: item.size, transform: `translateY(${item.start}px)` }}
              className="flex items-center gap-3 border-b border-border px-4 hover:bg-surface-2/50"
            >
              {n.pinned ? <Pin className="size-3.5 text-accent" /> : <NotebookPen className="size-3.5 text-muted" />}
              <span className="min-w-0 flex-1 truncate text-sm">{n.title}</span>
              <span className="hidden text-[11px] text-subtle md:inline">{t(`enums.noteType.${n.noteType}`)}</span>
              <SubjectChip subject={n.subjectId ? subjects.get(n.subjectId) : null} link={false} />
              <span className="w-28 shrink-0 text-end text-[11px] text-subtle">{fmtDate(n.updatedAt.slice(0, 10), "d MMM yyyy")}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
