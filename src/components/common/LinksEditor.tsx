import * as React from "react";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { openApi } from "@/platform/tauri";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

export function LinksEditor({ value, onChange }: { value: { title: string; url: string }[]; onChange: (v: { title: string; url: string }[]) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const add = () => {
    const u = url.trim();
    if (!u) return;
    const normalized = /^(https?:|mailto:)/i.test(u) ? u : `https://${u}`;
    onChange([...value, { title: title.trim(), url: normalized }]);
    setTitle("");
    setUrl("");
  };
  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-sunken px-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{l.title || l.url}</span>
          <span className="hidden max-w-[40%] truncate font-mono text-[11px] text-subtle ltr md:block">{l.url}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => openApi.url(l.url).catch((e) => toast.error(errorMessage(e)))} aria-label={t("common.open")}>
            <ExternalLink />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t("common.remove")}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("fields.linkTitle")} className="w-1/3" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" dir="ltr" className="flex-1 font-mono text-xs" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button size="icon" onClick={add} aria-label={t("common.add")}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export function LinkList({ links }: { links: { title: string; url: string }[] }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l, i) => (
        <button key={i} type="button" onClick={() => openApi.url(l.url).catch((e) => toast.error(errorMessage(e)))} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs hover:border-accent/50 hover:text-accent">
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">{l.title || l.url}</span>
        </button>
      ))}
    </div>
  );
}
