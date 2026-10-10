import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { SectionNavLayout } from "@/components/common/SectionNavLayout";
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

// Full-page create/edit for a category. Two-pane layout (left section rail +
// single scrolling form, ref: "Cài đặt hệ thống"). The category list isn't
// fetched per-id; the tree (GET /cms/categories) carries every node, so we
// resolve the edit target from it.
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
        label:
          n.depth > 0
            ? "   ".repeat(n.depth) + "└ " + n.name
            : n.name,
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
        if (allowSlugEdit) {
          const s = values.slug.trim();
          if (s) body.slug = s;
        } else if (regenerate) {
          body.regenerate_slug = true;
        }
        await update.mutateAsync({ id: category.id, body });
        toast.success(t("cms.categories.toast.update_success"));
      } else {
        const body: CreateCategoryBody = {
          name: values.name.trim(),
          sort_order: values.sort_order,
          description: values.description.trim(),
          seo,
        };
        if (parentId) body.parent_id = parentId;
        if (allowSlugEdit && values.slug.trim()) body.slug = values.slug.trim();
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

  const sections = [
    { id: "cat-basic", label: t("cms.categories.editor.basic") },
    { id: "cat-seo", label: t("cms.categories.seo.heading") },
  ];

  return (
    <div className="space-y-4">
      {header}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate>
          <EditorActionBar
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

          {/* Rail clears the app topbar (56px) + the sticky EditorActionBar
              (~60px) so its first link isn't hidden behind the bar. */}
          <SectionNavLayout sections={sections} stickyClass="md:top-[7.5rem]">
            {/* Thông tin cơ bản */}
            <Card id="cat-basic">
              <CardHeader>
                <CardTitle>{t("cms.categories.editor.basic")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
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
                {allowSlugEdit && (
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("cms.categories.col.slug")}</FormLabel>
                        <FormControl>
                          <Input
                            maxLength={160}
                            placeholder={t("cms.categories.placeholder.slug")}
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
                    id="cms-category-regenerate-slug"
                    label={t("cms.categories.regenerate_slug")}
                    checked={regenerate}
                    onChange={(e) => setRegenerate(e.target.checked)}
                  />
                )}
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("cms.categories.col.description")}
                      </FormLabel>
                      <FormControl>
                        <Textarea rows={3} maxLength={2000} {...field} />
                      </FormControl>
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

            {/* SEO */}
            <Card id="cat-seo">
              <CardHeader>
                <CardTitle>{t("cms.categories.seo.heading")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>
          </SectionNavLayout>
        </form>
      </Form>
    </div>
  );
}
