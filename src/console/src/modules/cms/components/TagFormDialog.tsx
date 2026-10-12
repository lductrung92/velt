import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { parseApiError } from "@/utils/apiError";

import { useCmsSettings } from "../hooks/useCmsSettings";
import { useCreateTag, useUpdateTag } from "../hooks/useCmsTags";
import {
  makeTagSchema,
  tagFormDefaults,
  type TagFormValues,
} from "../schemas/tag";
import type {
  CreateTagBody,
  Tag,
  UpdateTagBody,
} from "../services/tags.service";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Create/edit dialog for a tag. `tag` present = edit, absent = create. Slug is
// optional — blank lets the backend derive it from the name.
export function TagFormDialog({
  open,
  onOpenChange,
  tag,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: Tag | null;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>
            {tag
              ? t("cms.tags.dialog.edit_title")
              : t("cms.tags.dialog.new_title")}
          </DialogTitle>
        </DialogHeader>
        {/* One dialog serves every row of the list, so the form is keyed by the
            record it edits: both the fields and the translation drafts belong to
            one tag and must not survive into the next one. */}
        <TagForm key={tag?.id ?? "new"} tag={tag} onDone={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function TagForm({
  tag,
  onDone,
}: {
  tag?: Tag | null;
  onDone: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateTag();
  const update = useUpdateTag();
  const isEdit = !!tag;

  // The slug field follows the CMS "allow manual slug editing" flag: when it's
  // off, slugs are auto-derived from the name and the input is hidden. Defaults
  // to shown if the flag is unavailable.
  const { data: settings } = useCmsSettings(true);
  const slugFlag = settings?.cms?.find(
    (e) => e.key === "cms.article.allow_slug_edit",
  );
  const allowSlugEdit = slugFlag ? Boolean(slugFlag.value) : true;

  // Manual-edit OFF + edit mode: offer "regenerate slug from name" (business-rules
  // §1). In ON mode the user edits the slug field directly, so no checkbox.
  const [regenerate, setRegenerate] = useState(false);

  const form = useForm<TagFormValues>({
    resolver: zodResolver(makeTagSchema(t)),
    defaultValues: tag ? { name: tag.name, slug: tag.slug } : tagFormDefaults,
    mode: "onChange",
  });

  /*
   * A dialog this size has no room for the editor screens' tab strip, and a tag
   * has exactly one translatable field — so the other languages appear as one
   * more box in the same column, with a small switch picking which language it
   * holds. One field at a time keeps the dialog two fields tall whatever the
   * site is configured with, and the switch says which language is in the box
   * without a second set of labels.
   */
  const tr = useEntityTranslation("tag", tag?.id);
  const others = tr.tabs.filter((l) => l !== tr.baseLocale);
  const first = others[0];
  const { isBase, setLocale } = tr;
  useEffect(() => {
    // The source-language name is the field above, so the switch opens on the
    // first language that is not it.
    if (first && isBase) setLocale(first);
  }, [first, isBase, setLocale]);

  const onSubmit = form.handleSubmit(async (values) => {
    const name = values.name.trim();
    try {
      if (isEdit && tag) {
        const body: UpdateTagBody = { name };
        if (allowSlugEdit) body.slug = values.slug.trim() || undefined;
        else if (regenerate) body.regenerate_slug = true;
        // Translations first, so one Save stores both halves of the record and
        // the re-read below reports what the server now holds.
        await tr.flush(tag.id);
        await update.mutateAsync({ id: tag.id, body });
        await tr.refresh();
        toast.success(t("cms.tags.toast.update_success"));
      } else {
        const body: CreateTagBody = { name };
        if (allowSlugEdit) body.slug = values.slug.trim() || undefined;
        await create.mutateAsync(body);
        toast.success(t("cms.tags.toast.create_success"));
      }
      onDone(false);
    } catch (err) {
      const { message, key, fieldErrors } = parseApiError(err, t);
      if (fieldErrors.name)
        form.setError("name", { message: fieldErrors.name });
      if (fieldErrors.slug)
        form.setError("slug", { message: fieldErrors.slug });
      // slug_already_exists is a top-level key (not a field error) but is about
      // the slug → surface it inline on the slug field so the user knows what to fix.
      else if (key === "slug_already_exists")
        form.setError("slug", { message });
      toast.error(message);
    }
  });

  const saving = create.isPending || update.isPending;
  // Nothing to translate before the tag exists: the record has no id to store a
  // translation against.
  const showTranslations = tr.enabled && isEdit && others.length > 0;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("cms.tags.col.name")}</FormLabel>
              <FormControl>
                <TextField maxLength={80} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {showTranslations && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="tag-tr-name">
                {t("cms.tags.translate.heading")}
              </Label>
              <div
                className="flex gap-1"
                role="group"
                aria-label={t("tr.tabs")}
              >
                {others.map((loc) => (
                  <Button
                    key={loc}
                    type="button"
                    size="sm"
                    variant={loc === tr.locale ? "secondary" : "ghost"}
                    aria-pressed={loc === tr.locale}
                    onClick={() => tr.setLocale(loc)}
                  >
                    {loc.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <TextField
              id="tag-tr-name"
              maxLength={80}
              value={str(tr.values.name)}
              onChange={(e) => tr.setField("name", e.target.value)}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("cms.tags.translate.hint")}
            </p>
          </div>
        )}
        {allowSlugEdit && (
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("cms.tags.col.slug")}</FormLabel>
                <FormControl>
                  <Input
                    maxLength={80}
                    placeholder={t("cms.tags.placeholder.slug")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {!allowSlugEdit && isEdit && (
          <Checkbox
            id="tag-regenerate-slug"
            label={t("cms.tags.regenerate_slug")}
            checked={regenerate}
            onChange={(e) => setRegenerate(e.target.checked)}
          />
        )}
        <DialogFooter className="!mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onDone(false)}
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
  );
}
