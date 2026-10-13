import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Select } from "@/components/common/Select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useDialogDismissGuard } from "@/hooks/useDialogDismissGuard";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TextField } from "@/components/ui/text-field";
import { parseApiError } from "@/utils/apiError";

import { useCreateMenu, useUpdateMenu } from "../hooks/useCmsMenus";
import {
  makeMenuSlotSchema,
  menuSlotDefaults,
  type MenuSlotFormValues,
} from "../schemas/menu";
import type { MenuSlot } from "../services/menus.service";

// Common navigation slots offered in the location picker. `location` is
// free-form on the backend (UNIQUE), so edit mode keeps a legacy/custom value
// selectable (see locationOptions) rather than dropping it.
const MENU_LOCATIONS = ["header", "footer", "sidebar"] as const;

// Create/edit dialog for a menu slot. `slot` present = edit, absent = create.
// `location` is UNIQUE — a 409 conflict maps inline onto the location field.
export function CreateMenuDialog({
  open,
  onOpenChange,
  slot,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot?: MenuSlot | null;
  /** Called with the freshly created slot so the builder can select it. */
  onCreated?: (slot: MenuSlot) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateMenu();
  const update = useUpdateMenu();
  const isEdit = !!slot;

  const locationOptions = useMemo(() => {
    const base = MENU_LOCATIONS.map((k) => ({
      value: k as string,
      label: t(`cms.menus.field.location_opt.${k}`),
    }));
    // Keep an existing non-preset location (legacy/custom) selectable.
    const cur = slot?.location;
    if (cur && !MENU_LOCATIONS.some((k) => k === cur)) {
      base.push({ value: cur, label: cur });
    }
    return base;
  }, [t, slot]);

  const form = useForm<MenuSlotFormValues>({
    resolver: zodResolver(makeMenuSlotSchema(t)),
    defaultValues: menuSlotDefaults,
    mode: "onTouched",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      slot ? { name: slot.name, location: slot.location } : menuSlotDefaults,
    );
  }, [open, slot, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const body = { name: values.name.trim(), location: values.location.trim() };
    try {
      if (isEdit && slot) {
        await update.mutateAsync({ id: slot.id, body });
        toast.success(t("cms.menus.toast.update_success"));
      } else {
        const created = await create.mutateAsync(body);
        toast.success(t("cms.menus.toast.create_success"));
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      const { message, key, fieldErrors } = parseApiError(err, t);
      if (fieldErrors.name)
        form.setError("name", { message: fieldErrors.name });
      if (fieldErrors.location)
        form.setError("location", { message: fieldErrors.location });
      else if (key === "conflict")
        form.setError("location", { message: t("errors.conflict") });
      toast.error(message);
    }
  });

  const saving = create.isPending || update.isPending;

  const { dialogProps, confirmProps } = useDialogDismissGuard({
    when: form.formState.isDirty,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("cms.menus.dialog.edit_title")
              : t("cms.menus.dialog.new_title")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("cms.menus.field.name")}</FormLabel>
                  <FormControl>
                    <TextField maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel required>
                    {t("cms.menus.field.location")}
                  </FormLabel>
                  <Select
                    inputId="cms-menu-location"
                    options={locationOptions}
                    value={
                      locationOptions.find((o) => o.value === field.value) ??
                      null
                    }
                    placeholder={t("cms.menus.field.location_ph")}
                    invalid={!!fieldState.error}
                    isClearable={false}
                    onChange={(o) => field.onChange(o?.value ?? "")}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="!mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                <X className="size-4" />
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={saving}>
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
