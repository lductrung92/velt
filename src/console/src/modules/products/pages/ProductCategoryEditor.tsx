import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionNavLayout } from "@/components/common/SectionNavLayout";
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
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import {
  useCreateProductCategory,
  useProductCategories,
  useUpdateProductCategory,
} from "../hooks/useProductCategories";
import {
  makeProductCategorySchema,
  productCategoryFormDefaults,
  type ProductCategoryFormValues,
} from "../schemas/productCategory";

const BACK = "/product-categories";

// Full-page create/edit for a product category — same two-pane shape as the CMS
// category editor (left section rail + one scrolling form), minus the parent
// selector: this taxonomy is flat.
//
// Like the CMS editor, the row being edited is resolved from the list query
// rather than fetched per id: the whole vocabulary is one small request that the
// list screen has already warmed.
export default function ProductCategoryEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== "new";

  const { hasPermission } = usePermission();
  const canManage = hasPermission("products.category.manage");

  const categories = useProductCategories();
  const category = useMemo(
    () => (isEdit ? categories.data?.items.find((c) => c.id === id) : undefined),
    [categories.data, id, isEdit],
  );

  const create = useCreateProductCategory();
  const update = useUpdateProductCategory();

  const form = useForm<ProductCategoryFormValues>({
    resolver: zodResolver(makeProductCategorySchema(t)),
    defaultValues: productCategoryFormDefaults,
    mode: "onTouched",
  });

  useUnsavedGuard(form.formState.isDirty);

  useEffect(() => {
    if (!category) return;
    form.reset({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      sort_order: category.sort_order,
      seo_title: category.seo.title ?? "",
      seo_description: category.seo.description ?? "",
      seo_keywords: category.seo.keywords ?? "",
    });
  }, [category, form]);

  const sections = [
    { id: "pcat-basic", label: t("products.categories.editor.basic") },
    { id: "pcat-seo", label: t("products.categories.seo.heading") },
  ];

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      name: values.name,
      slug: values.slug,
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
    const onError = (err: unknown) => toast.error(parseApiError(err, t).message);

    if (isEdit && id) {
      update.mutate(
        { id, body },
        {
          onSuccess: (saved) => {
            toast.success(t("products.categories.saved"));
            form.reset({ ...values, slug: saved.slug });
          },
          onError,
        },
      );
      return;
    }
    create.mutate(body, {
      onSuccess: () => {
        toast.success(t("products.categories.saved"));
        form.reset(values);
        navigate(BACK);
      },
      onError,
    });
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
    return <Alert variant="danger" message={t("errors.validation.not_found")} />;
  }

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
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
          <Button type="submit" disabled={!canManage || saving}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </EditorActionBar>

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

        {/* Rail clears the app topbar (56px) + the sticky EditorActionBar
            (~60px) so its first link isn't hidden behind the bar. */}
        <SectionNavLayout sections={sections} stickyClass="md:top-[7.5rem]">
          <Card id="pcat-basic">
            <CardHeader>
              <CardTitle>{t("products.categories.editor.basic")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
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
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.categories.col.slug")}</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={160}
                        placeholder={t("products.categories.field.slug_ph")}
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("products.categories.col.description")}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        maxLength={1000}
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
                            e.target.value === "" ? 0 : Number(e.target.value),
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

          <Card id="pcat-seo">
            <CardHeader>
              <CardTitle>{t("products.categories.seo.heading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="seo_title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.categories.seo.title")}</FormLabel>
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
            </CardContent>
          </Card>
        </SectionNavLayout>
      </form>
    </Form>
  );
}
