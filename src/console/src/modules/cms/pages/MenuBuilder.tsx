import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { CreateMenuDialog } from "../components/CreateMenuDialog";
import { MenuBuilderPane } from "../components/MenuBuilderPane";
import { MenuSlotPane } from "../components/MenuSlotPane";
import {
  useDeleteMenu,
  useMenu,
  useMenus,
  useReplaceMenuItems,
} from "../hooks/useCmsMenus";
import { useMenuDraft } from "../hooks/useMenuDraft";
import type { MenuSlot } from "../services/menus.service";
import { toItemsInput } from "../utils/menuTree";

export default function MenuBuilder() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("cms.menu.manage");

  const menus = useMenus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useMenu(selectedId ?? undefined);

  const draft = useMenuDraft(detail.data);
  const del = useDeleteMenu();
  const save = useReplaceMenuItems();

  // Slot dialog (create/edit) + delete confirmations + dirty-switch guard.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<MenuSlot | null>(null);
  const [deleteSlot, setDeleteSlot] = useState<MenuSlot | null>(null);
  const [deleteItemKey, setDeleteItemKey] = useState<string | null>(null);
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);

  // Warn on tab close / reload while the tree has unsaved edits.
  useEffect(() => {
    if (!draft.dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft.dirty]);

  function selectSlot(id: string) {
    if (id === selectedId) return;
    if (draft.dirty) setPendingSelect(id);
    else setSelectedId(id);
  }
  function confirmDiscardSwitch() {
    if (pendingSelect) setSelectedId(pendingSelect);
    setPendingSelect(null);
  }

  function openCreate() {
    setEditSlot(null);
    setDialogOpen(true);
  }
  function openEditSlot(slot: MenuSlot) {
    setEditSlot(slot);
    setDialogOpen(true);
  }

  async function handleDeleteSlot() {
    if (!deleteSlot) return;
    try {
      await del.mutateAsync(deleteSlot.id);
      toast.success(t("cms.menus.toast.delete_success"));
      if (deleteSlot.id === selectedId) setSelectedId(null);
      setDeleteSlot(null);
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  async function handleSave() {
    if (!selectedId) return;
    try {
      const res = await save.mutateAsync({
        id: selectedId,
        body: { items: toItemsInput(draft.draft) },
      });
      draft.rebase(res.items);
      toast.success(t("cms.menus.toast.items_saved"));
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  const isNotFound = parseApiError(detail.error, t).key === "not_found";

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("cms.menus.title")}
        subtitle={t("cms.menus.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_menus" }]}
      />

      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        <MenuSlotPane
          slots={menus.data ?? []}
          isLoading={menus.isLoading && !menus.data}
          isError={menus.isError}
          errorMessage={parseApiError(menus.error, t).message}
          selectedId={selectedId}
          canManage={canManage}
          onSelect={selectSlot}
          onCreate={openCreate}
          onEditSlot={openEditSlot}
          onDeleteSlot={setDeleteSlot}
        />

        <div className="space-y-4">
          {!selectedId ? (
            <EmptyState
              title={t("cms.menus.placeholder_title")}
              description={t("cms.menus.placeholder_desc")}
            />
          ) : detail.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : detail.isError ? (
            <Alert
              variant="danger"
              message={
                isNotFound
                  ? t("errors.not_found")
                  : parseApiError(detail.error, t).message
              }
            />
          ) : (
            <MenuBuilderPane
              draft={draft}
              saving={save.isPending}
              onSave={() => void handleSave()}
              onDeleteItem={setDeleteItemKey}
            />
          )}
        </div>
      </div>

      <CreateMenuDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        slot={editSlot}
        onCreated={(slot) => setSelectedId(slot.id)}
      />

      <ConfirmDialog
        open={!!deleteSlot}
        onOpenChange={(open) => !open && setDeleteSlot(null)}
        title={t("cms.menus.dialog.delete.title")}
        description={t("cms.menus.dialog.delete.description")}
        confirmLabel={t("common.delete")}
        confirmIcon={Trash2}
        destructive
        loading={del.isPending}
        onConfirm={() => void handleDeleteSlot()}
      />

      <ConfirmDialog
        open={!!deleteItemKey}
        onOpenChange={(open) => !open && setDeleteItemKey(null)}
        title={t("cms.menus.dialog.delete_item.title")}
        description={t("cms.menus.dialog.delete_item.description")}
        confirmLabel={t("common.delete")}
        confirmIcon={Trash2}
        destructive
        onConfirm={() => {
          if (deleteItemKey) draft.deleteItem(deleteItemKey);
          setDeleteItemKey(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingSelect}
        onOpenChange={(open) => !open && setPendingSelect(null)}
        title={t("cms.menus.dialog.discard.title")}
        description={t("cms.menus.dialog.discard.description")}
        confirmLabel={t("cms.menus.dialog.discard.confirm")}
        onConfirm={confirmDiscardSwitch}
      />
    </div>
  );
}
