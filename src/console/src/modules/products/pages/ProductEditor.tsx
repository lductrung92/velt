import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Globe2,
  ImageIcon,
  Images,
  Layers,
  PenLine,
  Rocket,
  Save,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
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
import { Select } from "@/components/common/Select";
import { SlugField } from "@/components/common/SlugField";
import { StringListField } from "@/components/common/StringListField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DateField } from "@/components/common/DateField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import type { PageSEO } from "@/modules/cms/services/pages.service";
import { usePermission } from "@/modules/auth";
import { LanguageTabs } from "@/modules/translation/components/LanguageTabs";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
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
import { ProductTranslationPanel } from "../components/ProductTranslationPanel";
import "@/styles/editor-page.css";
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
  type UpdateProductBody,
} from "../services/products.service";

// The rich-text editor pulls in Tiptap + ProseMirror; loading it lazily keeps it
// out of the bundle for everyone who never opens a product.
const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({
    default: m.RichTextEditor,
  })),
);

const BACK = "/products";

// The text half of the SEO block; the two flags are rendered as checkboxes.
type SeoTextKey =
  | "title"
  | "description"
  | "keywords"
  | "canonical_url"
  | "og_title"
  | "og_description";

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

  const product = detail.data;
  // Translations live outside this form: their shape is locale x declared
  // field, which a static zod schema cannot describe — the same reason the SEO
  // and cover state sit outside it.
  const tr = useEntityTranslation("product", product?.id);

  useUnsavedGuard(
    form.formState.isDirty ||
      seoDirty ||
      relationsDirty ||
      coverDirty ||
      tr.dirty ||
      galleryDraft.length > 0,
  );

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

    // The server derives the slug from the name, so a create never sends one
    // and an edit sends it only when it changed (below).
    const { slug, ...fields } = values;

    if (isEdit && id) {
      try {
        const cover_path = await resolveCover(id);
        const body: UpdateProductBody = {
          ...fields,
          body_json: bodyJson,
          seo,
          ...(cover_path && { cover_path }),
        };
        // Only when it actually changed: sending the current slug back on every
        // save would re-run the rename path for nothing, and a slug is an
        // address people already hold.
        const nextSlug = slug.trim();
        if (nextSlug && nextSlug !== product?.slug) body.slug = nextSlug;
        // Before the product write, not after: publishing reads the stored
        // translations, so the other order would publish the previous ones and
        // force a second Save to get this one onto the site.
        await tr.flush(id);
        const saved = await update.mutateAsync({ id, body });
        if (relationsDirty) await saveRelations(saved.id);
        // That write republished the product, which is what clears "needs
        // republishing" — so the translation view has to be read again.
        await tr.refresh();
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
        ...fields,
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

  // The SEO block is one object the server replaces wholesale, so it is held in
  // state and these rows are wired by hand rather than through FormField.
  const patchSeo = (next: Partial<PageSEO>) => {
    setSeo({ ...seo, ...next });
    setSeoDirty(true);
  };
  const seoText = (
    key: SeoTextKey,
    opts: { max: number; rows?: number; type?: string },
  ) => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`product-seo-${key}`}>{t(`cms.pages.seo.${key}`)}</Label>
      {opts.rows ? (
        <Textarea
          id={`product-seo-${key}`}
          rows={opts.rows}
          maxLength={opts.max}
          value={seo[key] ?? ""}
          disabled={!canEdit}
          onChange={(e) => patchSeo({ [key]: e.target.value })}
        />
      ) : (
        <Input
          id={`product-seo-${key}`}
          type={opts.type ?? "text"}
          maxLength={opts.max}
          value={seo[key] ?? ""}
          disabled={!canEdit}
          onChange={(e) => patchSeo({ [key]: e.target.value })}
        />
      )}
    </div>
  );

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
      <form
        onSubmit={onSubmit}
        noValidate
        className="editor-page space-y-5"
        data-editor="product"
      >
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
        {!tr.isBase && (
          <ProductTranslationPanel
            tr={tr}
            readOnly={!canEdit}
            source={{
              name: form.watch("name"),
              slug: form.watch("slug"),
              summary: form.watch("summary"),
              seoTitle: seo.title ?? "",
              seoDescription: seo.description ?? "",
            }}
          />
        )}
        {/* Kept mounted behind `hidden` rather than unmounted: switching to a
            language and back must not throw away unsaved Vietnamese edits. */}
        <div className="editor-grid" hidden={!tr.isBase}>
          <div className="editor-main space-y-5">
            <Card className="editor-card" id="prod-content">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <PenLine
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("products.editor.content")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="editor-titleblock space-y-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="editor-title">
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
                  {/* Only after the first save: before that the server derives
                      the slug from the name, and an empty box would just invite
                      a worse answer. */}
                  {isEdit && product && (
                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <SlugField
                            label={t("products.editor.permalink")}
                            value={field.value}
                            original={product.slug}
                            onChange={field.onChange}
                            disabled={!canEdit}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
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
                          className="editor-body"
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

            <Card className="editor-card" id="prod-details">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <Layers
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("products.editor.details")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>

            <Card className="editor-card" id="prod-gallery">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <Images
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("products.editor.gallery")}
                </CardTitle>
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

            <Card className="editor-card" id="prod-people">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <Users className="size-4 text-muted-foreground" aria-hidden />
                  {t("products.editor.people")}
                </CardTitle>
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

            <Card className="editor-card" id="prod-demo">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <Rocket
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("products.editor.demo")}
                </CardTitle>
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
          </div>

          <aside
            className="editor-side space-y-4"
            aria-label={t("products.editor.settings")}
          >
            <Card className="editor-card">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <SlidersHorizontal
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("products.editor.basic")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
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
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("products.field.lifecycle_help")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                        <DateField disabled={!canEdit} {...field} />
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
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("products.field.featured_help")}
                      </p>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="editor-card">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <ImageIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("products.field.cover")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* No field label here: the card heading already names it. */}
                <ImageUpload
                  type="rounded"
                  ratio={16 / 9}
                  width={280}
                  className="editor-image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  showCamera={false}
                  value={cover}
                  disabled={!canEdit}
                  onChange={(next) => {
                    setCover(next);
                    setCoverDirty(true);
                  }}
                />
              </CardContent>
            </Card>
          </aside>

          <Card className="editor-wide editor-card" id="prod-seo">
            <CardHeader className="editor-heading">
              <CardTitle>
                <Search className="size-4 text-muted-foreground" aria-hidden />
                {t("products.editor.seo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="editor-seo-preview">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  {t("products.editor.search_preview")}
                </p>
                <span className="text-xs font-medium text-muted-foreground">
                  {"Zukatek"}
                </span>
                <p className="mt-1 break-words text-lg font-medium text-primary-ink">
                  {seo.title ||
                    form.watch("name") ||
                    t("products.editor.preview_title")}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {seo.description ||
                    form.watch("summary") ||
                    t("products.editor.preview_description")}
                </p>
              </div>
              <div className="space-y-4">
                {seoText("title", { max: 255 })}
                {seoText("description", { max: 500, rows: 2 })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {seoText("keywords", { max: 255 })}
                {seoText("canonical_url", { max: 500, type: "url" })}
              </div>
              <div className="flex flex-wrap items-center gap-5 rounded-lg border bg-muted/20 p-4">
                <Checkbox
                  id="product-seo-noindex"
                  label={t("cms.pages.seo.noindex")}
                  checked={seo.noindex}
                  disabled={!canEdit}
                  onChange={(e) => patchSeo({ noindex: e.target.checked })}
                />
                <Checkbox
                  id="product-seo-nofollow"
                  label={t("cms.pages.seo.nofollow")}
                  checked={seo.nofollow}
                  disabled={!canEdit}
                  onChange={(e) => patchSeo({ nofollow: e.target.checked })}
                />
              </div>
              <div className="border-t pt-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-medium">
                  <Globe2 className="size-4 text-primary-ink" aria-hidden />
                  {t("products.editor.social")}
                </h3>
                {/* Fields only, no media column: a product's social image is
                    the cover, which already has its own slot in the sidebar. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {seoText("og_title", { max: 255 })}
                  {seoText("og_description", { max: 500, rows: 2 })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}

// Re-exported for the list page's row type narrowing.
export type { Product };
