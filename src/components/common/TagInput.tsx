import * as React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { cn } from "@/lib/cn";

export function TagInput({ value, onChange, placeholder, suggestionsKey = "tags" }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestionsKey?: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data: all = [] } = useQ(["tag-names", suggestionsKey], () => s.tags.names());
  const [text, setText] = React.useState("");
  const listId = React.useId();
  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag) return;
    if (!value.some((v) => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag].slice(0, 30));
    setText("");
  };
  return (
    <div className="input-base flex h-auto min-h-9 flex-wrap items-center gap-1 py-1">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-accent/12 px-1.5 py-0.5 text-xs text-accent">
          #{tag}
          <button type="button" aria-label={t("common.remove")} onClick={() => onChange(value.filter((v) => v !== tag))} className="opacity-70 hover:opacity-100">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === "،") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
        placeholder={value.length ? "" : placeholder ?? t("common.addTags")}
        className={cn("min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle")}
      />
      <datalist id={listId}>
        {all.filter((n) => !value.includes(n)).slice(0, 50).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}

export function ListInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const { t } = useTranslation();
  const [text, setText] = React.useState("");
  const add = () => {
    const v = text.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText("");
  };
  return (
    <div className="input-base flex h-auto min-h-9 flex-wrap items-center gap-1 py-1">
      {value.map((item) => (
        <span key={item} className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
          {item}
          <button type="button" aria-label={t("common.remove")} onClick={() => onChange(value.filter((v) => v !== item))} className="text-muted hover:text-fg">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={placeholder ?? t("common.typeAndEnter")}
        className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
      />
    </div>
  );
}
