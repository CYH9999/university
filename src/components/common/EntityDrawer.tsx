/**
 * Create/edit drawer used by most modules: validated form, unsaved-changes warning,
 * delete with confirmation and undo.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { RecordForm, type FieldDef } from "./RecordForm";
import { confirm, type ConfirmOptions } from "@/app/confirm";
import { fieldErrors, errorMessage } from "@/lib/errors";
import { invalidateAll } from "@/app/query";
import { Kbd } from "@/components/ui/controls";

export interface EditorState<T> {
  open: boolean;
  entity: T | null;
  defaults: Partial<T>;
}

export function useEditor<T>() {
  const [state, setState] = React.useState<EditorState<T>>({ open: false, entity: null, defaults: {} });
  return {
    ...state,
    create: (defaults: Partial<T> = {}) => setState({ open: true, entity: null, defaults }),
    edit: (entity: T) => setState({ open: true, entity, defaults: {} }),
    close: () => setState((s) => ({ ...s, open: false })),
  };
}

export function EntityDrawer<T extends { id: string }>({
  editor,
  title,
  fields,
  onSave,
  onDelete,
  onRestore,
  children,
  width,
  deleteLabel,
  initial,
  footerExtra,
  resetKey,
  deleteConfirm,
}: {
  editor: ReturnType<typeof useEditor<T>>;
  title: { create: string; edit: string };
  fields: (FieldDef | false | null | undefined)[] | ((draft: Record<string, unknown>) => (FieldDef | false | null | undefined)[]);
  onSave: (draft: Record<string, unknown>, entity: T | null) => Promise<T | void>;
  onDelete?: (entity: T) => Promise<T | void>;
  onRestore?: (snapshot: T) => Promise<unknown>;
  children?: (entity: T | null, draft: Record<string, unknown>) => React.ReactNode;
  width?: string;
  deleteLabel?: string;
  initial?: (entity: T | null, defaults: Partial<T>) => Record<string, unknown>;
  footerExtra?: (entity: T | null) => React.ReactNode;
  /** Re-initializes the (untouched) form when this value changes, e.g. after related data loads. */
  resetKey?: unknown;
  /** Overrides the delete confirmation (e.g. to explain cascading deletes). */
  deleteConfirm?: (entity: T) => Partial<ConfirmOptions>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!editor.open) return;
    const base = initial ? initial(editor.entity, editor.defaults) : { ...(editor.defaults as object), ...((editor.entity ?? {}) as object) };
    setDraft(base as Record<string, unknown>);
    setErrors({});
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.open, editor.entity]);

  React.useEffect(() => {
    if (!editor.open || dirty || resetKey === undefined) return;
    const base = initial ? initial(editor.entity, editor.defaults) : { ...(editor.defaults as object), ...((editor.entity ?? {}) as object) };
    setDraft(base as Record<string, unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const requestClose = async () => {
    if (dirty && !(await confirm({ title: t("confirm.discardTitle"), description: t("confirm.discardBody"), confirmLabel: t("common.discard"), danger: true }))) return;
    editor.close();
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft, editor.entity);
      await invalidateAll();
      toast.success(t(editor.entity ? "toast.saved" : "toast.created"));
      setDirty(false);
      editor.close();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(fe);
      if (!Object.keys(fe).length) toast.error(errorMessage(e));
      else toast.error(t("validation.fixErrors"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editor.entity || !onDelete) return;
    const extra = deleteConfirm?.(editor.entity) ?? {};
    if (!(await confirm({ title: t("confirm.deleteTitle"), description: t("confirm.deleteBody"), confirmLabel: deleteLabel ?? t("common.delete"), danger: true, ...extra }))) return;
    try {
      const snapshot = await onDelete(editor.entity);
      await invalidateAll();
      editor.close();
      if (onRestore && snapshot) {
        toast.success(t("toast.deleted"), {
          action: { label: t("common.undo"), onClick: () => void onRestore(snapshot).then(invalidateAll).catch((e) => toast.error(errorMessage(e))) },
          duration: 8000,
        });
      } else toast.success(t("toast.deleted"));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const fieldList = typeof fields === "function" ? fields(draft) : fields;

  return (
    <Drawer
      open={editor.open}
      onOpenChange={(o) => (o ? undefined : void requestClose())}
      title={editor.entity ? t(title.edit) : t(title.create)}
      width={width}
      footer={
        <>
          {editor.entity && onDelete && (
            <Button variant="danger-ghost" className="me-auto" onClick={remove}>
              <Trash2 />
              {deleteLabel ?? t("common.delete")}
            </Button>
          )}
          {footerExtra?.(editor.entity)}
          <Button variant="ghost" onClick={() => void requestClose()}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t("common.save")} <Kbd>Ctrl+S</Kbd>
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            void save();
          }
        }}
      >
        <RecordForm
          fields={fieldList}
          value={draft}
          errors={errors}
          onChange={(patch) => {
            setDraft((d) => ({ ...d, ...patch }));
            setDirty(true);
          }}
        />
        {children && <div className="mt-6">{children(editor.entity, draft)}</div>}
        <button type="submit" className="hidden" />
      </form>
    </Drawer>
  );
}
