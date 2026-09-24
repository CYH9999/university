import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { Search as SearchIcon } from "lucide-react";
import { PageHeader, Toolbar, EmptyState, Card } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/controls";
import { SubjectSelect } from "@/components/common/pickers";
import { DatePicker } from "@/components/common/DatePicker";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useDebounced } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { resolveRoute } from "@/app/shell/CommandPalette";
import { entityIcon, SEARCHABLE_TYPES } from "./entityIcons";
import type { SearchHit } from "@/core/search/search";
import { cn } from "@/lib/cn";

export function SearchPage() {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [types, setTypes] = React.useState<string[]>([]);
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [from, setFrom] = React.useState<string | null>(null);
  const [to, setTo] = React.useState<string | null>(null);
  const [tag, setTag] = React.useState("");
  const dq = useDebounced(q, 200);
  const dTag = useDebounced(tag, 200);

  React.useEffect(() => {
    setParams(dq ? { q: dq } : {}, { replace: true });
  }, [dq, setParams]);

  const enabled = dq.trim().length > 0 || dTag.trim().length > 0;
  const { data: hits = [], isFetching } = useQ(
    ["search", dq, types, subjectId, from, to, dTag],
    () => s.search(dq, { types, subjectId, from, to, tag: dTag.trim() || null, limit: 500 }),
    { enabled },
  );
  const grouped = React.useMemo(() => {
    const m = new Map<string, SearchHit[]>();
    for (const h of hits) m.set(h.entityType, [...(m.get(h.entityType) ?? []), h]);
    return [...m.entries()];
  }, [hits]);

  const toggleType = (ty: string) => setTypes((cur) => (cur.includes(ty) ? cur.filter((x) => x !== ty) : [...cur, ty]));

  return (
    <div>
      <PageHeader icon={<SearchIcon />} title={t("search.title")} description={t("search.lead")}>
        <div className="space-y-3">
          <div className="relative max-w-2xl">
            <SearchIcon className="pointer-events-none absolute start-3 top-3 size-4 text-subtle" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.placeholder")} className="h-10 ps-9 text-base" dir="auto" />
          </div>
          <Toolbar>
            <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-52" />
            <DatePicker value={from} onChange={setFrom} placeholder={t("filters.from")} className="w-48" />
            <DatePicker value={to} onChange={setTo} placeholder={t("filters.to")} className="w-48" />
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("filters.tag")} className="w-40" />
          </Toolbar>
          <div className="flex flex-wrap gap-1.5">
            {SEARCHABLE_TYPES.map((ty) => {
              const Icon = entityIcon(ty);
              const on = types.includes(ty);
              return (
                <button key={ty} type="button" onClick={() => toggleType(ty)} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", on ? "border-accent bg-accent/12 text-accent" : "border-border text-muted hover:border-border-strong")}>
                  <Icon className="size-3.5" /> {t(`entity.${ty}`)}
                </button>
              );
            })}
          </div>
        </div>
      </PageHeader>
      <div className="p-6">
        {!enabled ? (
          <EmptyState icon={<SearchIcon />} title={t("search.startTyping")} description={t("search.tips")} />
        ) : !isFetching && hits.length === 0 ? (
          <EmptyState icon={<SearchIcon />} title={t("search.noResults")} description={t("search.noResultsHint")} />
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-subtle">{t("search.resultCount", { count: hits.length })}</p>
            {grouped.map(([type, items]) => {
              const Icon = entityIcon(type);
              return (
                <section key={type}>
                  <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle">
                    <Icon className="size-3.5" /> {t(`entity.${type}`)} <span className="font-normal">({items.length})</span>
                  </h2>
                  <Card className="divide-y divide-border overflow-hidden">
                    {items.map((h) => (
                      <button key={h.entityId} type="button" onClick={async () => navigate(await resolveRoute(s, h.entityType, h.entityId, h.subjectId))} className="block w-full px-4 py-2.5 text-start hover:bg-surface-2/50">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium" dir="auto">{h.title}</span>
                          {h.date && <span className="shrink-0 text-[11px] text-subtle">{fmtDate(h.date)}</span>}
                          <Badge>{t(`entity.${h.entityType}`)}</Badge>
                        </div>
                        {h.snippet && (h.snippet.before || h.snippet.match) && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted" dir="auto">
                            {h.snippet.before}
                            {h.snippet.match && <mark className="rounded bg-accent/25 px-0.5 text-fg">{h.snippet.match}</mark>}
                            {h.snippet.after}
                          </p>
                        )}
                      </button>
                    ))}
                  </Card>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
