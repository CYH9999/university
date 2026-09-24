import * as React from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FlaskConical, Trash2, Plus, Terminal } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { confirm } from "@/app/confirm";
import { Breadcrumbs, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Spinner, Badge } from "@/components/ui/controls";
import { Textarea, Field } from "@/components/ui/input";
import { RecordForm } from "@/components/common/RecordForm";
import { AttachmentsPanel } from "@/components/common/files";
import { CodeBlock } from "@/components/common/CodeBlock";
import { toDateKey } from "@/core/utils/dates";
import { useAutosave } from "./useAutosave";
import { SaveBadge } from "./SaveBadge";
import { LAB_TONE } from "./LabsPage";
import type { CyberLab } from "@/core/model/types";

const SECTIONS = ["steps", "findings", "errors", "lessons", "referencesText"] as const;

export function LabDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const s = useServices();
  const { data, isLoading } = useQ(["lab-detail", id], () => s.repos.labs.get(id), { staleTime: Infinity });
  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner className="size-6" /></div>;
  if (!data) return <EmptyState icon={<FlaskConical />} title={t("labs.notFound")} />;
  return <Detail key={data.id} lab={data} />;
}

function Detail({ lab }: { lab: CyberLab }) {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const [draft, setDraft] = React.useState<CyberLab>(lab);
  const { queue, flush, state } = useAutosave<CyberLab>(`lab:${lab.id}`, (p) => s.repos.labs.update(lab.id, p));
  const { data: commands = [] } = useQ(["commands", "lab", lab.id], () => s.repos.commands.list({ where: ["t.lab_id = ?"], params: [lab.id] }));
  React.useEffect(() => void s.recent.touch("lab", lab.id, lab.name), [lab.id, lab.name, s]);

  const change = (patch: Partial<CyberLab>) => {
    const next = { ...patch };
    if (patch.status === "completed" && !draft.completedAt) next.completedAt = toDateKey(new Date());
    if (patch.status === "in_progress" && !draft.startedAt) next.startedAt = toDateKey(new Date());
    setDraft((d) => ({ ...d, ...next }));
    queue(next);
  };

  const remove = async () => {
    if (!(await confirm({ title: t("confirm.deleteTitle"), description: t("labs.deleteBody"), confirmLabel: t("common.delete"), danger: true }))) return;
    await flush();
    const snap = await s.repos.labs.remove(lab.id);
    await invalidateAll();
    navigate("/cyber/labs");
    toast.success(t("toast.deleted"), { action: { label: t("common.undo"), onClick: () => void s.repos.labs.restore(snap).then(invalidateAll) } });
  };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-2.5">
          <Breadcrumbs items={[{ label: t("nav.labs"), to: "/cyber/labs" }, { label: draft.name }]} />
          <div className="ms-auto flex items-center gap-2">
            <SaveBadge state={state} />
            <Badge tone={LAB_TONE[draft.status]}>{t(`enums.labStatus.${draft.status}`)}</Badge>
            <Button size="icon" variant="ghost" onClick={remove} aria-label={t("common.delete")}><Trash2 /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 px-8 pb-24 pt-6">
            <input value={draft.name} onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, name: v })); if (v.trim()) queue({ name: v }); }} className="w-full bg-transparent text-3xl font-semibold outline-none" dir="auto" aria-label={t("fields.name")} />
            <Field label={t("fields.objective")}>
              <Textarea rows={2} value={draft.objective ?? ""} onChange={(e) => change({ objective: e.target.value })} dir="auto" />
            </Field>
            {SECTIONS.map((k) => (
              <Field key={k} label={t(`fields.${k}`)}>
                <Textarea rows={k === "steps" ? 12 : 5} value={(draft[k] as string) ?? ""} onChange={(e) => change({ [k]: e.target.value } as Partial<CyberLab>)} placeholder={t(`labs.placeholders.${k}`)} dir="auto" className={k === "steps" ? "font-mono text-xs" : undefined} />
              </Field>
            ))}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Terminal className="size-4 text-muted" /> {t("labs.commands")}</h2>
                <Button size="sm" asChild><Link to={`/cyber/commands?new=1&labId=${lab.id}`}><Plus /> {t("commands.new")}</Link></Button>
              </div>
              {commands.length === 0 ? (
                <p className="text-xs text-subtle">{t("labs.noCommands")}</p>
              ) : (
                <div className="space-y-2">
                  {commands.map((c) => (
                    <Card key={c.id} className="p-3">
                      <Link to={`/cyber/commands?open=${c.id}`} className="text-sm font-medium hover:text-accent">{c.title || c.tool || t("nav.commands")}</Link>
                      <CodeBlock className="mt-2" code={c.command} language={c.language} compact />
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      <aside className="w-[360px] shrink-0 overflow-y-auto border-s border-border bg-elev p-4">
        <RecordForm
          columns={1}
          value={draft as unknown as Record<string, unknown>}
          onChange={(p) => change(p as Partial<CyberLab>)}
          fields={[
            { name: "status", kind: "enum", enum: "labStatus", required: true },
            { name: "environment", kind: "text" },
            { name: "tools", kind: "list" },
            { name: "subjectId", kind: "subject" },
            { name: "startedAt", kind: "date" },
            { name: "completedAt", kind: "date" },
            { name: "tags", kind: "tags" },
          ]}
        />
        <div className="mt-6">
          <AttachmentsPanel entityType="lab" entityId={lab.id} title={t("labs.files")} />
        </div>
      </aside>
    </div>
  );
}
