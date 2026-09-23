import * as React from "react";
import { create } from "zustand";
import { AlertDialog as AD } from "radix-ui";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text to enable the confirm button. */
  typeToConfirm?: string;
  /** When set, shows a text input; `promptText` resolves with its value. */
  input?: { label?: string; initial?: string; placeholder?: string };
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  value: string;
  ask(o: ConfirmOptions): Promise<boolean>;
  close(v: boolean): void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  value: "",
  ask: (o) =>
    new Promise<boolean>((resolve) => {
      get().current?.resolve(false);
      set({ current: { ...o, resolve }, value: o.input?.initial ?? "" });
    }),
  close: (v) => {
    get().current?.resolve(v);
    set({ current: null });
  },
}));

/** `await confirm({...})` — returns true only after an explicit confirmation. */
export const confirm = (o: ConfirmOptions) => useConfirmStore.getState().ask(o);

/** Asks for a line of text; resolves with null when cancelled. */
export async function promptText(o: Omit<ConfirmOptions, "input"> & { label?: string; initial?: string; placeholder?: string }): Promise<string | null> {
  const ok = await useConfirmStore.getState().ask({ ...o, input: { label: o.label, initial: o.initial, placeholder: o.placeholder } });
  return ok ? useConfirmStore.getState().value : null;
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const current = useConfirmStore((s) => s.current);
  const close = useConfirmStore((s) => s.close);
  const value = useConfirmStore((s) => s.value);
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => setTyped(""), [current]);
  const blocked = !!current?.typeToConfirm && typed.trim() !== current.typeToConfirm;
  return (
    <AD.Root open={!!current} onOpenChange={(o) => !o && close(false)}>
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-[80] bg-black/55 animate-in" />
        <AD.Content className="fixed left-1/2 top-[20vh] z-[80] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-border bg-elev p-5 shadow-2xl animate-in">
          <div className="flex gap-3">
            {current?.danger && (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger/12 text-danger">
                <AlertTriangle className="size-[18px]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <AD.Title className="text-base font-semibold">{current?.title}</AD.Title>
              <AD.Description asChild>
                <div className="mt-1.5 text-sm leading-relaxed text-muted">{current?.description}</div>
              </AD.Description>
              {current?.input && (
                <div className="mt-3">
                  {current.input.label && <p className="mb-1.5 text-xs text-muted">{current.input.label}</p>}
                  <Input
                    value={value}
                    autoFocus
                    placeholder={current.input.placeholder}
                    onChange={(e) => useConfirmStore.setState({ value: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && close(true)}
                  />
                </div>
              )}
              {current?.typeToConfirm && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted">{t("confirm.typeToConfirm", { text: current.typeToConfirm })}</p>
                  <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <AD.Cancel asChild>
              <Button variant="ghost">{current?.cancelLabel ?? t("common.cancel")}</Button>
            </AD.Cancel>
            <Button variant={current?.danger ? "danger" : "primary"} disabled={blocked} onClick={() => close(true)}>
              {current?.confirmLabel ?? t("common.confirm")}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
