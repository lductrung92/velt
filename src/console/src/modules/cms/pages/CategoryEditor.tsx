import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  FolderTree,
  Lock,
  Save,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { SlugField } from "@/components/common/SlugField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { parseApiError } from "@/utils/apiError";

import { LanguageTabs } from "@/modules/translation/components/LanguageTabs";
import { TranslatedField } from "@/modules/translation/components/TranslatedField";
import {
  useEntityTranslation,
  type EntityTranslation,
} from "@/modules/translation/hooks/useEntityTranslation";

import "@/styles/editor-page.css";
import { useCmsSettings } from "../hooks/useCmsSettings";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
} from "../hooks/useCmsCategories";
import {
  categoryFormDefaults,
  makeCategorySchema,
  type CategoryFormValues,
} from "../schemas/category";
import type {
  CreateCategoryBody,
  UpdateCategoryBody,
} from "../services/categories.service";
import {
  findCategory,
  flattenTree,
  getDescendantIds,
} from "../utils/categoryTree";

const BACK = "/cms/categories";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Full-page create/edit for a category, on the shared editor chrome. The
// category list isn't fetched per-id; the tree (GET /cms/categories) carries
// every node, so we resolve the edit target from it.
export default function CategoryEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const categories = useCategories();
  const tree = useMemo(() => categories.data ?? [], [categories.data]);
  const category = isEdit ? (findCategory(tree, id) ?? null) : null;

  const create = useCreateCategory();
  const update = useUpdateCategory();

  const { data: settings } = useCmsSettings(true);
  const slugFlag = settings?.cms?.find(
    (e) => e.key === "cms.article.allow_slug_edit",
  );
  const allowSlugEdit = slugFlag ? Boolean(slugFlag.value) : true;

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(makeCategorySchema(t)),
    defaultValues: categoryFormDefaults,
    // Don't surface errors until a field is touched (or on submit).
    mode: "onTouched",
  });
  // Manual-edit OFF + edit: offer "regenerate slug from name" (ON mode edits the
  // slug field directly, so no checkbox).
  const [regenerate, setRegenerate] = useState(false);
  // Translations live outside this form: their shape is locale x declared
  // field, which a static zod schema cannot describe.
  const tr = useEntityTranslation("cms_category", category?.id);

  useEffect(() => {
    if (!category) return;
    form.reset({
      ...categoryFormDefaults,
      name: category.name,
      slug: category.slug,
      parent_id: category.parent_id ?? "",
      sort_order: category.sort_order,
      description: category.description ?? "",
      seo_title: category.seo.title ?? "",
      seo_description: category.seo.description ?? "",
      seo_keywords: category.seo.keywords ?? "",
    });
    setRegenerate(false);
  }, [category, form]);

  // Parent options = the flattened tree (indented), excluding the node being
  // edited + all its descendants (choosing one would create a cycle).
  const parentOptions = useMemo(() => {
    const flat = flattenTree(tree);
    const excluded = category ? getDescendantIds(flat, category.id) : null;
    return flat
      .filter(
        (n) => !category || (n.id !== category.id && !excluded?.has(n.id)),
      )
      .map((n) => ({
        value: n.id,
        // Tree look in the dropdown: indent per depth with NBSP (plain spaces
        // collapse in HTML) + a branch glyph for child nodes.
        label: n.depth > 0 ? "   ".repeat(n.depth) + "└ " + n.name : n.name,
      }));
  }, [tree, category]);

  const onSubmit = form.handleSubmit(async (values) => {
    const seo = {
      title: values.seo_title.trim(),
      description: values.seo_description.trim(),
      keywords: values.seo_keywords.trim(),
    };
    const parentId = values.parent_id || null;
    try {
      if (isEdit && category) {
        const body: UpdateCategoryBody = {
          name: values.name.trim(),
          parent_id: parentId,
          sort_order: values.sort_order,
          description: values.description.trim(),
          seo,
          updated_at: category.updated_at,
        };
        // Only when it actually changed: sending the current slug back on every
        // save would re-run the rename path for nothing, and a slug is an
        // address people already hold.
        const nextSlug = values.slug.trim();
        if (allowSlugEdit && nextSlug && nextSlug !== category.slug) {
          body.slug = nextSlug;
        } else if (!allowSlugEdit && regenerate) {
          body.regenerate_slug = true;
        }
        // Translations first, so one Save stores both halves of the record and
        // the re-read below reports what the server now holds.
        await tr.flush(category.id);
        await update.mutateAsync({ id: category.id, body });
        await tr.refresh();
        toast.success(t("cms.categories.toast.update_success"));
      } else {
        const body: CreateCategoryBody = {
          name: values.name.trim(),
          sort_order: values.sort_order,
          description: values.description.trim(),
          seo,
        };
        if (parentId) body.parent_id = parentId;
        await create.mutateAsync(body);
        toast.success(t("cms.categories.toast.create_success"));
      }
      navigate(BACK);
    } catch (err) {
      const { message, key, fieldErrors } = parseApiError(err, t);
      if (fieldErrors.name)
        form.setError("name", { message: fieldErrors.name });
      if (fieldErrors.slug)
        form.setError("slug", { message: fieldErrors.slug });
      else if (key === "slug_already_exists")
        form.setError("slug", { message });
      toast.error(message);
    }
  });

  const saving = create.isPending || update.isPending;
  const header = (
    <PageHeader
      title={
        isEdit
          ? t("cms.categories.dialog.edit_title")
          : t("cms.categories.dialog.new_title")
      }
      breadcrumbs={[
        { labelKey: "nav.cms_categories", to: BACK },
        { label: isEdit ? (category?.name ?? "") : t("common.new") },
      ]}
    />
  );

  if (isEdit && categories.isLoading && !categories.data) {
    return (
      <div className="space-y-4">
        {header}
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (isEdit && categories.data && !category) {
    return (
      <div className="space-y-4">
        {header}
        <Alert variant="danger" message={t("errors.not_found")} />
        <Button type="button" variant="outline" onClick={() => navigate(BACK)}>
          {t("common.back")}
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        noValidate
        className="editor-page space-y-5"
        data-editor="cms-category"
      >
        {header}
        <EditorActionBar
          center={<LanguageTabs tr={tr} disabled={!isEdit} embedded />}
          left={
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(BACK)}
              disabled={saving}
            >
              <ArrowLeft className="size-4" />
              {t("common.back")}
            </Button>
          }
        >
          <Button type="submit" loading={saving}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </EditorActionBar>

        {!tr.isBase && (
          <CategoryTranslationPanel
            tr={tr}
            source={{
              name: form.watch("name"),
              description: form.watch("description"),
              seoTitle: form.watch("seo_title"),
              seoDescription: form.watch("seo_description"),
            }}
          />
        )}
        <div className="editor-grid" hidden={!tr.isBase}>
          <Card className="editor-main editor-card" id="cat-basic">
            <CardHeader className="editor-heading">
              <CardTitle>
                <FolderTree
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
                {t("cms.categories.editor.basic")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="editor-titleblock space-y-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="editor-title">
                      <FormLabel required>
                        {t("cms.categories.col.name")}
                      </FormLabel>
                      <FormControl>
                        <TextField maxLength={160} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Only after the first save: before that the server derives the
                  slug from the name, and an empty box would just invite a worse
                  answer. */}
                {isEdit && category && (
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <SlugField
                          label={t("cms.categories.editor.permalink")}
                          value={field.value}
                          original={category.slug}
                          onChange={field.onChange}
                          canEdit={allowSlugEdit}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {!allowSlugEdit && isEdit && (
                  <Checkbox
                    id="cms-category-regenerate-slug"
                    label={t("cms.categories.regenerate_slug")}
                    checked={regenerate}
                    onChange={(e) => setRegenerate(e.target.checked)}
                  />
                )}
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("cms.categories.col.description")}</FormLabel>
                    <FormControl>
                      <Textarea rows={5} maxLength={2000} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <aside
            className="editor-side space-y-4"
            aria-label={t("cms.categories.editor.settings")}
          >
            <Card className="editor-card">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <SlidersHorizontal
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("cms.categories.editor.placement")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <FormField
                  control={form.control}
                  name="parent_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.categories.col.parent")}</FormLabel>
                      <Select
                        inputId="cms-category-parent"
                        options={parentOptions}
                        value={
                          parentOptions.find((o) => o.value === field.value) ??
                          null
                        }
                        placeholder={t("cms.categories.parent_ph")}
                        onChange={(o) => field.onChange(o?.value ?? "")}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("cms.categories.col.sort_order")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </aside>

          <Card className="editor-wide editor-card" id="cat-seo">
            <CardHeader className="editor-heading">
              <CardTitle>
                <Search className="size-4 text-muted-foreground" aria-hidden />
                {t("cms.categories.seo.heading")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="editor-seo-preview">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  {t("cms.categories.editor.search_preview")}
                </p>
                <span className="text-xs font-medium text-muted-foreground">
                  {"Zukatek"}
                </span>
                <p className="mt-1 break-words text-lg font-medium text-primary">
                  {form.watch("seo_title") ||
                    form.watch("name") ||
                    t("cms.categories.editor.preview_title")}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {form.watch("seo_description") ||
                    form.watch("description") ||
                    t("cms.categories.editor.preview_description")}
                </p>
              </div>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="seo_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.categories.seo.title")}</FormLabel>
                      <FormControl>
                        <TextField maxLength={255} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="seo_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("cms.categories.seo.description")}
                      </FormLabel>
                      <FormControl>
                        <Textarea rows={3} maxLength={500} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="seo_keywords"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.categories.seo.keywords")}</FormLabel>
                      <FormControl>
                        <TextField maxLength={255} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}

interface CategorySource {
  name: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
}

/**
 * The editor body for a non-source language.
 *
 * It reuses the same three grid areas as the Vietnamese form — content, side,
 * SEO — so switching language moves nothing on screen. Only the fields that may
 * be translated appear: showing the parent or the sort order here would imply
 * they vary by language, and they do not.
 */
function CategoryTranslationPanel({
  tr,
  source,
}: {
  tr: EntityTranslation;
  source: CategorySource;
}) {
  const { t } = useTranslation();
  // Every label in this panel is rendered in the language being written, not in
  // the console's own language. Writing English into boxes labelled in
  // Vietnamese is exactly how a translator ends up typing in the wrong one.
  const tl = (key: string) => t(key, { lng: tr.locale });
  const seo = (tr.values.seo ?? {}) as Record<string, unknown>;
  const setSeo = (key: string, value: string) =>
    tr.setField("seo", { ...seo, [key]: value });

  return (
    <div className="editor-grid">
      <Card className="editor-main editor-card" id="cat-translation">
        <CardHeader className="editor-heading">
          <CardTitle>
            <FolderTree className="size-4 text-muted-foreground" aria-hidden />
            {tl("cms.categories.editor.basic")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Same class the Vietnamese form gives its name, so switching
              language does not resize the field under the cursor. The permalink
              row below it has no counterpart here: a category resolves its slug
              against its own table, so every language shares one address. */}
          <div className="editor-titleblock space-y-2">
            <TranslatedField
              id="tr-category-name"
              className="editor-title"
              label={tl("cms.categories.col.name")}
            >
              <TextField
                id="tr-category-name"
                value={str(tr.values.name)}
                maxLength={160}
                onChange={(e) => tr.setField("name", e.target.value)}
              />
            </TranslatedField>
          </div>

          <TranslatedField
            id="tr-category-description"
            label={tl("cms.categories.col.description")}
          >
            <Textarea
              id="tr-category-description"
              rows={5}
              maxLength={2000}
              value={str(tr.values.description)}
              onChange={(e) => tr.setField("description", e.target.value)}
            />
          </TranslatedField>
        </CardContent>
      </Card>

      <aside className="editor-side space-y-4">
        <Card className="editor-card">
          <CardHeader className="editor-heading">
            <CardTitle>
              <Lock className="size-4 text-muted-foreground" aria-hidden />
              {tl("tr.shared_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="tr-shared">
              <li>{tl("cms.categories.editor.permalink")}</li>
              <li>{tl("cms.categories.col.parent")}</li>
              <li>{tl("cms.categories.col.sort_order")}</li>
              <li>{tl("cms.categories.seo.keywords")}</li>
            </ul>
          </CardContent>
        </Card>
      </aside>

      <Card className="editor-wide editor-card">
        <CardHeader className="editor-heading">
          <CardTitle>
            <Search className="size-4 text-muted-foreground" aria-hidden />
            {tl("cms.categories.seo.heading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="editor-seo-preview">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {tl("cms.categories.editor.search_preview")}
            </p>
            <span className="text-xs font-medium text-muted-foreground">
              {"Zukatek"}
            </span>
            {/* The preview applies the same fallback the public page will: an
                untranslated field quietly serves the Vietnamese one, and this is
                where the translator sees that happen. */}
            <p className="mt-1 break-words text-lg font-medium text-primary">
              {str(seo.title) ||
                source.seoTitle ||
                str(tr.values.name) ||
                source.name}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
              {str(seo.description) ||
                source.seoDescription ||
                str(tr.values.description) ||
                source.description}
            </p>
          </div>

          <TranslatedField
            id="tr-category-seo-title"
            label={tl("cms.categories.seo.title")}
          >
            <TextField
              id="tr-category-seo-title"
              value={str(seo.title)}
              maxLength={255}
              onChange={(e) => setSeo("title", e.target.value)}
            />
          </TranslatedField>

          <TranslatedField
            id="tr-category-seo-desc"
            label={tl("cms.categories.seo.description")}
          >
            <Textarea
              id="tr-category-seo-desc"
              rows={3}
              maxLength={500}
              value={str(seo.description)}
              onChange={(e) => setSeo("description", e.target.value)}
            />
          </TranslatedField>
        </CardContent>
      </Card>
    </div>
  );
}
