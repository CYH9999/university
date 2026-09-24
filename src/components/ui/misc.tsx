import * as React from "react";
import { Link } from "react-router";
import { ChevronRight, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, actions, subtitle, className }: { title: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode; subtitle?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className, compact }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-1.5 px-4 py-6" : "gap-3 px-6 py-14", className)}>
      <div className={cn("flex items-center justify-center rounded-xl border border-border bg-surface-2 text-muted", compact ? "size-9 [&_svg]:size-4" : "size-12 [&_svg]:size-5")}>
        {icon ?? <Inbox />}
      </div>
      <div className="max-w-sm">
        <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export interface Crumb {
  label: React.ReactNode;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("common.breadcrumb")} className="flex min-w-0 items-center gap-1 text-xs text-muted">
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3 shrink-0 rtl:rotate-180" />}
          {c.to ? (
            <Link to={c.to} className="truncate hover:text-fg">
              {c.label}
            </Link>
          ) : (
            <span className={cn("truncate", i === items.length - 1 && "text-fg")}>{c.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function PageHeader({ title, description, actions, icon, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-bg px-6 pb-3 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent [&_svg]:size-[18px]">{icon}</div>}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-0.5 truncate text-xs text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "accent" | "warning" | "danger" | "success" }) {
  const toneCls = tone ? { accent: "text-accent", warning: "text-warning", danger: "text-danger", success: "text-success" }[tone] : "text-fg";
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="truncate">{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-subtle">{hint}</div>}
    </div>
  );
}

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">{children}</h2>
      {actions}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: React.ReactNode; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <dt className="text-muted">{it.label}</dt>
          <dd className="min-w-0 break-words">{it.value ?? <span className="text-subtle">—</span>}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
