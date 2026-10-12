import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Save } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar";
import {
  ImageUpload,
  type ImageUploadValue,
} from "@/components/common/ImageHandler";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionNavLayout } from "@/components/common/SectionNavLayout";
import { Select } from "@/components/common/Select";
import { StringListField } from "@/components/common/StringListField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { PageSeoSection } from "@/modules/cms/components/PageSeoSection";
import type { PageSEO } from "@/modules/cms/services/pages.service";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { CategoryMultiSelect } from "../components/CategoryMultiSelect";
import { ChipMultiSelect } from "../components/ChipMultiSelect";
import { GalleryPane, type GalleryDraftItem } from "../components/GalleryPane";
import {
  MemberPicker,
  type ProductMemberDraft,
} from "../components/MemberPicker";
import {
  ProductLifecycleBadge,
  ProductStatusBadge,
} from "../components/ProductStatusBadge";
import {
  useAddGalleryImage,
  useAddGalleryVideo,
  useCreateProduct,
  useProduct,
  useProductTransition,
  useSetProductCategories,
  useSetProductMembers,
  useUpdateProduct,
  useUploadProductMedia,
} from "../hooks/useProducts";
import {
  makeProductSchema,
  productFormDefaults,
  type ProductFormValues,
} from "../schemas/product";
import {
  PRODUCT_AUDIENCES,
  PRODUCT_LIFECYCLES,
  PRODUCT_PLATFORMS,
  type Product,
  type ProductLifecycle,
  type TiptapDoc,
} from "../services/products.service";

// The rich-text editor pulls in Tiptap + ProseMirror; loading it lazily keeps it
// out of the bundle for everyone who never opens a product.
const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({
    default: m.RichTextEditor,
  })),
);

const BACK = "/products";

const EMPTY_SEO: PageSEO = {
  title: "",
  description: "",
  keywords: "",
  canonical_url: "",
  noindex: false,
  nofollow: false,
  og_title: "",
  og_description: "",
};

export default function ProductEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== "new";

  const { hasPermission } = usePermission();
  const canEdit = hasPermission(isEdit ? "products.edit" : "products.create");
  const canPublish = hasPermission("products.publish");

  const detail = useProduct(isEdit ? id : undefined);
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const transition = useProductTransition();
  const setCategories = useSetProductCategories();
  const setMembers = useSetProductMembers();
  const uploadMedia = useUploadProductMedia();
  const addGalleryImage = useAddGalleryImage();
  const addGalleryVideo = useAddGalleryVideo();

  // SEO and the Tiptap JSON doc live outside the zod form: the SEO block is a
  // shared controlled component, and body_json is a side-output of the editor
  // that no validation rule touches.
  const [seo, setSeo] = useState<PageSEO>(EMPTY_SEO);
  const [seoDirty, setSeoDirty] = useState(false);
  const [bodyJson, setBodyJson] = useState<TiptapDoc | null>(null);
  // Categories and members save through their own endpoints (a PATCH of the
  // product never touches them), so they are drafts here with their own dirty
  // flag and are flushed alongside the form on Save.
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState<ProductMemberDraft[]>([]);
  const [relationsDirty, setRelationsDirty] = useState(false);
  // The cover is held as a blob until there is a product to attach it to; the
  // upload endpoint only stores bytes, so the returned path still has to be
  // written back through cover_path.
  const [cover, setCover] = useState<ImageUploadValue>({ kind: "empty" });
  const [coverDirty, setCoverDirty] = useState(false);
  // Gallery entries picked before the product exists, flushed in order on save.
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraftItem[]>([]);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(makeProductSchema(t)),
    defaultValues: productFormDefaults,
    mode: "onTouched",
  });

  useUnsavedGuard(
    form.formState.isDirty ||
      seoDirty ||
      relationsDirty ||
      coverDirty ||
      galleryDraft.length > 0,
  );

  const product = detail.data;
  useEffect(() => {
    if (!product) return;
    form.reset({
      name: product.name,
      slug: product.slug,
      summary: product.summary ?? "",
      body_html: product.body_html ?? "",
      lifecycle: product.lifecycle,
      version: product.version ?? "",
      released_at: product.released_at ?? "",
      audience: product.audience,
      platforms: product.platforms,
      tech_stack: product.tech_stack,
      highlights: product.highlights,
      is_featured: product.is_featured,
      sort_order: product.sort_order,
      product_url: product.product_url ?? "",
      demo_url: product.demo_url ?? "",
      demo_access: product.demo_access ?? "",
      demo_instructions: product.demo_instructions,
    });
    setSeo({ ...EMPTY_SEO, ...product.seo });
    setSeoDirty(false);
    setBodyJson(product.body_json);
    setCover(
      product.cover_url
        ? { kind: "uploaded", fileId: "", url: product.cover_url }
        : { kind: "empty" },
    );
    setCoverDirty(false);
    setCategoryIds(product.categories.map((c) => c.id));
    setMemberDraft(
      product.members.map((m) => ({
        member_id: m.id,
        full_name: m.full_name,
        slug: m.slug,
        avatar_url: m.avatar_url,
        default_role: null,
        role: m.role ?? "",
      })),
    );
    setRelationsDirty(false);
  }, [product, form]);

  const sections = [
    { id: "prod-basic", label: t("products.editor.basic") },
    { id: "prod-content", label: t("products.editor.content") },
    { id: "prod-gallery", label: t("products.editor.gallery") },
    { id: "prod-people", label: t("products.editor.people") },
    { id: "prod-demo", label: t("products.editor.demo") },
    { id: "prod-seo", label: t("products.editor.seo") },
  ];

  // Relations, cover bytes and gallery entries all need a product id, so each of
  // these runs only once there is one — on create, that means after the POST.
  const saveRelations = (productId: string) =>
    Promise.all([
      setCategories.mutateAsync({ id: productId, categoryIds }),
      setMembers.mutateAsync({
        id: productId,
        members: memberDraft.map((m) => ({
          member_id: m.member_id,
          role: m.role.trim() || undefined,
        })),
      }),
    ]);

  // Uploads a freshly-picked cover and returns its stored path. An untouched
  // slot returns undefined, which leaves the current cover alone.
  const resolveCover = async (productId: string) => {
    if (cover.kind !== "pending") return undefined;
    const file = new File([cover.blob], "cover", { type: cover.blob.type });
    const res = await uploadMedia.mutateAsync({
      id: productId,
      file,
      purpose: "cover",
    });
    return res.path;
  };

  // One at a time, because the server assigns sort_order by arrival and the
  // user already put these in the order they want.
  const flushGallery = async (productId: string) => {
    for (const item of galleryDraft) {
      const caption = item.caption.trim() || undefined;
      if (item.kind === "image" && item.file) {
        await addGalleryImage.mutateAsync({
          id: productId,
          file: item.file,
          caption,
        });
      } else if (item.kind === "video" && item.video_url) {
        await addGalleryVideo.mutateAsync({
          id: productId,
          videoUrl: item.video_url,
          caption,
        });
      }
    }
    for (const item of galleryDraft) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
    setGalleryDraft([]);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const fail = (err: unknown) => toast.error(parseApiError(err, t).message);

    if (isEdit && id) {
      try {
        const cover_path = await resolveCover(id);
        const saved = await update.mutateAsync({
          id,
          body: {
            ...values,
            body_json: bodyJson,
            seo,
            ...(cover_path && { cover_path }),
          },
        });
        if (relationsDirty) await saveRelations(saved.id);
        form.reset({ ...values, slug: saved.slug });
        setSeoDirty(false);
        setRelationsDirty(false);
        setCoverDirty(false);
        toast.success(t("products.saved"));
      } catch (err) {
        fail(err);
      }
      return;
    }

    let created: Product;
    try {
      created = await create.mutateAsync({
        ...values,
        body_json: bodyJson,
        seo,
      });
    } catch (err) {
      fail(err);
      return;
    }

    // The product exists from here on. If attaching the cover, gallery or
    // relations fails we still have to land the user on it — telling them
    // nothing was saved would get the product created twice.
    try {
      const cover_path = await resolveCover(created.id);
      if (cover_path)
        await update.mutateAsync({ id: created.id, body: { cover_path } });
      await flushGallery(created.id);
      if (relationsDirty) await saveRelations(created.id);
      toast.success(t("products.saved"));
    } catch (err) {
      fail(err);
    } finally {
      form.reset(values);
      setSeoDirty(false);
      setRelationsDirty(false);
      setCoverDirty(false);
      navigate(`/products/${created.id}`, { replace: true });
    }
  });

  const runTransition = (action: "publish" | "unpublish" | "archive") => {
    if (!id) return;
    transition.mutate(
      { id, action },
      {
        onSuccess: () => toast.success(t(`products.transition.${action}_done`)),
        onError: (err) => toast.error(parseApiError(err, t).message),
      },
    );
  };

  // Saving a new product now runs a short sequence of calls, so the button has
  // to stay busy for the whole of it, not just the first one.
  const saving =
    create.isPending ||
    update.isPending ||
    uploadMedia.isPending ||
    addGalleryImage.isPending ||
    addGalleryVideo.isPending ||
    setCategories.isPending ||
    setMembers.isPending;

  if (isEdit && detail.isLoading) return <Skeleton className="h-96 w-full" />;
  if (isEdit && detail.isError) {
    return (
      <Alert
        variant="danger"
        message={parseApiError(detail.error, t).message}
      />
    );
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
          {isEdit && product && (
            <div className="mr-2 flex items-center gap-2">
              <ProductStatusBadge status={product.status} />
              <ProductLifecycleBadge lifecycle={product.lifecycle} />
            </div>
          )}
          {isEdit && canPublish && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={transition.isPending}
                >
                  {t("products.transition.menu")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => runTransition("publish")}>
                  {t("products.transition.publish")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => runTransition("unpublish")}>
                  {t("products.transition.unpublish")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => runTransition("archive")}>
                  {t("products.transition.archive")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button type="submit" disabled={!canEdit || saving}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </EditorActionBar>

        <PageHeader
          title={isEdit ? t("products.edit_title") : t("products.create_title")}
          breadcrumbs={[
            { labelKey: "nav.products", to: BACK },
            {
              labelKey: isEdit
                ? "products.edit_title"
                : "products.create_title",
            },
          ]}
        />

        {/* Rail clears the app topbar (56px) + the sticky EditorActionBar
            (~60px) so its first link isn't hidden behind the bar. */}
        <SectionNavLayout sections={sections} stickyClass="md:top-[7.5rem]">
          <Card id="prod-basic">
            <CardHeader>
              <CardTitle>{t("products.editor.basic")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("products.col.name")}</FormLabel>
                    <FormControl>
                      <TextField
                        maxLength={200}
                        disabled={!canEdit}
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
                    <FormLabel>{t("products.col.slug")}</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={200}
                        placeholder={t("products.field.slug_ph")}
                        disabled={!canEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.summary")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        maxLength={500}
                        disabled={!canEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-1.5">
                {/* block: the picker is inline-block, so an inline label would
                    share its line and sit on the image's baseline. */}
                <Label className="block">{t("products.field.cover")}</Label>
                <ImageUpload
                  type="rounded"
                  ratio={16 / 9}
                  width={320}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  showCamera={false}
                  value={cover}
                  disabled={!canEdit}
                  onChange={(next) => {
                    setCover(next);
                    setCoverDirty(true);
                  }}
                />
              </div>

              <FormField
                control={form.control}
                name="lifecycle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.col.lifecycle")}</FormLabel>
                    <FormControl>
                      <Select
                        inputId="product-lifecycle-field"
                        isClearable={false}
                        isDisabled={!canEdit}
                        value={{
                          value: field.value,
                          label: t(`products.lifecycle.${field.value}`),
                        }}
                        options={PRODUCT_LIFECYCLES.map((l) => ({
                          value: l,
                          label: t(`products.lifecycle.${l}`),
                        }))}
                        onChange={(o) =>
                          field.onChange(
                            (o?.value as ProductLifecycle) ?? "idea",
                          )
                        }
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("products.field.lifecycle_help")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("products.col.version")}</FormLabel>
                      <FormControl>
                        <Input maxLength={40} disabled={!canEdit} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="released_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("products.col.released_at")}</FormLabel>
                      <FormControl>
                        <Input type="date" disabled={!canEdit} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.audience")}</FormLabel>
                    <FormControl>
                      <ChipMultiSelect
                        name="product-audience"
                        value={field.value}
                        disabled={!canEdit}
                        options={PRODUCT_AUDIENCES.map((a) => ({
                          value: a,
                          label: t(`products.audience.${a}`),
                        }))}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="platforms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.platforms")}</FormLabel>
                    <FormControl>
                      <ChipMultiSelect
                        name="product-platforms"
                        value={field.value}
                        disabled={!canEdit}
                        options={PRODUCT_PLATFORMS.map((p) => ({
                          value: p,
                          label: t(`products.platform.${p}`),
                        }))}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tech_stack"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.tech_stack")}</FormLabel>
                    <FormControl>
                      <StringListField
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="highlights"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.highlights")}</FormLabel>
                    <FormControl>
                      <StringListField
                        value={field.value}
                        onChange={field.onChange}
                        maxLength={300}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("products.col.sort_order")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          disabled={!canEdit}
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
                <FormField
                  control={form.control}
                  name="is_featured"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      {/* Label beside the switch, hint underneath — the same
                          shape as the assistant's "Bật trợ lý" toggle, so a
                          switch means the same thing wherever it appears. */}
                      <div className="flex items-center gap-3 space-y-0">
                        <FormLabel>{t("products.field.featured")}</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!canEdit}
                          />
                        </FormControl>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("products.field.featured_help")}
                      </p>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card id="prod-content">
            <CardHeader>
              <CardTitle>{t("products.editor.content")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="body_html"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.body")}</FormLabel>
                    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                      <RichTextEditor
                        value={field.value}
                        editable={canEdit}
                        ariaLabel={t("products.field.body")}
                        className="[&_.ProseMirror]:min-h-[12rem]"
                        onChange={(html, json) => {
                          field.onChange(html);
                          setBodyJson(json as TiptapDoc);
                        }}
                      />
                    </Suspense>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card id="prod-gallery">
            <CardHeader>
              <CardTitle>{t("products.editor.gallery")}</CardTitle>
            </CardHeader>
            <CardContent>
              <GalleryPane
                productId={isEdit && id ? id : null}
                items={product?.gallery ?? []}
                draft={galleryDraft}
                onDraftChange={setGalleryDraft}
                disabled={!canEdit}
              />
            </CardContent>
          </Card>

          <Card id="prod-people">
            <CardHeader>
              <CardTitle>{t("products.editor.people")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("products.field.categories")}</Label>
                <CategoryMultiSelect
                  value={categoryIds}
                  disabled={!canEdit}
                  onChange={(next) => {
                    setCategoryIds(next);
                    setRelationsDirty(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("products.field.members")}</Label>
                <MemberPicker
                  value={memberDraft}
                  disabled={!canEdit}
                  onChange={(next) => {
                    setMemberDraft(next);
                    setRelationsDirty(true);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card id="prod-demo">
            <CardHeader>
              <CardTitle>{t("products.editor.demo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="product_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.product_url")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://..."
                        disabled={!canEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="demo_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.demo_url")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://..."
                        disabled={!canEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="demo_access"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.demo_access")}</FormLabel>
                    <FormControl>
                      <Input maxLength={300} disabled={!canEdit} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="demo_instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("products.field.demo_instructions")}
                    </FormLabel>
                    <FormControl>
                      <StringListField
                        value={field.value}
                        onChange={field.onChange}
                        maxLength={300}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* PageSeoSection IS the card — wrapping it in another one produced
              an "SEO" card containing an "SEO & Open Graph" card. One card,
              exactly like the article editor. */}
          <PageSeoSection
            id="prod-seo"
            value={seo}
            onChange={(next) => {
              setSeo(next);
              setSeoDirty(true);
            }}
          />
        </SectionNavLayout>
      </form>
    </Form>
  );
}

// Re-exported for the list page's row type narrowing.
export type { Product };
