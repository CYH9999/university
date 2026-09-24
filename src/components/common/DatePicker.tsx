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

/** Parses "9", "930", "9:30" or "09:30" into "09:30"; null when empty, undefined when invalid. */
export function normalizeTime(raw: string): string | null | undefined {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * 24-hour time field. The native time input follows the operating system's locale (12-hour
 * "AM/PM" on many systems) instead of the app language, so a plain HH:MM field is used.
 */
export function TimeInput({ value, onChange, className, id }: { value: string | null | undefined; onChange: (v: string | null) => void; className?: string; id?: string }) {
  const { t } = useTranslation();
  const [text, setText] = React.useState(value ?? "");
  React.useEffect(() => setText(value ?? ""), [value]);
  const commit = (raw: string) => {
    const v = normalizeTime(raw);
    if (v === undefined) return setText(value ?? "");
    setText(v ?? "");
    if (v !== (value ?? null)) onChange(v);
  };
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      dir="ltr"
      maxLength={5}
      placeholder="--:--"
      aria-label={id ? undefined : t("fields.time")}
      className={cn("input-base text-start tabular-nums", className)}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        // A complete HH:MM value is applied immediately so saving without leaving the field works.
        if (/^\d{2}:\d{2}$/.test(e.target.value) && normalizeTime(e.target.value)) onChange(normalizeTime(e.target.value) ?? null);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
    />
  );
}
