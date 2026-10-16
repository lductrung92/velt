import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Save, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ModalHeader } from "@/components/common/ModalHeader";
import { Select } from "@/components/common/Select/Select";
import { Button } from "@/components/ui/button";
import { useDialogDismissGuard } from "@/hooks/useDialogDismissGuard";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";

import {
  isEntityLink,
  makeMenuItemSchema,
  menuItemDefaults,
  type MenuItemFormValues,
} from "../schemas/menu";
import { MENU_LINK_TYPES, type MenuLinkType } from "../services/menus.service";
import type { MenuItemDraft } from "../utils/menuTree";
import { TargetPicker } from "./TargetPicker";

// A translated value arrives as unknown JSON; anything but a string is absent.
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Menu-item editor DIALOG (docs/styles/console/modal.md §3). Edits are applied
// to the local draft tree — there is no per-item endpoint. `node` present =
// edit, null = add. The caller controls `open` (draft.editing) and closes on
// cancel/apply.
export function ItemFormDialog({
  open,
  node,
  onApply,
  onCancel,
}: {
  open: boolean;
  node: MenuItemDraft | null;
  onApply: (
    values: MenuItemFormValues,
    translations?: Record<string, Record<string, unknown>>,
  ) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<MenuItemFormValues>({
    resolver: zodResolver(makeMenuItemSchema(t)),
    defaultValues: menuItemDefaults,
    mode: "onTouched",
  });

  // Re-hydrate when the dialog opens or the selected node changes.
  useEffect(() => {
    if (!open) return;
    form.reset(
      node
        ? {
            label: node.label,
            description: node.description ?? "",
            link_type: node.link_type,
            url: node.url ?? "",
            target_id: node.target_id,
            open_new_tab: node.open_new_tab,
          }
        : menuItemDefaults,
    );
  }, [open, node, form]);

  const linkType = form.watch("link_type");

  function changeLinkType(next: MenuLinkType) {
    form.setValue("link_type", next, { shouldDirty: true });
    // Wipe the field that no longer applies (dependent-select wipe).
    if (isEntityLink(next)) form.setValue("url", "");
    else form.setValue("target_id", null);
    form.clearErrors(["url", "target_id"]);
  }

  /*
   * The other languages of this link.
   *
   * A translation is stored against the item's id, and an item added in this
   * session has none until the menu is saved — so for a new item the boxes are
   * still offered and what is typed goes back to the caller, which writes it
   * once the save hands out ids. Waiting until the item existed meant the
   * person had to find it again to finish the job they were already doing.
   */
  const itemId = node && !node.key.startsWith("tmp-") ? node.key : undefined;
  const tr = useEntityTranslation("menu_item", itemId);
  const others = tr.tabs.filter((locale) => locale !== tr.baseLocale);
  const showTranslations = tr.enabled && others.length > 0;
  const { isBase, setLocale } = tr;
  const first = others[0];
  useEffect(() => {
    // The source-language fields are the ones above, so the switch opens on a
    // language that is not them.
    if (first && isBase) setLocale(first);
  }, [first, isBase, setLocale]);

  const onSubmit = form.handleSubmit(async (values) => {
    // An existing item has its own endpoint, so its translation is stored now;
    // a new one has no address yet and travels with the values instead.
    if (itemId) {
      await tr.flush(itemId);
      onApply(values);
      return;
    }
    onApply(values, tr.pending);
  });

  const linkOptions = MENU_LINK_TYPES.map((type) => ({
    value: type,
    label: t(`cms.menus.link_type.${type}`),
  }));

  // The ✕, Escape and an overlay click all arrive at onOpenChange(false);
  // none of them is a navigation, so the router's blocker cannot see them.
  const { dialogProps, confirmProps } = useDialogDismissGuard({
    when: form.formState.isDirty,
    onClose: onCancel,
  });

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent closeLabel={t("common.close")}>
        <ModalHeader
          icon={node ? Pencil : Plus}
          title={
            node
              ? t("cms.menus.item.edit_title")
              : t("cms.menus.item.new_title")
          }
          subject={node ? node.label : t("cms.menus.structure")}
        />
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("cms.menus.item.label")}</FormLabel>
                  <FormControl>
                    <TextField maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("cms.menus.item.description")}</FormLabel>
                  <FormControl>
                    <TextField maxLength={300} {...field} />
                  </FormControl>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("cms.menus.item.description_help")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="link_type"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel required>
                    {t("cms.menus.item.link_type")}
                  </FormLabel>
                  <Select
                    inputId="menu-item-link-type"
                    options={linkOptions}
                    value={
                      linkOptions.find((o) => o.value === field.value) ?? null
                    }
                    onChange={(o) =>
                      changeLinkType((o?.value ?? "internal") as MenuLinkType)
                    }
                    isClearable={false}
                    isSearchable={false}
                    invalid={!!fieldState.error}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEntityLink(linkType) ? (
              <FormField
                control={form.control}
                name="target_id"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel required>{t("cms.menus.item.target")}</FormLabel>
                    <TargetPicker
                      inputId="menu-item-target"
                      linkType={linkType}
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!fieldState.error}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("cms.menus.item.url")}</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        maxLength={2000}
                        placeholder={
                          linkType === "internal"
                            ? t("cms.menus.item.url_internal_ph")
                            : t("cms.menus.item.url_external_ph")
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="open_new_tab"
              render={({ field }) => (
                <FormItem>
                  {/* Checkbox-first row (input.md §8): box + text, w-fit hit area. */}
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span>{t("cms.menus.item.open_new_tab")}</span>
                  </label>
                </FormItem>
              )}
            />

            {showTranslations && (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="menu-item-tr-label">
                    {t("cms.menus.item.translate_heading")}
                  </Label>
                  <div
                    className="flex gap-1"
                    role="group"
                    aria-label={t("tr.tabs")}
                  >
                    {others.map((locale) => (
                      <Button
                        key={locale}
                        type="button"
                        size="sm"
                        variant={locale === tr.locale ? "secondary" : "ghost"}
                        aria-pressed={locale === tr.locale}
                        onClick={() => tr.setLocale(locale)}
                      >
                        {locale.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* The field's name is a label here, not a placeholder: a
                    placeholder leaves as soon as somebody types, so a box that
                    had been translated no longer said what it was. The
                    Vietnamese it falls back to is the placeholder instead. */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="menu-item-tr-label"
                    className="text-xs font-medium"
                  >
                    {t("cms.menus.item.label")}
                  </Label>
                  <TextField
                    id="menu-item-tr-label"
                    maxLength={200}
                    placeholder={form.watch("label")}
                    value={text(tr.values.label)}
                    onChange={(e) => tr.setField("label", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="menu-item-tr-description"
                    className="text-xs font-medium"
                  >
                    {t("cms.menus.item.description")}
                  </Label>
                  <TextField
                    id="menu-item-tr-description"
                    maxLength={300}
                    placeholder={form.watch("description")}
                    value={text(tr.values.description)}
                    onChange={(e) => tr.setField("description", e.target.value)}
                  />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {itemId
                    ? t("cms.menus.item.translate_hint")
                    : t("cms.menus.item.translate_hint_new")}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                <X className="size-4" />
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
      <ConfirmDialog
        {...confirmProps}
        title={t("common.unsaved.close_title")}
        description={t("common.unsaved.close_hint")}
        confirmLabel={t("common.unsaved.close_confirm")}
        confirmIcon={X}
      />
    </Dialog>
  );
}
