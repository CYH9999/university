import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Flag, Plus, Clock, Trophy } from "lucide-react";
import { PageHeader, Toolbar, EmptyState, Card, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/controls";
import { EnumSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useNewParam, useDebounced } from "@/lib/hooks";
import { fmtMinutes, fmtRelative } from "@/lib/format";
import { toDateKey } from "@/core/utils/dates";
import { noteTemplate } from "@/core/templates";
import { useSettings } from "@/app/settings";
import type { CtfChallenge } from "@/core/model/types";

export const CTF_STATUS_TONE = { todo: "neutral", in_progress: "info", solved: "success", revisit: "warning", gave_up: "danger" } as const;
export const DIFF_TONE = { easy: "success", medium: "info", hard: "warning", insane: "danger" } as const;

export function CtfPage() {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const lang = useSettings((x) => x.settings.language);
  const editor = useEditor<CtfChallenge>();
  const [status, setStatus] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<string | null>(null);
  const [difficulty, setDifficulty] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const dText = useDebounced(text);
  useNewParam(() => editor.create({}));

  const where: string[] = [];
  const params: string[] = [];
  if (status) { where.push("t.status = ?"); params.push(status); }
  if (category) { where.push("t.category = ?"); params.push(category); }
  if (difficulty) { where.push("t.difficulty = ?"); params.push(difficulty); }
  if (dText.trim()) { where.push("(t.name LIKE ? OR t.platform LIKE ? OR t.event LIKE ?)"); params.push(...Array(3).fill(`%${dText.trim()}%`)); }
  const { data = [], isLoading } = useQ(["ctf", where, params], () => s.repos.ctf.list({ where, params, limit: 5000 }));
  const { data: stats } = useQ(["ctf", "stats"], async () => (await s.db.query<{ solved: number; total: number; minutes: number | null; points: number | null }>("SELECT SUM(CASE WHEN status='solved' THEN 1 ELSE 0 END) AS solved, COUNT(*) AS total, SUM(time_spent_minutes) AS minutes, SUM(CASE WHEN status='solved' THEN points ELSE 0 END) AS points FROM ctf_challenges"))[0]);

  return (
    <div>
      <PageHeader icon={<Flag />} title={t("nav.ctf")} description={t("ctf.lead")} actions={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("ctf.new")}</Button>}>
        <Toolbar>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("common.filter")} className="w-56" />
          <EnumSelect name="ctfStatus" value={status} onChange={setStatus} placeholder={t("filters.anyStatus")} className="w-40" />
          <EnumSelect name="ctfCategory" value={category} onChange={setCategory} placeholder={t("filters.allCategories")} className="w-44" />
          <EnumSelect name="ctfDifficulty" value={difficulty} onChange={setDifficulty} placeholder={t("filters.anyDifficulty")} className="w-40" />
        </Toolbar>
      </PageHeader>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("ctf.solved")} value={`${stats?.solved ?? 0}/${stats?.total ?? 0}`} icon={<Trophy />} tone="success" />
          <Stat label={t("ctf.timeSpent")} value={fmtMinutes(stats?.minutes ?? 0)} icon={<Clock />} />
          <Stat label={t("ctf.points")} value={stats?.points ?? 0} />
          <Stat label={t("ctf.solveRate")} value={stats?.total ? `${Math.round(((stats.solved ?? 0) / stats.total) * 100)}%` : "—"} />
        </div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Flag />} title={t("ctf.empty")} description={t("ctf.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("ctf.new")}</Button>} />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {data.map((c) => (
              <Link key={c.id} to={`/cyber/ctf/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/40">
                <Flag className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-subtle">
                    {c.platform && <span>{c.platform}</span>}
                    {c.event && <span>· {c.event}</span>}
                    <span>· {fmtRelative(c.updatedAt)}</span>
                    {c.timeSpentMinutes > 0 && <span>· {fmtMinutes(c.timeSpentMinutes)}</span>}
                  </div>
                </div>
                <Badge>{t(`enums.ctfCategory.${c.category}`)}</Badge>
                <Badge tone={DIFF_TONE[c.difficulty]}>{t(`enums.ctfDifficulty.${c.difficulty}`)}</Badge>
                <Badge tone={CTF_STATUS_TONE[c.status]}>{t(`enums.ctfStatus.${c.status}`)}</Badge>
              </Link>
            ))}
          </Card>
        )}
      </div>
      <EntityDrawer<CtfChallenge>
        editor={editor}
        title={{ create: "ctf.new", edit: "ctf.edit" }}
        initial={(e, d) => (e ? { ...e } : { category: "web", difficulty: "easy", status: "todo", ...d })}
        fields={[
          { name: "name", kind: "text", required: true, span: 2, autoFocus: true },
          { name: "platform", kind: "text", placeholder: "ctf.platformPlaceholder" },
          { name: "event", kind: "text" },
          { name: "category", kind: "enum", enum: "ctfCategory", required: true },
          { name: "difficulty", kind: "enum", enum: "ctfDifficulty", required: true },
          { name: "status", kind: "enum", enum: "ctfStatus", required: true },
          { name: "points", kind: "number", min: 0 },
          { name: "url", kind: "url", span: 2 },
        ]}
        onSave={async (d) => {
          const c = await s.repos.ctf.create({ ...d, startedAt: d.status === "todo" ? null : toDateKey(new Date()), writeup: noteTemplate("ctf", lang) } as never);
          navigate(`/cyber/ctf/${c.id}`);
          return c;
        }}
      />
    </div>
  );
}
