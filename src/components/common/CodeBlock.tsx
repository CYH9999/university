import * as React from "react";
import { Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { lowlight } from "@/components/editor/RichEditor";
import { cn } from "@/lib/cn";

type HastNode = { type: string; value?: string; tagName?: string; properties?: { className?: string[] }; children?: HastNode[] };

function render(nodes: HastNode[] | undefined, key = "n"): React.ReactNode {
  return (nodes ?? []).map((n, i) => {
    if (n.type === "text") return n.value;
    if (n.type === "element") return <span key={`${key}-${i}`} className={(n.properties?.className ?? []).join(" ")}>{render(n.children, `${key}-${i}`)}</span>;
    return null;
  });
}

/** Read-only, syntax-highlighted code. It can be copied but is never executed by the app. */
export function CodeBlock({ code, language = "bash", className, compact }: { code: string; language?: string; className?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);
  const tree = React.useMemo(() => {
    try {
      return lowlight.registered(language) ? lowlight.highlight(language, code) : lowlight.highlightAuto(code);
    } catch {
      return null;
    }
  }, [code, language]);
  return (
    <div className={cn("group relative", className)}>
      <pre className={cn("overflow-x-auto rounded-md border border-border bg-sunken font-mono text-xs leading-relaxed", compact ? "px-3 py-2" : "p-3")} dir="ltr">
        <code>{tree ? render(tree.children as HastNode[]) : code}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="absolute end-1.5 top-1.5 rounded border border-border bg-elev p-1 text-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
        aria-label={t("common.copy")}
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
