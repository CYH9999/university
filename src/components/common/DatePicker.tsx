import * as React from "react";
import { CalendarDays, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover } from "@/components/ui/overlay";
import { MiniCalendar } from "./Calendar";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { toDateKey, addDaysKey } from "@/core/utils/dates";

export function DatePicker({ value, onChange, placeholder, className, clearable = true, id }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string; className?: string; clearable?: boolean; id?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const today = toDateKey(new Date());
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button id={id} type="button" className={cn("input-base flex items-center gap-2 text-start", !value && "text-subtle", className)}>
          <CalendarDays className="size-4 shrink-0 text-muted" />
          <span className="flex-1 truncate">{value ? fmtDate(value, "EEE d MMM yyyy") : placeholder ?? t("common.pickDate")}</span>
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={t("common.clear")}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-3.5" />
            </span>
          )}
        </button>
      }
    >
      <MiniCalendar
        value={value ?? null}
        onSelect={(k) => {
          onChange(k);
          setOpen(false);
        }}
      />
      <div className="mt-2 flex gap-1 border-t border-border pt-2">
        {[
          { l: t("common.today"), v: today },
          { l: t("common.tomorrow"), v: addDaysKey(today, 1) },
          { l: t("common.nextWeek"), v: addDaysKey(today, 7) },
        ].map((q) => (
          <button key={q.l} type="button" className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg" onClick={() => { onChange(q.v); setOpen(false); }}>
            {q.l}
          </button>
        ))}
      </div>
    </Popover>
  );
}

export function TimeInput({ value, onChange, className, id }: { value: string | null | undefined; onChange: (v: string | null) => void; className?: string; id?: string }) {
  return (
    <input
      id={id}
      type="time"
      className={cn("input-base ltr", className)}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}
