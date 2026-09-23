import * as React from "react";
import { Dialog as D, DropdownMenu as DM, Popover as PO, Tabs as TB } from "radix-ui";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  onEscapeKeyDown,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
}) {
  const { t } = useTranslation();
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] animate-in" />
        <D.Content
          onEscapeKeyDown={onEscapeKeyDown}
          className={cn("fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col rounded-xl border border-border bg-elev shadow-2xl animate-in", w)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-xs text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("common.close")}>
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  width = "w-[560px]",
  headerExtra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  headerExtra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 animate-in" />
        <D.Content className={cn("fixed inset-y-0 end-0 z-50 flex max-w-[95vw] flex-col border-s border-border bg-elev shadow-2xl animate-in", width)}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <D.Title className="min-w-0 truncate text-base font-semibold">{title}</D.Title>
            <D.Description className="sr-only">{title}</D.Description>
            <div className="flex items-center gap-1">
              {headerExtra}
              <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("common.close")}>
                <X className="size-4" />
              </D.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={4} className={cn("z-[60] min-w-[180px] rounded-lg border border-border bg-elev p-1 shadow-xl animate-in", className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, icon, disabled, shortcut }: { children: React.ReactNode; onSelect?: () => void; danger?: boolean; icon?: React.ReactNode; disabled?: boolean; shortcut?: string }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        danger && "text-danger data-[highlighted]:bg-danger/10 [&_svg]:text-danger",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-[10px] text-subtle ltr">{shortcut}</span>}
    </DM.Item>
  );
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-subtle">{children}</DM.Label>;
}

export function Popover({ trigger, children, align = "start", className, open, onOpenChange }: { trigger: React.ReactNode; children: React.ReactNode; align?: "start" | "end" | "center"; className?: string; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  return (
    <PO.Root open={open} onOpenChange={onOpenChange}>
      <PO.Trigger asChild>{trigger}</PO.Trigger>
      <PO.Portal>
        <PO.Content align={align} sideOffset={6} className={cn("z-[60] rounded-lg border border-border bg-elev p-3 shadow-xl animate-in", className)}>
          {children}
        </PO.Content>
      </PO.Portal>
    </PO.Root>
  );
}

export function Tabs({ value, onValueChange, tabs, children, className, listClassName }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: React.ReactNode; icon?: React.ReactNode; count?: number }[]; children?: React.ReactNode; className?: string; listClassName?: string }) {
  return (
    <TB.Root value={value} onValueChange={onValueChange} className={className}>
      <TB.List className={cn("flex items-center gap-1 overflow-x-auto border-b border-border", listClassName)}>
        {tabs.map((tab) => (
          <TB.Trigger
            key={tab.value}
            value={tab.value}
            className="relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg [&_svg]:size-4"
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">{tab.count}</span>}
          </TB.Trigger>
        ))}
      </TB.List>
      {children}
    </TB.Root>
  );
}
