import * as React from "react";
import { Checkbox as CB, Switch as SW, Tooltip as TT, Progress as PR } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export function Checkbox({ checked, onCheckedChange, className, label, disabled, id }: { checked: boolean | "indeterminate"; onCheckedChange?: (v: boolean) => void; className?: string; label?: React.ReactNode; disabled?: boolean; id?: string }) {
  const box = (
    <CB.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-sunken transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg",
        className,
      )}
    >
      <CB.Indicator>{checked === "indeterminate" ? <Minus className="size-3" /> : <Check className="size-3" strokeWidth={3} />}</CB.Indicator>
    </CB.Root>
  );
  if (!label) return box;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      {box}
      <span>{label}</span>
    </label>
  );
}

export function Switch({ checked, onCheckedChange, label, description, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  const sw = (
    <SW.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className="relative h-5 w-9 shrink-0 rounded-full bg-border-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50"
    >
      <SW.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[18px]" />
    </SW.Root>
  );
  if (!label) return sw;
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      {sw}
    </label>
  );
}

export const TooltipProvider = TT.Provider;

export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return children;
  return (
    <TT.Root delayDuration={350}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-[100] max-w-xs rounded-md border border-border bg-elev px-2 py-1 text-xs text-fg shadow-lg animate-in">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

export function ProgressBar({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "success" | "warning" | "danger" }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <PR.Root value={v} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <PR.Indicator className={cn("h-full rounded-full transition-all rtl:ms-auto", color)} style={{ width: `${v}%` }} />
    </PR.Root>
  );
}

export function Badge({ children, tone = "neutral", className, dot }: { children: React.ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info"; className?: string; dot?: string | null }) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-border",
    accent: "bg-accent/12 text-accent border-accent/25",
    success: "bg-success/12 text-success border-success/25",
    warning: "bg-warning/12 text-warning border-warning/25",
    danger: "bg-danger/12 text-danger border-danger/25",
    info: "bg-info/12 text-info border-info/25",
  };
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone], className)}>
      {dot && <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] text-muted ltr">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-border-strong border-t-accent", className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-md border border-border bg-sunken p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[6px] font-medium text-muted transition-colors hover:text-fg [&_svg]:size-3.5",
            size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-xs",
            value === o.value && "bg-surface-2 text-fg shadow-sm",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorDot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color || "rgb(var(--fg-subtle))" }} />;
}

export const PALETTE = ["#2dd4bf", "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#facc15", "#4ade80", "#f87171", "#22d3ee", "#94a3b8", "#e879f9", "#a3e635"];

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("size-6 rounded-md border-2 transition-transform hover:scale-110", value?.toLowerCase() === c ? "border-fg" : "border-transparent")}
          style={{ background: c }}
        />
      ))}
      <label className="relative size-6 cursor-pointer overflow-hidden rounded-md border border-dashed border-border-strong" title="#">
        <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" value={value ?? "#2dd4bf"} onChange={(e) => onChange(e.target.value)} />
        <span className="flex size-full items-center justify-center text-xs text-muted">+</span>
      </label>
    </div>
  );
}
