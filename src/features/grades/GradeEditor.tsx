import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Wand2, Target, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { useSettings } from "@/app/settings";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar } from "@/components/ui/controls";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/overlay";
import { EnumSelect } from "@/components/common/pickers";
import { Stat, EmptyState } from "@/components/ui/misc";
import { errorMessage } from "@/lib/errors";
import { fmtNumber } from "@/lib/format";
import { gradeTemplate, GRADE_TEMPLATES } from "@/core/templates";
import type { GradeItem } from "@/core/model/types";
import { cn } from "@/lib/cn";
import { gradeLabel } from "@/lib/grading";

/** Inline, spreadsheet-like grade editor for one subject with live calculations. */
export function GradeEditor({ subjectId }: { subjectId: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const lang = useSettings((st) => st.settings.language);
  const { data: report } = useQ(["grades", "report", subjectId], () => s.grades.subjectReport(subjectId));
  const items = report?.items ?? [];

  const save = async (item: GradeItem, patch: Partial<GradeItem>) => {
    try {
      const next = { ...patch };
      // Entering a score marks the item as actual unless it was explicitly estimated.
      if ("score" in patch && patch.score !== null && item.status === "missing") next.status = "actual";
      if ("score" in patch && patch.score === null) next.status = "missing";
      await s.repos.grades.update(item.id, next);
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const add = async () => {
    await s.repos.grades.create({ subjectId, name: t("grades.newItem"), category: "assignment", weight: 0, maxScore: 100, status: "missing", sortOrder: items.length } as never);
    await invalidateAll();
  };
  const remove = async (id: string) => {
    const snap = await s.repos.grades.remove(id);
    await invalidateAll();
    toast.success(t("toast.deleted"), { action: { label: t("common.undo"), onClick: () => void s.repos.grades.restore(snap).then(invalidateAll) } });
  };
  const applyTemplate = async (key: string) => {
    await s.grades.applyTemplate(subjectId, gradeTemplate(key, lang));
    await invalidateAll();
  };

  const sum = report?.summary;
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${fmtNumber(v, 1)}%`);

  return (
    <div className="space-y-4">
      {sum && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("grades.current")} value={pct(sum.currentPercent)} hint={t("grades.currentHint")} />
          <Stat label={t("grades.earned")} value={pct(sum.earnedPercent)} hint={t("grades.earnedHint")} />
          <Stat label={t("grades.projected")} value={pct(sum.projectedPercent)} hint={report?.projectedLetter ? gradeLabel(report.projectedLetter) : t("grades.estimate")} tone="accent" />
          <Stat
            label={t("grades.final")}
            value={pct(sum.finalPercent)}
            hint={sum.state === "final" ? gradeLabel(report?.letter) : t(`grades.states.${sum.state}`)}
            tone={sum.state === "final" ? "success" : undefined}
          />
        </div>
      )}
      {sum && !sum.weightsValid && items.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="size-4" /> {t("grades.weightsWarning", { total: fmtNumber(sum.totalWeight, 1) })}
        </div>
      )}
      {report?.subject.targetGrade !== null && report?.subject.targetGrade !== undefined && report.neededForTarget !== null && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <Target className="size-4 text-accent" />
          {report.neededForTarget > 100
            ? t("grades.targetUnreachable", { target: report.subject.targetGrade })
            : t("grades.neededForTarget", { target: report.subject.targetGrade, needed: fmtNumber(Math.max(0, report.neededForTarget), 1) })}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs text-muted">
              <th className="px-3 py-2 text-start font-medium">{t("fields.name")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("fields.category")}</th>
              <th className="w-24 px-3 py-2 text-start font-medium">{t("fields.weight")} %</th>
              <th className="w-24 px-3 py-2 text-start font-medium">{t("fields.score")}</th>
              <th className="w-24 px-3 py-2 text-start font-medium">{t("fields.maxScore")}</th>
              <th className="w-36 px-3 py-2 text-start font-medium">{t("fields.status")}</th>
              <th className="w-28 px-3 py-2 text-start font-medium">{t("grades.contribution")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((it) => {
              const contrib = it.score !== null && it.maxScore > 0 ? (it.score / it.maxScore) * it.weight : null;
              return (
                <tr key={it.id} className={cn(it.status === "missing" && "text-muted")}>
                  <td className="px-2 py-1">
                    <CellInput value={it.name} onCommit={(v) => v.trim() && save(it, { name: v.trim() })} />
                  </td>
                  <td className="px-2 py-1">
                    <EnumSelect name="gradeCategory" value={it.category} onChange={(v) => v && save(it, { category: v as GradeItem["category"] })} className="h-8" />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput numeric value={String(it.weight)} onCommit={(v) => save(it, { weight: Number(v) || 0 })} />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput numeric value={it.score === null ? "" : String(it.score)} onCommit={(v) => save(it, { score: v === "" ? null : Number(v) })} placeholder="—" />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput numeric value={String(it.maxScore)} onCommit={(v) => Number(v) > 0 && save(it, { maxScore: Number(v) })} />
                  </td>
                  <td className="px-2 py-1">
                    <EnumSelect name="gradeStatus" value={it.status} onChange={(v) => v && save(it, { status: v as GradeItem["status"] })} className="h-8" />
                  </td>
                  <td className="px-3 py-1 tabular-nums">
                    {contrib === null ? <span className="text-subtle">—</span> : (
                      <span className="flex items-center gap-1.5">
                        {fmtNumber(contrib, 2)}
                        {it.status === "estimated" && <Badge tone="warning">{t("enums.gradeStatus.estimated")}</Badge>}
                      </span>
                    )}
                  </td>
                  <td className="px-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => remove(it.id)} aria-label={t("common.delete")}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <EmptyState compact title={t("grades.noItems")} description={t("grades.noItemsHint")} />}
        {sum && items.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>{t("grades.gradedWeight", { done: fmtNumber(sum.actualWeight, 1), total: fmtNumber(sum.totalWeight, 1) })}</span>
              <span>{t("grades.estimatedWeight", { n: fmtNumber(sum.estimatedWeight, 1) })}</span>
            </div>
            <ProgressBar value={sum.totalWeight ? (sum.actualWeight / sum.totalWeight) * 100 : 0} />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={add}>
          <Plus /> {t("grades.addItem")}
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <Wand2 /> {t("grades.applyTemplate")}
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            {Object.keys(GRADE_TEMPLATES).map((k) => (
              <MenuItem key={k} onSelect={() => void applyTemplate(k)}>
                {t(`grades.templates.${k}`)}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}

function CellInput({ value, onCommit, numeric, placeholder }: { value: string; onCommit: (v: string) => void; numeric?: boolean; placeholder?: string }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <input
      value={v}
      placeholder={placeholder}
      inputMode={numeric ? "decimal" : undefined}
      dir={numeric ? "ltr" : "auto"}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setV(value);
      }}
      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 outline-none hover:border-border focus:border-accent/60 focus:bg-sunken"
    />
  );
}
