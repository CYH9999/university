import * as React from "react";
import { useTranslation } from "react-i18next";
import { Wallet, Plus, Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Toolbar, EmptyState, Card, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, Segmented } from "@/components/ui/controls";
import { EnumSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { AttachmentsPanel } from "@/components/common/files";
import { SubjectChip } from "@/components/common/badges";
import { ChartCard, CategoryBars, SimpleBars, SERIES } from "@/components/charts/Chart";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useSettings } from "@/app/settings";
import { useNewParam, useOpenParam, useSubjectMap, useActiveSemester } from "@/lib/hooks";
import { fmtDate, fmtMoney } from "@/lib/format";
import { addMonths, toDateKey } from "@/core/utils/dates";
import { EXPENSE_CATEGORIES, CURRENCIES } from "@/core/model/enums";
import type { Expense } from "@/core/model/types";

export function ExpensesPage() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const editor = useEditor<Expense>();
  const currency = useSettings((x) => x.settings.defaultCurrency);
  const { semester } = useActiveSemester();
  const [scope, setScope] = React.useState<"month" | "semester" | "all">("month");
  const [month, setMonth] = React.useState(new Date());
  const [category, setCategory] = React.useState<string | null>(null);
  useNewParam(() => editor.create({ date: toDateKey(new Date()), currency }));
  useOpenParam((id) => void s.repos.expenses.get(id).then((e) => e && editor.edit(e)));

  const range = React.useMemo(() => {
    if (scope === "month") {
      const first = new Date(month.getFullYear(), month.getMonth(), 1);
      const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      return { from: toDateKey(first), to: toDateKey(last) };
    }
    if (scope === "semester" && semester?.startDate) return { from: semester.startDate, to: semester.endDate ?? "9999-12-31" };
    return { from: "0000-01-01", to: "9999-12-31" };
  }, [scope, month, semester]);

  const where = ["t.date BETWEEN ? AND ?"];
  const params: string[] = [range.from, range.to];
  if (category) {
    where.push("t.category = ?");
    params.push(category);
  }
  if (scope === "semester" && semester && !semester.startDate) {
    where.push("(t.semester_id = ? OR t.subject_id IN (SELECT id FROM subjects WHERE semester_id = ?))");
    params.push(semester.id, semester.id);
  }
  const { data = [], isLoading } = useQ(["expenses", where, params], () => s.repos.expenses.list({ where, params, limit: 5000 }));

  const byCurrency = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data) m.set(e.currency, (m.get(e.currency) ?? 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const mainCurrency = byCurrency[0]?.[0] ?? currency;
  const inMain = data.filter((e) => e.currency === mainCurrency);
  const byCategory = EXPENSE_CATEGORIES.map((c, i) => ({ label: t(`enums.expenseCategory.${c}`), value: inMain.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0), color: SERIES[i % 8] })).filter((x) => x.value > 0);
  const byDay = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of inMain) m.set(scope === "month" ? e.date.slice(8) : e.date.slice(0, 7), (m.get(scope === "month" ? e.date.slice(8) : e.date.slice(0, 7)) ?? 0) + e.amount);
    return [...m.entries()].sort().map(([key, value]) => ({ key, value }));
  }, [inMain, scope]);

  return (
    <div>
      <PageHeader icon={<Wallet />} title={t("nav.expenses")} description={t("expenses.lead")} actions={<Button variant="primary" onClick={() => editor.create({ date: toDateKey(new Date()), currency })}><Plus /> {t("expenses.new")}</Button>}>
        <Toolbar>
          <Segmented value={scope} onChange={setScope} options={[{ value: "month", label: t("expenses.scopes.month") }, { value: "semester", label: semester?.name ?? t("expenses.scopes.semester") }, { value: "all", label: t("common.all") }]} />
          {scope === "month" && (
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label={t("common.previous")}><ChevronLeft className="rtl:rotate-180" /></Button>
              <span className="min-w-[120px] text-center text-sm">{fmtDate(toDateKey(month), "MMMM yyyy")}</span>
              <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label={t("common.next")}><ChevronRight className="rtl:rotate-180" /></Button>
            </div>
          )}
          <EnumSelect name="expenseCategory" value={category} onChange={setCategory} placeholder={t("filters.allCategories")} className="w-48" />
        </Toolbar>
      </PageHeader>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {byCurrency.length === 0 ? <Stat label={t("expenses.total")} value={fmtMoney(0, currency)} /> : byCurrency.slice(0, 3).map(([cur, total]) => <Stat key={cur} label={t("expenses.totalIn", { currency: cur })} value={fmtMoney(total, cur)} />)}
          <Stat label={t("expenses.count")} value={data.length} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={t("expenses.byCategory", { currency: mainCurrency })} empty={byCategory.length === 0}>
            <CategoryBars data={byCategory} name={mainCurrency} format={(v) => fmtMoney(v, mainCurrency)} />
          </ChartCard>
          <ChartCard title={scope === "month" ? t("expenses.byDay", { currency: mainCurrency }) : t("expenses.byMonth", { currency: mainCurrency })} empty={byDay.length === 0}>
            <SimpleBars data={byDay} name={mainCurrency} format={(v) => fmtMoney(v, mainCurrency)} />
          </ChartCard>
        </div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Wallet />} title={t("expenses.empty")} description={t("expenses.emptyHint")} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-4 py-2 text-start font-medium">{t("fields.date")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("fields.description")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("fields.category")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("fields.paymentMethod")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("fields.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-surface-2/40" onClick={() => editor.edit(e)}>
                    <td className="px-4 py-2 text-xs text-muted">{fmtDate(e.date, "EEE d MMM yyyy")}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate" dir="auto">{e.description || "—"}</span>
                        <SubjectChip subject={e.subjectId ? subjects.get(e.subjectId) : null} link={false} />
                        {e.receiptFileId && <Receipt className="size-3.5 text-muted" />}
                      </div>
                    </td>
                    <td className="px-3 py-2"><Badge>{t(`enums.expenseCategory.${e.category}`)}</Badge></td>
                    <td className="px-3 py-2 text-xs text-muted">{t(`enums.paymentMethod.${e.paymentMethod}`)}</td>
                    <td className="px-4 py-2 text-end font-medium tabular-nums">{fmtMoney(e.amount, e.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      <EntityDrawer<Expense>
        editor={editor}
        title={{ create: "expenses.new", edit: "expenses.edit" }}
        initial={(e, d) => (e ? { ...e } : { category: "other", paymentMethod: "cash", currency, semesterId: semester?.id ?? null, ...d })}
        fields={[
          { name: "amount", kind: "number", required: true, min: 0 },
          { name: "currency", kind: "select", required: true, options: CURRENCIES.map((c) => ({ value: c, label: c })) },
          { name: "date", kind: "date", required: true },
          { name: "category", kind: "enum", enum: "expenseCategory", required: true },
          { name: "description", kind: "text", span: 2 },
          { name: "paymentMethod", kind: "enum", enum: "paymentMethod", required: true },
          { name: "semesterId", kind: "semester" },
          { name: "subjectId", kind: "subject" },
          { name: "projectId", kind: "project" },
        ]}
        onSave={(d, e) => (e ? s.repos.expenses.update(e.id, d as Partial<Expense>) : s.repos.expenses.create(d as never))}
        onDelete={(e) => s.repos.expenses.remove(e.id)}
        onRestore={(snap) => s.repos.expenses.restore(snap)}
      >
        {(e) => (e ? <ReceiptPanel expense={e} /> : <p className="text-xs text-subtle">{t("expenses.saveForReceipt")}</p>)}
      </EntityDrawer>
    </div>
  );
}

function ReceiptPanel({ expense }: { expense: Expense }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data: files = [], isSuccess } = useQ(["attachments", "expense", expense.id], () => s.files.forEntity("expense", expense.id));
  React.useEffect(() => {
    if (!isSuccess) return;
    const first = files[0]?.id ?? null;
    if (first !== expense.receiptFileId) void s.repos.expenses.update(expense.id, { receiptFileId: first });
  }, [isSuccess, files, expense.id, expense.receiptFileId, s]);
  return <AttachmentsPanel entityType="expense" entityId={expense.id} title={t("expenses.receipt")} />;
}

