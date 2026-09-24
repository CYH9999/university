import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { FlaskConical, Plus } from "lucide-react";
import { PageHeader, Toolbar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/controls";
import { EnumSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { SubjectChip } from "@/components/common/badges";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useNewParam, useSubjectMap, useDebounced } from "@/lib/hooks";
import { fmtRelative } from "@/lib/format";
import type { CyberLab } from "@/core/model/types";

export const LAB_TONE = { planned: "neutral", in_progress: "info", completed: "success", blocked: "danger" } as const;

export function LabsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const subjects = useSubjectMap();
  const editor = useEditor<CyberLab>();
  const [status, setStatus] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const dText = useDebounced(text);
  useNewParam((p) => editor.create({ subjectId: p.get("subjectId") }));
  const where: string[] = [];
  const params: string[] = [];
  if (status) { where.push("t.status = ?"); params.push(status); }
  if (dText.trim()) { where.push("(t.name LIKE ? OR t.objective LIKE ? OR t.environment LIKE ?)"); params.push(...Array(3).fill(`%${dText.trim()}%`)); }
  const { data = [], isLoading } = useQ(["labs", where, params], () => s.repos.labs.list({ where, params, limit: 5000 }));
  return (
    <div>
      <PageHeader icon={<FlaskConical />} title={t("nav.labs")} description={t("labs.lead")} actions={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("labs.new")}</Button>}>
        <Toolbar>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("common.filter")} className="w-56" />
          <EnumSelect name="labStatus" value={status} onChange={setStatus} placeholder={t("filters.anyStatus")} className="w-44" />
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<FlaskConical />} title={t("labs.empty")} description={t("labs.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("labs.new")}</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.map((l) => (
              <Link key={l.id} to={`/cyber/labs/${l.id}`} className="card flex flex-col p-4 hover:border-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-semibold">{l.name}</h3>
                  <Badge tone={LAB_TONE[l.status]}>{t(`enums.labStatus.${l.status}`)}</Badge>
                </div>
                {l.objective && <p className="mt-1 line-clamp-2 text-xs text-muted" dir="auto">{l.objective}</p>}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                  {l.tools.slice(0, 6).map((tool) => <Badge key={tool}>{tool}</Badge>)}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-subtle">
                  <SubjectChip subject={l.subjectId ? subjects.get(l.subjectId) : null} link={false} />
                  <span className="ms-auto">{fmtRelative(l.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <EntityDrawer<CyberLab>
        editor={editor}
        title={{ create: "labs.new", edit: "labs.edit" }}
        initial={(e, d) => (e ? { ...e } : { status: "planned", tools: [], ...d })}
        fields={[
          { name: "name", kind: "text", required: true, span: 2, autoFocus: true },
          { name: "objective", kind: "textarea", span: 2, rows: 2 },
          { name: "environment", kind: "text", span: 2, placeholder: "labs.environmentPlaceholder" },
          { name: "tools", kind: "list", span: 2 },
          { name: "status", kind: "enum", enum: "labStatus", required: true },
          { name: "subjectId", kind: "subject" },
        ]}
        onSave={async (d) => {
          const l = await s.repos.labs.create(d as never);
          navigate(`/cyber/labs/${l.id}`);
          return l;
        }}
      />
    </div>
  );
}
