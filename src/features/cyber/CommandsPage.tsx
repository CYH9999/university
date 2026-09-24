import * as React from "react";
import { useTranslation } from "react-i18next";
import { Terminal, Plus, Star, AlertTriangle, Search, ShieldAlert } from "lucide-react";
import { PageHeader, Toolbar, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/controls";
import { EnumSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { CodeBlock } from "@/components/common/CodeBlock";
import { SubjectChip } from "@/components/common/badges";
import { CODE_LANGUAGES } from "@/components/editor/RichEditor";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useNewParam, useOpenParam, useSubjectMap, useDebounced } from "@/lib/hooks";
import type { CommandEntry } from "@/core/model/types";
import { cn } from "@/lib/cn";

export function CommandsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const editor = useEditor<CommandEntry>();
  const [text, setText] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const [platform, setPlatform] = React.useState<string | null>(null);
  const [tool, setTool] = React.useState<string | null>(null);
  const [fav, setFav] = React.useState(false);
  const dText = useDebounced(text, 200);
  useNewParam((p) => editor.create({ labId: p.get("labId"), subjectId: p.get("subjectId") }));
  useOpenParam((id) => void s.repos.commands.get(id).then((c) => c && editor.edit(c)));

  const { data: tools = [] } = useQ(["commands", "tools"], async () => (await s.db.query<{ tool: string }>("SELECT DISTINCT tool FROM commands WHERE tool IS NOT NULL AND tool <> '' ORDER BY tool COLLATE NOCASE")).map((r) => r.tool));
  const { data = [], isLoading } = useQ(["commands", dText, category, platform, tool, fav], async () => {
    if (dText.trim()) {
      const hits = await s.search(dText, { types: ["command"], limit: 500 });
      let rows = await s.repos.commands.getMany(hits.map((h) => h.entityId));
      const order = new Map(hits.map((h, i) => [h.entityId, i]));
      rows = rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return rows.filter((c) => (!category || c.category === category) && (!platform || c.platform === platform) && (!tool || c.tool === tool) && (!fav || c.favorite));
    }
    const where: string[] = [];
    const params: string[] = [];
    if (category) { where.push("t.category = ?"); params.push(category); }
    if (platform) { where.push("t.platform = ?"); params.push(platform); }
    if (tool) { where.push("t.tool = ?"); params.push(tool); }
    if (fav) where.push("t.favorite = 1");
    return s.repos.commands.list({ where, params, limit: 5000 });
  });
  const toggleFav = useMut((c: CommandEntry) => s.repos.commands.update(c.id, { favorite: !c.favorite }));

  return (
    <div>
      <PageHeader icon={<Terminal />} title={t("nav.commands")} description={t("commands.lead")} actions={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("commands.new")}</Button>}>
        <Toolbar>
          <div className="relative w-72">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-subtle" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("commands.searchPlaceholder")} className="ps-8" />
          </div>
          <EnumSelect name="commandCategory" value={category} onChange={setCategory} placeholder={t("filters.allCategories")} className="w-48" />
          <EnumSelect name="commandPlatform" value={platform} onChange={setPlatform} placeholder={t("filters.allPlatforms")} className="w-40" />
          <select className="input-base w-36" value={tool ?? ""} onChange={(e) => setTool(e.target.value || null)} aria-label={t("fields.tool")}>
            <option value="">{t("filters.allTools")}</option>
            {tools.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <Button size="sm" variant={fav ? "primary" : "ghost"} onClick={() => setFav((f) => !f)}><Star /> {t("notes.scopes.favorites")}</Button>
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        <div className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info/8 px-3 py-2 text-xs text-muted">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-info" />
          {t("commands.safetyNote")}
        </div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Terminal />} title={t("commands.empty")} description={t("commands.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("commands.new")}</Button>} />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {data.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start gap-2">
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => editor.edit(c)}>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.tool && <span className="font-mono text-sm font-semibold text-accent">{c.tool}</span>}
                      <span className="truncate text-sm">{c.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>{t(`enums.commandCategory.${c.category}`)}</Badge>
                      <Badge>{t(`enums.commandPlatform.${c.platform}`)}</Badge>
                      <SubjectChip subject={c.subjectId ? subjects.get(c.subjectId) : null} link={false} />
                      {c.tags.map((tag) => <Badge key={tag} tone="accent">#{tag}</Badge>)}
                    </div>
                  </button>
                  <button type="button" onClick={() => toggleFav.mutate(c)} aria-label={t("notes.favorite")} className="text-muted hover:text-warning">
                    <Star className={cn("size-4", c.favorite && "fill-warning text-warning")} />
                  </button>
                </div>
                <CodeBlock className="mt-3" code={c.command} language={c.language} compact />
                {c.explanation && <p className="mt-2 line-clamp-3 text-xs text-muted" dir="auto">{c.explanation}</p>}
                {c.warnings && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-warning" dir="auto">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {c.warnings}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
      <EntityDrawer<CommandEntry>
        editor={editor}
        width="w-[640px]"
        title={{ create: "commands.new", edit: "commands.edit" }}
        initial={(e, d) => (e ? { ...e } : { category: "other", platform: "linux", language: "bash", ...d })}
        fields={(d) => [
          { name: "command", kind: "code", required: true, span: 2, rows: 3, placeholder: "commands.commandPlaceholder" },
          { name: "title", kind: "text", span: 2 },
          { name: "tool", kind: "text", mono: true },
          { name: "language", kind: "select", required: true, options: CODE_LANGUAGES.map((l) => ({ value: l, label: l })) },
          { name: "category", kind: "enum", enum: "commandCategory", required: true },
          { name: "platform", kind: "enum", enum: "commandPlatform", required: true },
          { name: "explanation", kind: "textarea", span: 2, rows: 3 },
          { name: "example", kind: "code", span: 2, rows: 3 },
          { name: "expectedOutput", kind: "code", span: 2, rows: 3 },
          { name: "warnings", kind: "textarea", span: 2, rows: 2 },
          { name: "subjectId", kind: "subject" },
          { name: "labId", kind: "lab" },
          { name: "tags", kind: "tags", span: 2 },
          { name: "favorite", kind: "bool" },
          d.command ? { name: "preview", kind: "custom", span: 2, label: "commands.preview", render: (v) => <CodeBlock code={String(v.command ?? "")} language={String(v.language ?? "bash")} /> } : null,
        ]}
        onSave={(d, e) => {
          const { preview: _p, ...rest } = d as Record<string, unknown>;
          return e ? s.repos.commands.update(e.id, rest as Partial<CommandEntry>) : s.repos.commands.create(rest as never);
        }}
        onDelete={(e) => s.repos.commands.remove(e.id)}
        onRestore={(snap) => s.repos.commands.restore(snap)}
      />
    </div>
  );
}
