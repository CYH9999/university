import * as React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/overlay";
import { Kbd } from "@/components/ui/controls";

const SHORTCUTS: [string, string][] = [
  ["Ctrl K", "shortcuts.palette"],
  ["Ctrl N", "shortcuts.newNote"],
  ["Ctrl Shift T", "shortcuts.newTask"],
  ["Ctrl S", "shortcuts.save"],
  ["Ctrl B", "shortcuts.sidebar"],
  ["Ctrl ,", "shortcuts.settings"],
  ["Alt ←", "shortcuts.back"],
  ["Alt →", "shortcuts.forward"],
  ["Ctrl + Click", "shortcuts.openLink"],
  ["?", "shortcuts.help"],
];

export function ShortcutsHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (e.key === "?" && !typing) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Modal open={open} onOpenChange={setOpen} title={t("shortcuts.title")} size="sm">
      <ul className="divide-y divide-border">
        {SHORTCUTS.map(([k, label]) => (
          <li key={k} className="flex items-center justify-between py-2 text-sm">
            <span>{t(label)}</span>
            <span className="flex gap-1" dir="ltr">
              {k.split(" ").map((p) => (
                <Kbd key={p}>{p}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
