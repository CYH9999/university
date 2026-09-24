import * as React from "react";
import { useParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Flag, Trash2, ExternalLink, Timer } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { confirm } from "@/app/confirm";
import { Breadcrumbs, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Spinner, Badge } from "@/components/ui/controls";
import { RecordForm } from "@/components/common/RecordForm";
import { AttachmentsPanel } from "@/components/common/files";
import { RichEditor } from "@/components/editor/RichEditor";
import { openApi } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { toDateKey } from "@/core/utils/dates";
import { useAutosave } from "./useAutosave";
import { SaveBadge } from "./SaveBadge";
import { CTF_STATUS_TONE } from "./CtfPage";
import type { CtfChallenge } from "@/core/model/types";

export function CtfDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const s = useServices();
  const { data, isLoading } = useQ(["ctf-detail", id], () => s.repos.ctf.get(id), { staleTime: Infinity });
  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner className="size-6" /></div>;
  if (!data) return <EmptyState icon={<Flag />} title={t("ctf.notFound")} />;
  return <Detail key={data.id} ctf={data} />;
}

function Detail({ ctf }: { ctf: CtfChallenge }) {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const [draft, setDraft] = React.useState<CtfChallenge>(ctf);
  const { queue, flush, state } = useAutosave<CtfChallenge>(`ctf:${ctf.id}`, (p) => s.repos.ctf.update(ctf.id, p));
  React.useEffect(() => void s.recent.touch("ctf", ctf.id, ctf.name), [ctf.id, ctf.name, s]);

  const change = (patch: Partial<CtfChallenge>) => {
    const next = { ...patch };
    if (patch.status === "solved" && !draft.completedAt) next.completedAt = toDateKey(new Date());
    if (patch.status && patch.status !== "todo" && !draft.startedAt) next.startedAt = toDateKey(new Date());
    setDraft((d) => ({ ...d, ...next }));
    queue(next);
  };

  const remove = async () => {
    if (!(await confirm({ title: t("confirm.deleteTitle"), description: t("ctf.deleteBody"), confirmLabel: t("common.delete"), danger: true }))) return;
    await flush();
    const snap = await s.repos.ctf.remove(ctf.id);
    await invalidateAll();
    navigate("/cyber/ctf");
    toast.success(t("toast.deleted"), { action: { label: t("common.undo"), onClick: () => void s.repos.ctf.restore(snap).then(invalidateAll) } });
  };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-2.5">
          <Breadcrumbs items={[{ label: t("nav.ctf"), to: "/cyber/ctf" }, { label: draft.name }]} />
          <div className="ms-auto flex items-center gap-2">
            <SaveBadge state={state} />
            <Badge tone={CTF_STATUS_TONE[draft.status]}>{t(`enums.ctfStatus.${draft.status}`)}</Badge>
            {draft.url && <Button size="sm" variant="ghost" onClick={() => openApi.url(draft.url!).catch((e) => toast.error(errorMessage(e)))}><ExternalLink /> {t("ctf.openChallenge")}</Button>}
            <Button size="sm" variant="ghost" onClick={() => change({ timeSpentMinutes: draft.timeSpentMinutes + 15 })}><Timer /> +15 {t("time.minShort")}</Button>
            <Button size="icon" variant="ghost" onClick={remove} aria-label={t("common.delete")}><Trash2 /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-8 pb-24 pt-6">
            <input value={draft.name} onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, name: v })); if (v.trim()) queue({ name: v }); }} className="w-full bg-transparent text-3xl font-semibold outline-none" dir="auto" aria-label={t("fields.name")} />
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t("fields.writeup")}</h2>
              <Card className="px-4 py-2">
                <RichEditor content={ctf.writeup} onChange={(json, text) => { setDraft((d) => ({ ...d, writeup: json, writeupText: text })); queue({ writeup: json, writeupText: text }); }} placeholder={t("ctf.writeupPlaceholder")} />
              </Card>
            </section>
          </div>
        </div>
      </div>
      <aside className="w-[380px] shrink-0 overflow-y-auto border-s border-border bg-elev p-4">
        <RecordForm
          columns={1}
          value={draft as unknown as Record<string, unknown>}
          onChange={(p) => change(p as Partial<CtfChallenge>)}
          fields={[
            { name: "status", kind: "enum", enum: "ctfStatus", required: true },
            { name: "category", kind: "enum", enum: "ctfCategory", required: true },
            { name: "difficulty", kind: "enum", enum: "ctfDifficulty", required: true },
            { name: "platform", kind: "text" },
            { name: "event", kind: "text" },
            { name: "url", kind: "url" },
            { name: "points", kind: "number", min: 0 },
            { name: "timeSpentMinutes", kind: "number", min: 0, label: "fields.timeSpentMinutes" },
            { name: "startedAt", kind: "date" },
            { name: "completedAt", kind: "date" },
            { name: "tools", kind: "list", placeholder: "ctf.toolsPlaceholder" },
            { name: "hints", kind: "textarea", rows: 3 },
            { name: "solutionNotes", kind: "textarea", rows: 4 },
            { name: "flag", kind: "text", mono: true, hint: "ctf.flagHint" },
            { name: "tags", kind: "tags" },
          ]}
        />
        <div className="mt-6">
          <AttachmentsPanel entityType="ctf" entityId={ctf.id} />
        </div>
      </aside>
    </div>
  );
}
