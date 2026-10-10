import { Plus, RotateCcw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EditorActionBar } from "@/components/common/EditorActionBar/EditorActionBar";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { useMenuDraft } from "../hooks/useMenuDraft";
import { ItemFormDialog } from "./ItemFormDialog";
import { MenuItemTree } from "./MenuItemTree";

// Right side of the builder for a loaded menu: the sticky save bar (when the
// tree is dirty), the item tree, and the inline item editor. All edits go
// through the `draft` controller; persistence is the parent's `onSave`.
export function MenuBuilderPane({
  draft,
  saving,
  onSave,
  onDeleteItem,
}: {
  draft: ReturnType<typeof useMenuDraft>;
  saving: boolean;
  onSave: () => void;
  onDeleteItem: (key: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {draft.dirty && (
        <EditorActionBar>
          <Button
            type="button"
            variant="outline"
            onClick={draft.reset}
            disabled={saving}
          >
            <RotateCcw className="size-4" />
            {t("cms.menus.reset")}
          </Button>
          <Button type="button" loading={saving} onClick={onSave}>
            <Save className="size-4" />
            {t("cms.menus.save")}
          </Button>
        </EditorActionBar>
      )}

      <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t("cms.menus.structure")}</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={draft.startAdd}
              >
                <Plus className="size-4" />
                {t("common.add_new")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {draft.draft.length === 0 ? (
              <EmptyState className="py-6" />
            ) : (
              <MenuItemTree
                draft={draft.draft}
                selectedKey={
                  draft.editing?.mode === "edit" ? draft.editing.key : null
                }
                onSelect={draft.selectItem}
                onEdit={draft.selectItem}
                onDelete={onDeleteItem}
                onMove={draft.moveItem}
              />
            )}
          </CardContent>
      </Card>

      {/* Item add/edit form in a modal (modal.md §3). Apply also closes — the
          draft hook keeps `editing` set for the inline-pane flow it was built
          for, so the pane wrapper closes it explicitly. */}
      <ItemFormDialog
        open={draft.editing !== null}
        node={draft.selectedNode}
        onApply={(values) => {
          draft.applyForm(values);
          draft.cancelEdit();
        }}
        onCancel={draft.cancelEdit}
      />
    </>
  );
}
