import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ShieldCheck, Terminal, Flag, FlaskConical, Route, NotebookPen, Plus } from "lucide-react";
import { PageHeader, Card, CardHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar } from "@/components/ui/controls";
import { NoteList, useCreateNote } from "@/features/notes/NotesPage";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { CYBER_TOPICS, type CyberTopic } from "@/core/model/enums";
import { templateKindForTopic } from "@/core/templates";
import { CTF_STATUS_TONE } from "./CtfPage";

export function CyberHome() {
  const { t } = useTranslation();
  const s = useServices();
  const createNote = useCreateNote();
  const [topic, setTopic] = React.useState<CyberTopic | null>(null);
  const { data: counts } = useQ(["cyber", "counts"], async () => (await s.db.query<{ commands: number; ctf: number; solved: number; labs: number; notes: number }>(
    `SELECT (SELECT COUNT(*) FROM commands) AS commands, (SELECT COUNT(*) FROM ctf_challenges) AS ctf,
            (SELECT COUNT(*) FROM ctf_challenges WHERE status = 'solved') AS solved, (SELECT COUNT(*) FROM cyber_labs) AS labs,
            (SELECT COUNT(*) FROM notes WHERE archived = 0 AND (cyber_topic IS NOT NULL OR note_type IN ('cyber_concept','ctf_writeup','lab'))) AS notes`,
  ))[0]);
  const { data: topicCounts } = useQ(["cyber", "topics"], async () => new Map((await s.db.query<{ cyber_topic: string; n: number }>("SELECT cyber_topic, COUNT(*) AS n FROM notes WHERE cyber_topic IS NOT NULL AND archived = 0 GROUP BY cyber_topic")).map((r) => [r.cyber_topic, r.n])));
  const { data: ctf = [] } = useQ(["cyber", "recent-ctf"], () => s.repos.ctf.list({ limit: 5 }));
  const { data: labs = [] } = useQ(["cyber", "recent-labs"], () => s.repos.labs.list({ limit: 5 }));
  const { data: roadmaps } = useQ(["cyber", "roadmaps"], () => s.analytics.cyberActivity({ from: "0000-01-01", to: "9999-12-31" }));

  return (
    <div>
      <PageHeader icon={<ShieldCheck />} title={t("nav.cyberHome")} description={t("cyber.lead")} actions={<Button variant="primary" onClick={() => createNote({ noteType: "cyber_concept", cyberTopic: topic, template: templateKindForTopic(topic) })}><Plus /> {t("quick.cyberNote")}</Button>} />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Link to="/notes?cyber=1"><Stat label={t("cyber.notes")} value={counts?.notes ?? 0} icon={<NotebookPen />} /></Link>
          <Link to="/cyber/commands"><Stat label={t("nav.commands")} value={counts?.commands ?? 0} icon={<Terminal />} /></Link>
          <Link to="/cyber/ctf"><Stat label={t("nav.ctf")} value={`${counts?.solved ?? 0}/${counts?.ctf ?? 0}`} hint={t("ctf.solved")} icon={<Flag />} /></Link>
          <Link to="/cyber/labs"><Stat label={t("nav.labs")} value={counts?.labs ?? 0} icon={<FlaskConical />} /></Link>
          <Link to="/cyber/roadmaps"><Stat label={t("nav.roadmaps")} value={roadmaps?.roadmaps.length ?? 0} icon={<Route />} /></Link>
        </div>
        <Card>
          <CardHeader title={t("cyber.topics")} icon={<NotebookPen />} subtitle={t("cyber.topicsHint")} />
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
            {CYBER_TOPICS.map((tp) => (
              <div key={tp} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${topic === tp ? "border-accent bg-accent/8" : "border-border"}`}>
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setTopic(topic === tp ? null : tp)}>
                  <div className="truncate text-sm">{t(`enums.cyberTopic.${tp}`)}</div>
                  <div className="text-[11px] text-subtle">{t("cyber.noteCount", { count: topicCounts?.get(tp) ?? 0 })}</div>
                </button>
                <Button size="icon-sm" variant="ghost" onClick={() => createNote({ noteType: "cyber_concept", cyberTopic: tp, template: templateKindForTopic(tp) })} aria-label={t("notes.new")}><Plus /></Button>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <NoteList filter={{ cyberOnly: true, cyberTopic: topic, limit: 12 }} emptyTitle={t("cyber.noNotes")} />
          </div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title={t("cyber.recentCtf")} icon={<Flag />} actions={<Button size="sm" variant="ghost" asChild><Link to="/cyber/ctf">{t("common.viewAll")}</Link></Button>} />
            {ctf.length === 0 ? <EmptyState compact title={t("ctf.empty")} /> : (
              <ul className="divide-y divide-border">
                {ctf.map((c) => (
                  <li key={c.id}><Link to={`/cyber/ctf/${c.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-2/50"><span className="min-w-0 flex-1 truncate">{c.name}</span><Badge tone={CTF_STATUS_TONE[c.status]}>{t(`enums.ctfStatus.${c.status}`)}</Badge></Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title={t("cyber.recentLabs")} icon={<FlaskConical />} actions={<Button size="sm" variant="ghost" asChild><Link to="/cyber/labs">{t("common.viewAll")}</Link></Button>} />
            {labs.length === 0 ? <EmptyState compact title={t("labs.empty")} /> : (
              <ul className="divide-y divide-border">
                {labs.map((l) => (
                  <li key={l.id}><Link to={`/cyber/labs/${l.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-2/50"><span className="min-w-0 flex-1 truncate">{l.name}</span><Badge>{t(`enums.labStatus.${l.status}`)}</Badge></Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title={t("nav.roadmaps")} icon={<Route />} actions={<Button size="sm" variant="ghost" asChild><Link to="/cyber/roadmaps">{t("common.viewAll")}</Link></Button>} />
            {!roadmaps?.roadmaps.length ? <EmptyState compact title={t("roadmaps.empty")} /> : (
              <ul className="space-y-3 p-4">
                {roadmaps.roadmaps.map((r, i) => (
                  <li key={i}>
                    <div className="mb-1 flex justify-between text-xs"><span className="truncate">{r.title}</span><span className="tabular-nums text-muted">{r.percent}%</span></div>
                    <ProgressBar value={r.percent} tone={r.percent === 100 ? "success" : "accent"} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
