import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { GraduationCap, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader, Stat, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar, ColorDot, Segmented } from "@/components/ui/controls";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useActiveSemester } from "@/lib/hooks";
import { fmtNumber } from "@/lib/format";
import { GradeEditor } from "./GradeEditor";
import type { GpaReport } from "@/core/services/grades";
import { scaleName, gradeLabel } from "@/lib/grading";

function gpaText(v: number | null | undefined, kind?: string) {
  if (v === null || v === undefined) return "—";
  return kind === "percentage" ? `${fmtNumber(v, 1)}%` : fmtNumber(v, 2);
}

export function GradesPage() {
  const { t } = useTranslation();
  const s = useServices();
  const { semester } = useActiveSemester();
  const [scope, setScope] = React.useState<"semester" | "cumulative">("semester");
  const [open, setOpen] = React.useState<string | null>(null);
  const { data: sem } = useQ(["gpa", "semester", semester?.id], () => (semester ? s.grades.semesterGpa(semester.id) : Promise.resolve(null)));
  const { data: cum } = useQ(["gpa", "cumulative"], () => s.grades.cumulativeGpa());
  const report: GpaReport | null | undefined = scope === "semester" ? sem : cum;

  return (
    <div>
      <PageHeader
        icon={<GraduationCap />}
        title={t("nav.grades")}
        description={t("grades.lead")}
        actions={
          <Button asChild>
            <Link to="/settings?tab=grading">
              <Settings2 /> {t("grades.manageScales")}
            </Link>
          </Button>
        }
      >
        <Segmented value={scope} onChange={setScope} options={[{ value: "semester", label: semester?.name ?? t("grades.semesterGpa") }, { value: "cumulative", label: t("grades.cumulativeGpa") }]} />
      </PageHeader>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={scope === "semester" ? t("grades.semesterGpa") : t("grades.cumulativeGpa")} value={gpaText(report?.actual, report?.scale?.kind)} hint={t("grades.actualHint")} tone="accent" />
          <Stat label={t("grades.projectedGpa")} value={gpaText(report?.projected, report?.scale?.kind)} hint={t("grades.projectedHint")} />
          <Stat label={t("grades.completedCredits")} value={fmtNumber(report?.actualCredits ?? 0, 1)} hint={t("grades.ofCredits", { n: fmtNumber(report?.totalCredits ?? 0, 1) })} />
          <Stat label={t("grades.scale")} value={<span className="text-base">{scaleName(report?.scale?.name)}</span>} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Badge tone="success">{t("enums.gradeStatus.actual")}</Badge> {t("grades.legendActual")}</span>
          <span className="flex items-center gap-1.5"><Badge tone="warning">{t("enums.gradeStatus.estimated")}</Badge> {t("grades.legendEstimated")}</span>
          <span className="flex items-center gap-1.5"><Badge>{t("enums.gradeStatus.missing")}</Badge> {t("grades.legendMissing")}</span>
        </div>
        {!report || report.subjects.length === 0 ? (
          <EmptyState icon={<GraduationCap />} title={t("grades.noSubjects")} description={t("grades.noSubjectsHint")} action={<Button asChild variant="primary"><Link to="/subjects?new=1">{t("subjects.new")}</Link></Button>} />
        ) : (
          <div className="space-y-2">
            {report.subjects.map((r) => {
              const pct = r.summary.finalPercent ?? r.summary.projectedPercent;
              const isOpen = open === r.subject.id;
              return (
                <Card key={r.subject.id} className="overflow-hidden">
                  <button type="button" className="flex w-full items-center gap-4 px-4 py-3 text-start hover:bg-surface-2/40" onClick={() => setOpen(isOpen ? null : r.subject.id)}>
                    <ColorDot color={r.subject.color} className="size-3" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.subject.name}</div>
                      <div className="text-xs text-subtle">
                        {t("subjects.creditsShort", { n: fmtNumber(r.subject.credits, 1) })} · {scaleName(r.scale?.name)}
                        {!r.subject.countsInGpa && ` · ${t("grades.notInGpa")}`}
                      </div>
                    </div>
                    <div className="hidden w-48 md:block">
                      <ProgressBar value={pct ?? 0} tone={r.summary.state === "final" ? "success" : "accent"} />
                      <div className="mt-1 text-[11px] text-subtle">{t("grades.gradedWeight", { done: fmtNumber(r.summary.actualWeight, 0), total: fmtNumber(r.summary.totalWeight, 0) })}</div>
                    </div>
                    <div className="w-24 text-end">
                      <div className="font-semibold tabular-nums">{pct === null ? "—" : `${fmtNumber(pct, 1)}%`}</div>
                      <div className="text-[11px] text-subtle">{gradeLabel(r.summary.state === "final" ? r.letter : r.projectedLetter)}</div>
                    </div>
                    <Badge tone={r.summary.state === "final" ? "success" : r.summary.state === "in_progress" ? "warning" : "neutral"}>{t(`grades.states.${r.summary.state}`)}</Badge>
                    {isOpen ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-border p-4">
                      <GradeEditor subjectId={r.subject.id} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
