import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Lock,
  Save,
  Search,
  SlidersHorizontal,
  Tags,
} from "lucide-react";
import { useEffect, useMemo } from "react";
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
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { LanguageTabs } from "@/modules/translation/components/LanguageTabs";
import { TranslatedField } from "@/modules/translation/components/TranslatedField";
import {
  useEntityTranslation,
  type EntityTranslation,
} from "@/modules/translation/hooks/useEntityTranslation";

import "@/styles/editor-page.css";
import {
  useCreateProductCategory,
  useProductCategories,
  useUpdateProductCategory,
} from "../hooks/useProductCategories";
import { PRODUCT_CATEGORY_STATUSES } from "../services/productCategories.service";
import {
  makeProductCategorySchema,
  productCategoryFormDefaults,
  type ProductCategoryFormValues,
} from "../schemas/productCategory";

const BACK = "/product-categories";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Full-page create/edit for a product category, on the shared editor chrome —
// same shape as the CMS category editor minus the parent selector: this taxonomy
// is flat.
//
// Like the CMS editor, the row being edited is resolved from the list query
// rather than fetched per id: the whole vocabulary is one small request.
//
// It is the SOURCE-LANGUAGE copy of that list, not the one the screens show:
// this form is saved back into the Vietnamese row, so seeding it with the
// English name a reader sees would overwrite the Vietnamese one.
export default function ProductCategoryEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== "new";

  const { hasPermission } = usePermission();
  const canManage = hasPermission("products.category.manage");

  // `name` on these rows is the stored one, which is what this form writes
  // back; the list renders `name_display` instead.
  const categories = useProductCategories();
  // The three labels are the shared content vocabulary, the same ones the
  // list's badges and tabs read from.
  const statusOptions = useMemo(
    () =>
      PRODUCT_CATEGORY_STATUSES.map((value) => ({
        value,
        label: t(`content_status.${value}`),
      })),
    [t],
  );

  const category = useMemo(
    () =>
      isEdit ? categories.data?.items.find((c) => c.id === id) : undefined,
    [categories.data, id, isEdit],
  );

  const create = useCreateProductCategory();
  const update = useUpdateProductCategory();

  const form = useForm<ProductCategoryFormValues>({
    resolver: zodResolver(makeProductCategorySchema(t)),
    defaultValues: productCategoryFormDefaults,
    mode: "onTouched",
  });
  // Translations live outside this form: their shape is locale x declared
  // field, which a static zod schema cannot describe.
  const tr = useEntityTranslation("product_category", category?.id);

  useEffect(() => {
    if (!category) return;
    form.reset({
      name: category.name,
      slug: category.slug,
      status: category.status,
      description: category.description ?? "",
      sort_order: category.sort_order,
      seo_title: category.seo.title ?? "",
      seo_description: category.seo.description ?? "",
      seo_keywords: category.seo.keywords ?? "",
    });
  }, [category, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const body = {
      name: values.name,
      status: values.status,
      description: values.description,
      sort_order: values.sort_order,
      // A present `seo` object replaces all three fields, so an emptied input
      // clears that meta rather than silently keeping the old value.
      seo: {
        title: values.seo_title,
        description: values.seo_description,
        keywords: values.seo_keywords,
      },
    };
    try {
      if (isEdit && category) {
        // Only when it actually changed: sending the current slug back on every
        // save would re-run the rename path for nothing, and a slug is an
        // address people already hold.
        const nextSlug = values.slug.trim();
        // Translations first, so one Save stores both halves of the record and
        // the re-read below reports what the server now holds.
        await tr.flush(category.id);
        const saved = await update.mutateAsync({
          id: category.id,
          body:
            nextSlug && nextSlug !== category.slug
              ? { ...body, slug: nextSlug }
              : body,
        });
        await tr.refresh();
        toast.success(t("products.categories.saved"));
        form.reset({ ...values, slug: saved.slug });
        return;
      }
      await create.mutateAsync(body);
      toast.success(t("products.categories.saved"));
      form.reset(values);
      navigate(BACK);
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  });

  const saving = create.isPending || update.isPending;

  if (isEdit && categories.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (isEdit && categories.isError) {
    return (
      <Alert
        variant="danger"
        message={parseApiError(categories.error, t).message}
      />
    );
  }
  if (isEdit && !category) {
    return (
      <Alert variant="danger" message={t("errors.validation.not_found")} />
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="editor-page space-y-5"
        data-editor="product-category"
      >
        <PageHeader
          title={
            isEdit
              ? t("products.categories.edit_title")
              : t("products.categories.create_title")
          }
          breadcrumbs={[
            { labelKey: "nav.product_categories", to: BACK },
            {
              labelKey: isEdit
                ? "products.categories.edit_title"
                : "products.categories.create_title",
            },
          ]}
        />
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
          <Button type="submit" disabled={!canManage || saving}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </EditorActionBar>

        {!tr.isBase && (
          <ProductCategoryTranslationPanel
            tr={tr}
            readOnly={!canManage}
            source={{
              name: form.watch("name"),
              description: form.watch("description"),
              seoTitle: form.watch("seo_title"),
              seoDescription: form.watch("seo_description"),
            }}
          />
        )}
        <div className="editor-grid" hidden={!tr.isBase}>
          <Card className="editor-main editor-card" id="pcat-basic">
            <CardHeader className="editor-heading">
              <CardTitle>
                <Tags className="size-4 text-muted-foreground" aria-hidden />
                {t("products.categories.editor.basic")}
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
                        {t("products.categories.col.name")}
                      </FormLabel>
                      <FormControl>
                        <TextField
                          maxLength={160}
                          disabled={!canManage}
                          {...field}
                        />
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
                          label={t("products.categories.editor.permalink")}
                          value={field.value}
                          original={category.slug}
                          onChange={field.onChange}
                          disabled={!canManage}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("products.categories.col.description")}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={5}
                        maxLength={1000}
                        disabled={!canManage}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <aside
            className="editor-side space-y-4"
            aria-label={t("products.categories.editor.settings")}
          >
            <Card className="editor-card">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <SlidersHorizontal
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("products.categories.editor.placement")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("products.categories.col.status")}
                      </FormLabel>
                      <Select
                        inputId="product-category-status"
                        options={statusOptions}
                        isClearable={false}
                        isSearchable={false}
                        isDisabled={!canManage}
                        value={
                          statusOptions.find((o) => o.value === field.value) ??
                          null
                        }
                        onChange={(o) =>
                          field.onChange(o?.value ?? "published")
                        }
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
                        {t("products.categories.col.sort_order")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          disabled={!canManage}
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

          <Card className="editor-wide editor-card" id="pcat-seo">
            <CardHeader className="editor-heading">
              <CardTitle>
                <Search className="size-4 text-muted-foreground" aria-hidden />
                {t("products.categories.seo.heading")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="editor-seo-preview">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  {t("products.categories.editor.search_preview")}
                </p>
                <span className="text-xs font-medium text-muted-foreground">
                  {"Zukatek"}
                </span>
                <p className="mt-1 break-words text-lg font-medium text-primary-ink">
                  {form.watch("seo_title") ||
                    form.watch("name") ||
                    t("products.categories.editor.preview_title")}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {form.watch("seo_description") ||
                    form.watch("description") ||
                    t("products.categories.editor.preview_description")}
                </p>
              </div>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="seo_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("products.categories.seo.title")}
                      </FormLabel>
                      <FormControl>
                        <TextField
                          maxLength={255}
                          disabled={!canManage}
                          {...field}
                        />
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
                        {t("products.categories.seo.description")}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          maxLength={500}
                          disabled={!canManage}
                          {...field}
                        />
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
                      <FormLabel>
                        {t("products.categories.seo.keywords")}
                      </FormLabel>
                      <FormControl>
                        <TextField
                          maxLength={255}
                          disabled={!canManage}
                          {...field}
                        />
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

interface ProductCategorySource {
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
 * be translated appear: showing the sort order here would imply it varies by
 * language, and it does not.
 */
function ProductCategoryTranslationPanel({
  tr,
  source,
  readOnly,
}: {
  tr: EntityTranslation;
  source: ProductCategorySource;
  readOnly?: boolean;
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
      <Card className="editor-main editor-card" id="pcat-translation">
        <CardHeader className="editor-heading">
          <CardTitle>
            <Tags className="size-4 text-muted-foreground" aria-hidden />
            {tl("products.categories.editor.basic")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Same class the Vietnamese form gives its name, so switching
              language does not resize the field under the cursor. The permalink
              row below it has no counterpart here: a category resolves its slug
              against its own table, so every language shares one address. */}
          <div className="editor-titleblock space-y-2">
            <TranslatedField
              id="tr-pcategory-name"
              className="editor-title"
              label={tl("products.categories.col.name")}
            >
              <TextField
                id="tr-pcategory-name"
                value={str(tr.values.name)}
                maxLength={160}
                disabled={readOnly}
                onChange={(e) => tr.setField("name", e.target.value)}
              />
            </TranslatedField>
          </div>

          <TranslatedField
            id="tr-pcategory-description"
            label={tl("products.categories.col.description")}
          >
            <Textarea
              id="tr-pcategory-description"
              rows={5}
              maxLength={1000}
              value={str(tr.values.description)}
              disabled={readOnly}
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
              <li>{tl("products.categories.editor.permalink")}</li>
              <li>{tl("products.categories.col.sort_order")}</li>
              <li>{tl("products.categories.seo.keywords")}</li>
            </ul>
          </CardContent>
        </Card>
      </aside>

      <Card className="editor-wide editor-card">
        <CardHeader className="editor-heading">
          <CardTitle>
            <Search className="size-4 text-muted-foreground" aria-hidden />
            {tl("products.categories.seo.heading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="editor-seo-preview">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {tl("products.categories.editor.search_preview")}
            </p>
            <span className="text-xs font-medium text-muted-foreground">
              {"Zukatek"}
            </span>
            {/* The preview applies the same fallback the public page will: an
                untranslated field quietly serves the Vietnamese one, and this is
                where the translator sees that happen. */}
            <p className="mt-1 break-words text-lg font-medium text-primary-ink">
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
            id="tr-pcategory-seo-title"
            label={tl("products.categories.seo.title")}
          >
            <TextField
              id="tr-pcategory-seo-title"
              value={str(seo.title)}
              maxLength={255}
              disabled={readOnly}
              onChange={(e) => setSeo("title", e.target.value)}
            />
          </TranslatedField>

          <TranslatedField
            id="tr-pcategory-seo-desc"
            label={tl("products.categories.seo.description")}
          >
            <Textarea
              id="tr-pcategory-seo-desc"
              rows={3}
              maxLength={500}
              value={str(seo.description)}
              disabled={readOnly}
              onChange={(e) => setSeo("description", e.target.value)}
            />
          </TranslatedField>
        </CardContent>
      </Card>
    </div>
  );
}
