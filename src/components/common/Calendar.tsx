import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { addDays, addMonths, startOfWeek, toDateKey, parseDateKey } from "@/core/utils/dates";
import { fmtDate, fmtWeekday } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

/** Weeks start on Saturday (Iraq). Returns 6 weeks × 7 days of date keys. */
export function monthMatrix(month: Date): string[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => toDateKey(addDays(start, w * 7 + d))));
}

export function MonthHeader({ month, onChange, extra }: { month: Date; onChange: (d: Date) => void; extra?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" onClick={() => onChange(addMonths(month, -1))} aria-label={t("common.previous")}>
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => onChange(addMonths(month, 1))} aria-label={t("common.next")}>
          <ChevronRight className="rtl:rotate-180" />
        </Button>
        <span className="ms-1 text-sm font-semibold">{fmtDate(toDateKey(month), "MMMM yyyy")}</span>
      </div>
      <div className="flex items-center gap-1">
        {extra}
        <Button size="sm" variant="ghost" onClick={() => onChange(new Date())}>
          {t("common.today")}
        </Button>
      </div>
    </div>
  );
}

export function WeekdayRow({ short = true }: { short?: boolean }) {
  const start = startOfWeek(new Date());
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="py-1 text-center text-[11px] font-medium text-subtle">
          {fmtWeekday(addDays(start, i), !short)}
        </div>
      ))}
    </div>
  );
}

export function MiniCalendar({ value, onSelect, marked, month: monthProp, onMonthChange }: { value?: string | null; onSelect: (key: string) => void; marked?: Set<string>; month?: Date; onMonthChange?: (d: Date) => void }) {
  const [monthState, setMonthState] = React.useState(() => (value ? parseDateKey(value) : new Date()));
  const month = monthProp ?? monthState;
  const setMonth = onMonthChange ?? setMonthState;
  const today = toDateKey(new Date());
  return (
    <div className="w-[260px] select-none">
      <MonthHeader month={month} onChange={setMonth} />
      <div className="mt-2">
        <WeekdayRow />
        {monthMatrix(month).map((week, i) => (
          <div key={i} className="grid grid-cols-7">
            {week.map((k) => {
              const inMonth = parseDateKey(k).getMonth() === month.getMonth();
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onSelect(k)}
                  className={cn(
                    "relative m-0.5 flex h-8 items-center justify-center rounded-md text-xs tabular-nums transition-colors hover:bg-surface-2",
                    !inMonth && "text-subtle/60",
                    k === today && "font-semibold text-accent",
                    k === value && "bg-accent text-accent-fg hover:bg-accent",
                  )}
                >
                  {parseDateKey(k).getDate()}
                  {marked?.has(k) && <span className={cn("absolute bottom-1 size-1 rounded-full", k === value ? "bg-accent-fg" : "bg-accent")} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
