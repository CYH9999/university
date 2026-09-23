import * as React from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp, Plus, CheckCircle2, Search as SearchIcon, FileText, NotebookPen } from "lucide-react";
import { Link } from "react-router";
import { PageHeader, Toolbar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Badge } from "@/components/ui/controls";
import { SubjectSelect, FileSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { PriorityBadge, SubjectChip } from "@/components/common/badges";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useNewParam, useOpenParam, useSubjectMap, useDebounced } from "@/lib/hooks";
import { fmtRelative } from "@/lib/format";
import type { Question } from "@/core/model/types";
import { cn } from "@/lib/cn";

const STATUS_TONE = { unresolved: "danger", researching: "warning", answered: "success", reviewed: "neutral" } as const;

export function QuestionEditor({ editor }: { editor: ReturnType<typeof useEditor<Question>> }) {
  const s = useServices();
  return (
    <EntityDrawer<Question>
      editor={editor}
      title={{ create: "questions.new", edit: "questions.edit" }}
      initial={(e, d) => (e ? { ...e } : { priority: "medium", status: "unresolved", ...d })}
      fields={[
        { name: "text", kind: "textarea", required: true, span: 2, rows: 3, label: "fields.question" },
        { name: "subjectId", kind: "subject" },
        { name: "lectureId", kind: "lecture", subjectField: "subjectId" },
        { name: "topic", kind: "text" },
        { name: "priority", kind: "enum", enum: "priority", required: true },
        { name: "status", kind: "enum", enum: "questionStatus", required: true },
        { name: "noteId", kind: "note", subjectField: "subjectId", label: "fields.relatedNote" },
        { name: "fileId", kind: "custom", label: "fields.relatedFile", render: (v, set) => <FileSelect value={v.fileId as string} subjectId={v.subjectId as string} onChange={(x) => set({ fileId: x })} /> },
        { name: "answer", kind: "textarea", span: 2, rows: 6 },
        { name: "tags", kind: "tags", span: 2 },
      ]}
      onSave={async (d, e) => {
        const patch = d as Partial<Question>;
        if ((patch.status === "answered" || patch.status === "reviewed") && !patch.answeredAt) patch.answeredAt = new Date().toISOString();
        return e ? s.repos.questions.update(e.id, patch) : s.repos.questions.create(patch as never);
      }}
      onDelete={(e) => s.repos.questions.remove(e.id)}
      onRestore={(snap) => s.repos.questions.restore(snap)}
    />
  );
}

export function QuestionList({ subjectId, status, text, compact }: { subjectId?: string | null; status?: string | null; text?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const editor = useEditor<Question>();
  const [quick, setQuick] = React.useState("");
  const where: string[] = [];
  const params: string[] = [];
  if (subjectId) {
    where.push("t.subject_id = ?");
    params.push(subjectId);
  }
  if (status === "open") where.push("t.status IN ('unresolved','researching')");
  else if (status) {
    where.push("t.status = ?");
    params.push(status);
  }
  if (text?.trim()) {
    where.push("(t.text LIKE ? OR t.answer LIKE ? OR t.topic LIKE ?)");
    params.push(`%${text}%`, `%${text}%`, `%${text}%`);
  }
  const { data = [], isLoading } = useQ(["questions", "list", where, params], () => s.repos.questions.list({ where, params, limit: 2000 }));
  const add = useMut((q: string) => s.repos.questions.create({ text: q, subjectId: subjectId ?? null, status: "unresolved", priority: "medium" } as never), { onSuccess: () => setQuick(""), success: "questions.captured" });
  const setStatus = useMut(({ id, st }: { id: string; st: Question["status"] }) => s.repos.questions.update(id, { status: st, answeredAt: st === "answered" ? new Date().toISOString() : undefined }));
  useOpenParam((id) => void s.repos.questions.get(id).then((q) => q && editor.edit(q)));
  useNewParam((p) => editor.create({ subjectId: p.get("subjectId") ?? subjectId ?? null }));

  return (
    <div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (quick.trim()) add.mutate(quick.trim());
        }}
      >
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t("questions.quickCapture")} dir="auto" />
        <Button type="submit" loading={add.isPending}>
          <Plus /> {t("questions.capture")}
        </Button>
      </form>
      {!isLoading && data.length === 0 ? (
        <EmptyState compact={compact} icon={<CircleHelp />} title={t("questions.empty")} description={t("questions.emptyHint")} />
      ) : (
        <ul className="space-y-2">
          {data.map((q) => (
            <li key={q.id} className="card p-3">
              <div className="flex items-start gap-3">
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => editor.edit(q)}>
                  <p className={cn("text-sm leading-relaxed", q.status === "reviewed" && "text-muted")} dir="auto">
                    {q.text}
                  </p>
                  {q.answer && (
                    <p className="mt-2 line-clamp-3 border-s-2 border-success/50 ps-3 text-xs leading-relaxed text-muted" dir="auto">
                      {q.answer}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={STATUS_TONE[q.status]}>{t(`enums.questionStatus.${q.status}`)}</Badge>
                  {q.priority !== "medium" && q.priority !== "low" && <PriorityBadge priority={q.priority} />}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-subtle">
                {!subjectId && <SubjectChip subject={q.subjectId ? subjects.get(q.subjectId) : null} />}
                {q.topic && <span>{q.topic}</span>}
                {q.noteId && (
                  <Link to={`/notes/${q.noteId}`} className="inline-flex items-center gap-1 hover:text-accent">
                    <NotebookPen className="size-3" /> {t("fields.relatedNote")}
                  </Link>
                )}
                {q.fileId && <span className="inline-flex items-center gap-1"><FileText className="size-3" /> {t("fields.relatedFile")}</span>}
                {q.tags.map((tag) => <span key={tag} className="text-accent/80">#{tag}</span>)}
                <span className="ms-auto">{fmtRelative(q.createdAt)}</span>
                {q.status === "unresolved" && (
                  <Button size="sm" variant="ghost" className="h-6" onClick={() => setStatus.mutate({ id: q.id, st: "researching" })}>
                    <SearchIcon /> {t("questions.startResearch")}
                  </Button>
                )}
                {(q.status === "unresolved" || q.status === "researching") && (
                  <Button size="sm" variant="ghost" className="h-6" onClick={() => editor.edit({ ...q, status: "answered" })}>
                    <CheckCircle2 /> {t("questions.answer")}
                  </Button>
                )}
                {q.status === "answered" && (
                  <Button size="sm" variant="ghost" className="h-6" onClick={() => setStatus.mutate({ id: q.id, st: "reviewed" })}>
                    <CheckCircle2 /> {t("questions.markReviewed")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <QuestionEditor editor={editor} />
    </div>
  );
}

export function QuestionsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = React.useState<string>("open");
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const dText = useDebounced(text);
  return (
    <div>
      <PageHeader icon={<CircleHelp />} title={t("nav.questions")} description={t("questions.lead")}>
        <Toolbar>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: t("questions.filters.open") },
              { value: "unresolved", label: t("enums.questionStatus.unresolved") },
              { value: "researching", label: t("enums.questionStatus.researching") },
              { value: "answered", label: t("enums.questionStatus.answered") },
              { value: "reviewed", label: t("enums.questionStatus.reviewed") },
              { value: "", label: t("common.all") },
            ]}
          />
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-52" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("common.filter")} className="w-56" />
        </Toolbar>
      </PageHeader>
      <div className="mx-auto max-w-4xl p-6">
        <QuestionList subjectId={subjectId} status={status || null} text={dText} />
      </div>
    </div>
  );
}
