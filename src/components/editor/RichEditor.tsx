import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { useTranslation } from "react-i18next";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  SquareCode,
  Table as TableIcon,
  Link2,
  Minus,
  Undo2,
  Redo2,
  Rows3,
  Columns3,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Tip } from "@/components/ui/controls";
import { openApi } from "@/platform/tauri";
import { promptText } from "@/app/confirm";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/cn";
import { docToText, parseDoc, type RtNode } from "@/core/utils/richtext";

export const lowlight = createLowlight(common);

export const CODE_LANGUAGES = ["plaintext", "bash", "powershell", "python", "javascript", "typescript", "c", "cpp", "java", "csharp", "go", "rust", "sql", "json", "yaml", "xml", "ini", "php", "x86asm", "shell"];

export function editorExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], HTMLAttributes: { rel: "noopener noreferrer", target: null } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
    Placeholder.configure({ placeholder }),
  ];
}

export interface RichEditorHandle {
  editor: Editor | null;
}

export function RichEditor({
  content,
  onChange,
  placeholder,
  editable = true,
  className,
  autoFocus,
  minimal,
}: {
  content: string | null;
  onChange?: (json: string, text: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  autoFocus?: boolean;
  minimal?: boolean;
}) {
  const { t } = useTranslation();
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    extensions: editorExtensions(placeholder ?? t("editor.placeholder")),
    content: (parseDoc(content) as object | null) ?? content ?? "",
    editable,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "prose-editor", dir: "auto", spellcheck: "true" },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest("a");
        if (a && (event.ctrlKey || event.metaKey)) {
          const href = a.getAttribute("href");
          if (href) openApi.url(href).catch((e) => toast.error(errorMessage(e)));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      onChangeRef.current?.(JSON.stringify(json), docToText(json as RtNode).trim());
    },
  });

  React.useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {editable && editor && !minimal && <Toolbar editor={editor} />}
      {editable && editor && minimal && <Toolbar editor={editor} compact />}
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  );
}

function TB({ active, onClick, label, children, disabled }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Tip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn("flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30 [&_svg]:size-4", active && "bg-accent/15 text-accent")}
      >
        {children}
      </button>
    </Tip>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-border" />;

function Toolbar({ editor, compact }: { editor: Editor; compact?: boolean }) {
  const { t } = useTranslation();
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    editor.on("transaction", force);
    return () => {
      editor.off("transaction", force);
    };
  }, [editor]);
  const c = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  const setLink = async () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = await promptText({ title: t("editor.link"), label: t("editor.linkPrompt"), initial: prev ?? "https://", confirmLabel: t("common.save") });
    if (url === null) return;
    if (!url.trim()) return void c().extendMarkRange("link").unsetLink().run();
    const href = /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    c().extendMarkRange("link").setLink({ href }).run();
  };
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-bg/95 px-2 py-1 backdrop-blur">
      {!compact && (
        <>
          <TB label={t("editor.h1")} active={editor.isActive("heading", { level: 1 })} onClick={() => c().toggleHeading({ level: 1 }).run()}><Heading1 /></TB>
          <TB label={t("editor.h2")} active={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 /></TB>
          <TB label={t("editor.h3")} active={editor.isActive("heading", { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 /></TB>
          <Sep />
        </>
      )}
      <TB label={t("editor.bold")} active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}><Bold /></TB>
      <TB label={t("editor.italic")} active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}><Italic /></TB>
      <TB label={t("editor.underline")} active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}><Underline /></TB>
      <TB label={t("editor.strike")} active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}><Strikethrough /></TB>
      <TB label={t("editor.inlineCode")} active={editor.isActive("code")} onClick={() => c().toggleCode().run()}><Code /></TB>
      <TB label={t("editor.link")} active={editor.isActive("link")} onClick={() => void setLink()}><Link2 /></TB>
      <Sep />
      <TB label={t("editor.bulletList")} active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><List /></TB>
      <TB label={t("editor.orderedList")} active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><ListOrdered /></TB>
      <TB label={t("editor.checklist")} active={editor.isActive("taskList")} onClick={() => c().toggleTaskList().run()}><ListChecks /></TB>
      <TB label={t("editor.quote")} active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}><Quote /></TB>
      <TB label={t("editor.codeBlock")} active={editor.isActive("codeBlock")} onClick={() => c().toggleCodeBlock().run()}><SquareCode /></TB>
      {editor.isActive("codeBlock") && (
        <select
          aria-label={t("editor.language")}
          className="ms-1 h-7 rounded-md border border-border bg-sunken px-1 text-xs ltr"
          value={(editor.getAttributes("codeBlock").language as string) ?? "plaintext"}
          onChange={(e) => c().updateAttributes("codeBlock", { language: e.target.value }).run()}
        >
          {CODE_LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      )}
      {!compact && (
        <>
          <TB label={t("editor.divider")} onClick={() => c().setHorizontalRule().run()}><Minus /></TB>
          <Sep />
          <TB label={t("editor.table")} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon /></TB>
          {inTable && (
            <>
              <TB label={t("editor.addRow")} onClick={() => c().addRowAfter().run()}><Rows3 /></TB>
              <TB label={t("editor.addColumn")} onClick={() => c().addColumnAfter().run()}><Columns3 /></TB>
              <TB label={t("editor.deleteTable")} onClick={() => c().deleteTable().run()}><Trash2 /></TB>
            </>
          )}
        </>
      )}
      <span className="flex-1" />
      <TB label={t("editor.undo")} disabled={!editor.can().undo()} onClick={() => c().undo().run()}><Undo2 className="rtl:-scale-x-100" /></TB>
      <TB label={t("editor.redo")} disabled={!editor.can().redo()} onClick={() => c().redo().run()}><Redo2 className="rtl:-scale-x-100" /></TB>
    </div>
  );
}

/** Read-only renderer for stored documents. */
export function RichView({ content, className }: { content: string | null; className?: string }) {
  return <RichEditor content={content} editable={false} className={className} />;
}
