/**
 * Converters for the rich-text document format (ProseMirror/TipTap JSON) used by notes and
 * write-ups. Pure functions so exports work the same on desktop and mobile.
 */
export interface RtNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RtNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export function parseDoc(content: string | null | undefined): RtNode | null {
  if (!content) return null;
  try {
    const d = JSON.parse(content) as RtNode;
    return d && typeof d === "object" && d.type ? d : null;
  } catch {
    return null;
  }
}

/** Plain text of a document (used for search indexing and word counts). */
export function docToText(node: RtNode | null): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(docToText);
  const block = ["paragraph", "heading", "codeBlock", "blockquote", "listItem", "taskItem", "tableRow", "horizontalRule"].includes(node.type);
  if (node.type === "tableRow") return inner.join(" | ") + "\n";
  return inner.join(block || node.type === "doc" ? "" : "") + (block ? "\n" : "");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  return /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null;
}

function marksToMd(text: string, marks: RtNode["marks"]): string {
  let out = text;
  for (const m of marks ?? []) {
    if (m.type === "code") out = `\`${out}\``;
    else if (m.type === "bold") out = `**${out}**`;
    else if (m.type === "italic") out = `*${out}*`;
    else if (m.type === "strike") out = `~~${out}~~`;
    else if (m.type === "link") {
      const href = safeHref(m.attrs?.href);
      if (href) out = `[${out}](${href})`;
    }
  }
  return out;
}

function inlineMd(nodes: RtNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => (n.type === "text" ? marksToMd(n.text ?? "", n.marks) : n.type === "hardBreak" ? "  \n" : inlineMd(n.content)))
    .join("");
}

export function docToMarkdown(node: RtNode | null, depth = 0): string {
  if (!node) return "";
  const indent = "  ".repeat(depth);
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map((n) => docToMarkdown(n, depth)).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    case "paragraph":
      return `${inlineMd(node.content)}\n`;
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inlineMd(node.content)}\n`;
    case "blockquote":
      return (node.content ?? []).map((n) => docToMarkdown(n, depth)).join("").split("\n").filter(Boolean).map((l) => `> ${l}`).join("\n") + "\n";
    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      return "```" + lang + "\n" + (node.content ?? []).map((n) => n.text ?? "").join("") + "\n```\n";
    }
    case "horizontalRule":
      return "---\n";
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? [])
        .map((item, i) => {
          const bullet =
            node.type === "orderedList" ? `${i + 1}.` : node.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}]` : "-";
          const [first, ...rest] = item.content ?? [];
          const firstLine = first ? inlineMd(first.content) : "";
          const nested = rest.map((r) => docToMarkdown(r, depth + 1)).join("");
          return `${indent}${bullet} ${firstLine}\n${nested}`;
        })
        .join("");
    case "table": {
      const rows = (node.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((p) => inlineMd(p.content)).join(" ").replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return [line(rows[0]), `|${Array.from({ length: width }, () => " --- ").join("|")}|`, ...rows.slice(1).map(line)].join("\n") + "\n";
    }
    default:
      return inlineMd(node.content) + "\n";
  }
}

function marksToHtml(text: string, marks: RtNode["marks"]): string {
  let out = esc(text);
  for (const m of marks ?? []) {
    if (m.type === "bold") out = `<strong>${out}</strong>`;
    else if (m.type === "italic") out = `<em>${out}</em>`;
    else if (m.type === "strike") out = `<s>${out}</s>`;
    else if (m.type === "underline") out = `<u>${out}</u>`;
    else if (m.type === "code") out = `<code>${out}</code>`;
    else if (m.type === "highlight") out = `<mark>${out}</mark>`;
    else if (m.type === "link") {
      const href = safeHref(m.attrs?.href);
      if (href) out = `<a href="${esc(href)}">${out}</a>`;
    }
  }
  return out;
}

export function docToHtml(node: RtNode | null): string {
  if (!node) return "";
  const inner = () => (node.content ?? []).map(docToHtml).join("");
  switch (node.type) {
    case "doc":
      return inner();
    case "text":
      return marksToHtml(node.text ?? "", node.marks);
    case "hardBreak":
      return "<br>";
    case "paragraph":
      return `<p>${inner()}</p>`;
    case "heading": {
      const l = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `<h${l}>${inner()}</h${l}>`;
    }
    case "blockquote":
      return `<blockquote>${inner()}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${esc((node.content ?? []).map((n) => n.text ?? "").join(""))}</code></pre>`;
    case "horizontalRule":
      return "<hr>";
    case "bulletList":
      return `<ul>${inner()}</ul>`;
    case "orderedList":
      return `<ol>${inner()}</ol>`;
    case "listItem":
      return `<li>${inner()}</li>`;
    case "taskList":
      return `<ul class="tasks">${inner()}</ul>`;
    case "taskItem":
      return `<li><input type="checkbox" disabled${node.attrs?.checked ? " checked" : ""}> ${inner()}</li>`;
    case "table":
      return `<table>${inner()}</table>`;
    case "tableRow":
      return `<tr>${inner()}</tr>`;
    case "tableHeader":
      return `<th>${inner()}</th>`;
    case "tableCell":
      return `<td>${inner()}</td>`;
    default:
      return inner();
  }
}

/** A standalone, offline HTML document (no external resources). */
export function htmlDocument(title: string, bodyHtml: string, dir: "rtl" | "ltr" = "ltr"): string {
  return `<!doctype html>
<html dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1b1f24}
pre{background:#f4f6f8;padding:12px;border-radius:6px;overflow:auto;direction:ltr;text-align:left}
code{font-family:Consolas,monospace;background:#f4f6f8;padding:1px 4px;border-radius:4px}
table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:6px 10px}
blockquote{border-inline-start:3px solid #99a;margin:0;padding-inline-start:12px;color:#445}
ul.tasks{list-style:none;padding-inline-start:4px}
</style></head><body><h1>${esc(title)}</h1>${bodyHtml}</body></html>`;
}

/** Builds a document from plain paragraphs (templates, imports). */
export function textToDoc(text: string): RtNode {
  const blocks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    type: "doc",
    content: blocks.length
      ? blocks.map((p) => {
          const h = /^(#{1,3})\s+(.*)$/.exec(p);
          if (h) return { type: "heading", attrs: { level: h[1].length }, content: [{ type: "text", text: h[2] }] };
          return { type: "paragraph", content: [{ type: "text", text: p }] };
        })
      : [{ type: "paragraph" }],
  };
}
