import { zodResolver } from "@hookform/resolvers/zod";
import type { Editor } from "@tiptap/react";
import {
  ArrowLeft,
  Globe2,
  ImageIcon,
  PenLine,
  Save,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { SlugField } from "@/components/common/SlugField";
import { ImageNode } from "@/components/common/RichTextEditor/ImageExtension";
import { Select } from "@/components/common/Select";
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
import { DateField } from "@/components/common/DateField";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { LanguageTabs } from "@/modules/translation/components/LanguageTabs";
import { useUnsavedChanges } from "@/app/UnsavedChangesProvider";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";

import { ArticleImageButton } from "../components/ArticleImageButton";
import { ArticleTranslationPanel } from "../components/ArticleTranslationPanel";
import { ArticleStatusBadge } from "../components/ArticleStatusBadge";
import "@/styles/editor-page.css";
import {
  useArticle,
  useCreateArticle,
  useUpdateArticle,
  useUploadArticleMedia,
} from "../hooks/useCmsArticles";
import { useCategories } from "../hooks/useCmsCategories";
import { useCmsSettings } from "../hooks/useCmsSettings";
import {
  articleFormDefaults,
  makeArticleSchema,
  type ArticleFormValues,
} from "../schemas/article";
import type {
  ArticleSEO,
  ArticleStatus,
  CreateArticleBody,
  UpdateArticleBody,
  UploadPurpose,
} from "../services/articles.service";
import { allowedStatuses, isReviewerRole } from "../utils/articleStatus";
import { flattenTree } from "../utils/categoryTree";

// datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time (an ISO string would be
// rejected by the input), so format the stored UTC instant to local parts.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The Tiptap chunk is heavy → load it only when the editor mounts.
const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({
    default: m.RichTextEditor,
  })),
);

interface Option {
  value: string;
  label: string;
}

export default function ArticleEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [id]);

  const { hasPermission } = usePermission();
  const isReviewer = hasPermission("cms.article.review");

  const articleQuery = useArticle(id);
  const article = articleQuery.data;
  const settingsQuery = useCmsSettings(true);
  const categories = useCategories();
  const create = useCreateArticle();
  const update = useUpdateArticle();
  const uploadMedia = useUploadArticleMedia();

  // Body editor: enable inline images (block <img>) + a toolbar upload button.
  // Before the article exists an inserted image is a local object URL; it is
  // uploaded and swapped for the stored URL as part of the first save.
  const [pendingInline, setPendingInline] = useState<
    { url: string; file: File }[]
  >([]);
  const bodyExtensions = useMemo(() => [ImageNode], []);
  const renderBodyToolbar = useCallback(
    (editor: Editor | null) => (
      <ArticleImageButton
        editor={editor}
        articleId={article?.id}
        onDeferred={(p) => setPendingInline((cur) => [...cur, p])}
      />
    ),
    [article?.id],
  );

  const flag = (key: string, def = true) => {
    const e = settingsQuery.data?.cms?.find((x) => x.key === key);
    return e ? Boolean(e.value) : def;
  };
  const categorize = flag("cms.article.categorize");
  const allowSlugEdit = flag("cms.article.allow_slug_edit");
  const reviewOn = flag("cms.article.require_review");
  const schedulingOn = !flag("cms.publish.allow_now");

  const [bodyJson, setBodyJson] = useState<Record<string, unknown> | null>(
    null,
  );
  const [featured, setFeatured] = useState<ImageUploadValue>({ kind: "empty" });
  const [og, setOg] = useState<ImageUploadValue>({ kind: "empty" });
  const [regenerate, setRegenerate] = useState(false);

  // The categorize flag loads async after the resolver is fixed at mount, so the
  // "category required" rule is enforced in onSubmit (below) rather than in zod
  // — keeping the resolver pure. publish_at / note conditionals stay in zod
  // (they key off the form's status, known synchronously).
  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(makeArticleSchema(t, { categorizeRequired: false })),
    defaultValues: articleFormDefaults,
    // Don't surface errors until a field is touched (or on submit) — e.g. the
    // body shouldn't show "required" before the user engages the form.
    mode: "onTouched",
  });
  const status = form.watch("status");
  const [mediaDirty, setMediaDirty] = useState(false);
  // Translations live outside this form: their shape is locale x declared
  // field, which a static zod schema cannot describe (same reason the SEO and
  // image state sit outside it).
  const tr = useEntityTranslation("article", article?.id);
  const dirty = form.formState.isDirty || mediaDirty || tr.dirty;
  // Editor is read-only for an editor (non-reviewer) once the article is out for
  // publishing (workflow-states §4).
  const isReadOnly =
    !isReviewer &&
    !!article &&
    (article.status === "published" || article.status === "scheduled");

  // The guard lives at the router — one blocker per router — so this only
  // declares what is pending. It covers the Back button, the sidebar, the
  // breadcrumb and the browser's own back button alike.
  useUnsavedChanges({
    when: dirty && !isReadOnly,
    what: t("cms.articles.one"),
  });

  useEffect(() => {
    if (!article) return;
    setMediaDirty(false);
    form.reset({
      ...articleFormDefaults,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt ?? "",
      body_html: article.body_html ?? "",
      category_id: article.category?.id ?? "",
      status: article.status,
      // A scheduled article carries its future time in published_at — preload it
      // so a content-only edit doesn't trip the "publish_at required" rule.
      publish_at:
        article.status === "scheduled" && article.published_at
          ? isoToLocalInput(article.published_at)
          : "",
      seo_title: article.seo.title ?? "",
      seo_description: article.seo.description ?? "",
      seo_keywords: article.seo.keywords ?? "",
      canonical_url: article.seo.canonical_url ?? "",
      seo_noindex: article.seo.noindex,
      seo_nofollow: article.seo.nofollow,
      og_title: article.seo.og_title ?? "",
      og_description: article.seo.og_description ?? "",
    });
    setBodyJson((article.body_json as Record<string, unknown> | null) ?? null);
    setFeatured(
      article.featured_url
        ? { kind: "uploaded", fileId: "", url: article.featured_url }
        : { kind: "empty" },
    );
    setOg(
      article.og_url
        ? { kind: "uploaded", fileId: "", url: article.og_url }
        : { kind: "empty" },
    );
  }, [article, form]);

  const categoryOptions: Option[] = useMemo(
    () =>
      flattenTree(categories.data ?? []).map((n) => ({
        value: n.id,
        label: "  ".repeat(n.depth) + n.name,
      })),
    [categories.data],
  );

  // Statuses the actor may assign (matrix), plus the article's CURRENT status so
  // the <Select> always shows it — even when it's outside the assignable set
  // (e.g. an editor viewing a needs_revision/scheduled article); re-selecting the
  // current status is a no-op the backend allows (statusChanged=false).
  const assignable = allowedStatuses({
    actorIsReviewer: isReviewer,
    authorIsReviewer: article ? isReviewerRole(article.author_role) : false,
    isCreate: !isEdit,
    reviewOn,
    schedulingOn,
  });
  const statusValues: ArticleStatus[] =
    article && !assignable.includes(article.status)
      ? [article.status, ...assignable]
      : assignable;
  const statusOptions: Option[] = statusValues.map((s) => ({
    value: s,
    label: t(`content_status.${s}`),
  }));

  function buildSeo(v: ArticleFormValues): ArticleSEO {
    return {
      title: v.seo_title.trim(),
      description: v.seo_description.trim(),
      keywords: v.seo_keywords.trim(),
      canonical_url: v.canonical_url.trim(),
      noindex: v.seo_noindex,
      nofollow: v.seo_nofollow,
      og_title: v.og_title.trim(),
      og_description: v.og_description.trim(),
    };
  }

  // Upload a freshly-picked image (deferred until save) and return its stored
  // path; an unchanged/empty slot returns undefined (left as-is).
  async function resolveImage(
    articleId: string,
    val: ImageUploadValue,
    purpose: UploadPurpose,
  ): Promise<string | undefined> {
    if (val.kind !== "pending") return undefined;
    const file = new File([val.blob], purpose, { type: val.blob.type });
    const res = await uploadMedia.mutateAsync({ id: articleId, file, purpose });
    return res.path;
  }

  // Uploads every image that was inserted before the article existed and returns
  // the body with each local object URL swapped for its stored URL. The caller
  // must send that body in the same save: gcInlineMedia reconciles the whole
  // media folder against the body it receives, so an upload the body does not
  // reference yet would be deleted again straight away.
  async function resolveInlineImages(
    articleId: string,
    html: string,
    json: Record<string, unknown> | null,
  ) {
    if (pendingInline.length === 0) return { html, json };
    const swaps: [string, string][] = [];
    for (const p of pendingInline) {
      const res = await uploadMedia.mutateAsync({
        id: articleId,
        file: p.file,
        purpose: "inline",
      });
      swaps.push([p.url, res.url]);
    }
    let nextHtml = html;
    for (const [from, to] of swaps) nextHtml = nextHtml.split(from).join(to);

    const rewrite = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(rewrite);
      if (!node || typeof node !== "object") return node;
      const out: Record<string, unknown> = { ...(node as object) };
      const attrs = out.attrs as { src?: unknown } | undefined;
      if (attrs && typeof attrs.src === "string") {
        const hit = swaps.find(([from]) => from === attrs.src);
        if (hit) out.attrs = { ...attrs, src: hit[1] };
      }
      if (out.content) out.content = rewrite(out.content);
      return out;
    };
    const nextJson = json ? (rewrite(json) as Record<string, unknown>) : json;

    for (const p of pendingInline) URL.revokeObjectURL(p.url);
    setPendingInline([]);
    return { html: nextHtml, json: nextJson };
  }

  const onSubmit = form.handleSubmit(async (values) => {
    // Category-required is flag-driven (loads async) → enforce here, inline on
    // the field, instead of in the mount-fixed resolver.
    if (categorize && !values.category_id) {
      form.setError("category_id", {
        message: t("errors.validation.required"),
      });
      document.getElementById("cms-article-category")?.focus();
      return;
    }
    const st = values.status as ArticleStatus;
    const seo = buildSeo(values);
    const publishAt =
      st === "scheduled" && values.publish_at
        ? new Date(values.publish_at).toISOString()
        : undefined;
    try {
      if (isEdit && article) {
        const featured_path = await resolveImage(
          article.id,
          featured,
          "featured",
        );
        const og_path = await resolveImage(article.id, og, "og");
        const body: UpdateArticleBody = {
          updated_at: article.updated_at,
          title: values.title.trim(),
          status: st,
          excerpt: values.excerpt.trim(),
          body_html: values.body_html,
          body_json: bodyJson ?? undefined,
          category_id: values.category_id || null,
          seo,
        };
        if (publishAt) body.publish_at = publishAt;
        if (st === "needs_revision") body.note = values.note.trim();
        // Only when it actually changed: sending the current slug back on every
        // save would re-run the rename path for nothing, and a slug is an
        // address people already hold.
        const nextSlug = values.slug.trim();
        if (allowSlugEdit && nextSlug && nextSlug !== article.slug) {
          body.slug = nextSlug;
        } else if (!allowSlugEdit && regenerate) {
          body.regenerate_slug = true;
        }
        if (featured_path) body.featured_path = featured_path;
        if (og_path) body.og_path = og_path;
        // Before the article write, not after: publishing reads the stored
        // translations, so the other order would republish the previous ones
        // and force a second Save to get this one onto the site.
        await tr.flush(article.id);
        await update.mutateAsync({ id: article.id, body });
        // That write republished the article, which is what clears "needs
        // republishing" — so the translation view has to be read again.
        await tr.refresh();
        toast.success(t("cms.articles.toast.update_success"));
      } else {
        const body: CreateArticleBody = {
          title: values.title.trim(),
          status: st,
          excerpt: values.excerpt.trim(),
          body_html: values.body_html,
          body_json: bodyJson ?? undefined,
          seo,
        };
        if (values.category_id) body.category_id = values.category_id;
        if (publishAt) body.publish_at = publishAt;
        const created = await create.mutateAsync(body);
        const hadTranslations = tr.dirty;
        await tr.flush(created.id);
        const featured_path = await resolveImage(
          created.id,
          featured,
          "featured",
        );
        const og_path = await resolveImage(created.id, og, "og");
        const inline = await resolveInlineImages(
          created.id,
          values.body_html,
          bodyJson,
        );
        const rewritten = inline.html !== values.body_html;
        // hadTranslations joins the condition so a brand-new article published
        // with a translation still gets one republish that includes it.
        if (featured_path || og_path || rewritten || hadTranslations) {
          await update.mutateAsync({
            id: created.id,
            body: {
              updated_at: created.updated_at,
              featured_path,
              og_path,
              ...(rewritten && {
                body_html: inline.html,
                body_json: inline.json ?? undefined,
              }),
            },
          });
        }
        toast.success(t("cms.articles.toast.create_success"));
        navigate(`/cms/articles/${created.id}`, { replace: true });
      }
    } catch (err) {
      const { message, key, fieldErrors } = parseApiError(err, t);
      (["title", "slug", "category_id", "publish_at", "note"] as const).forEach(
        (f) => {
          if (fieldErrors[f]) form.setError(f, { message: fieldErrors[f] });
        },
      );
      if (!fieldErrors.slug && key === "slug_already_exists")
        form.setError("slug", { message });
      toast.error(message);
    }
  });

  const saving = create.isPending || update.isPending || uploadMedia.isPending;

  if (isEdit && articleQuery.isLoading && !article) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isEdit && articleQuery.isError) {
    return (
      <Alert
        variant="danger"
        message={parseApiError(articleQuery.error, t).message}
      />
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        noValidate
        className="editor-page space-y-5"
        data-editor="article"
      >
        <PageHeader
          title={
            isEdit
              ? t("cms.articles.editor.edit_title")
              : t("cms.articles.editor.new_title")
          }
          subtitle={t("cms.articles.editor.subtitle")}
          breadcrumbs={[
            { labelKey: "nav.cms_articles", to: "/cms/articles" },
            { label: isEdit ? (article?.title ?? "") : t("common.new") },
          ]}
        />
        <EditorActionBar
          center={<LanguageTabs tr={tr} disabled={!isEdit} embedded />}
          left={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => navigate("/cms/articles")}
              >
                <ArrowLeft className="size-4" aria-hidden />
                {t("common.back")}
              </Button>
            </>
          }
        >
          <ArticleStatusBadge status={status} />
          {!isReadOnly && (
            <Button type="submit" loading={saving}>
              <Save className="size-4" aria-hidden />
              {t("common.save")}
            </Button>
          )}
        </EditorActionBar>
        {isReadOnly && (
          <Alert
            variant="info"
            message={t("cms.articles.editor.readonly_hint")}
          />
        )}
        {!tr.isBase && (
          <ArticleTranslationPanel
            tr={tr}
            readOnly={isReadOnly}
            source={{
              title: form.watch("title"),
              slug: form.watch("slug"),
              excerpt: form.watch("excerpt"),
              seoTitle: form.watch("seo_title"),
              seoDescription: form.watch("seo_description"),
            }}
          />
        )}
        <div className="editor-grid" hidden={!tr.isBase}>
          <Card className="editor-main editor-card" id="art-basic">
            <CardHeader className="editor-heading">
              <CardTitle>
                <PenLine className="size-4 text-muted-foreground" aria-hidden />
                {t("cms.articles.editor.content")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="editor-titleblock space-y-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="editor-title">
                      <FormLabel required>
                        {t("cms.articles.field.title")}
                      </FormLabel>
                      <FormControl>
                        <TextField
                          placeholder={t("cms.articles.editor.title_ph")}
                          maxLength={300}
                          disabled={isReadOnly}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Only after the first save: before that the server derives the
                  slug from the title, and an empty box would just invite a
                  worse answer. */}
                {isEdit && article && (
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <SlugField
                          label={t("cms.articles.editor.permalink")}
                          value={field.value}
                          original={article.slug}
                          onChange={field.onChange}
                          canEdit={allowSlugEdit}
                          disabled={isReadOnly}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {isEdit && !allowSlugEdit && !isReadOnly && (
                  <Checkbox
                    id="cms-article-regenerate-slug"
                    label={t("cms.articles.field.regenerate_slug")}
                    checked={regenerate}
                    onChange={(e) => {
                      setRegenerate(e.target.checked);
                      setMediaDirty(true);
                    }}
                  />
                )}
              </div>
              <FormField
                control={form.control}
                name="body_html"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      {t("cms.articles.field.body")}
                    </FormLabel>
                    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                      <RichTextEditor
                        value={field.value}
                        editable={!isReadOnly}
                        ariaLabel={t("cms.articles.field.body")}
                        className="editor-body"
                        extraExtensions={bodyExtensions}
                        renderToolbarExtras={renderBodyToolbar}
                        onChange={(html, json) => {
                          field.onChange(html);
                          setBodyJson(json);
                        }}
                      />
                    </Suspense>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="border-t pt-5">
                <FormField
                  control={form.control}
                  name="excerpt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.articles.field.excerpt")}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          maxLength={500}
                          disabled={isReadOnly}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t("cms.articles.editor.excerpt_hint")}
                </p>
              </div>
            </CardContent>
          </Card>
          <aside
            className="editor-side space-y-4"
            aria-label={t("cms.articles.editor.settings")}
          >
            <Card className="editor-card">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <SlidersHorizontal
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("cms.articles.editor.publish")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {!isReadOnly && (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("cms.articles.field.status")}</FormLabel>
                        <Select<Option>
                          inputId="cms-article-status"
                          aria-label={t("cms.articles.field.status")}
                          options={statusOptions}
                          isClearable={false}
                          value={
                            statusOptions.find(
                              (o) => o.value === field.value,
                            ) ?? null
                          }
                          onChange={(o) => o && field.onChange(o.value)}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("cms.articles.editor.publish_hint")}
                </p>
                {!isReadOnly && status === "scheduled" && (
                  <FormField
                    control={form.control}
                    name="publish_at"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>
                          {t("cms.articles.field.publish_at")}
                        </FormLabel>
                        <FormControl>
                          <DateField withTime {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {!isReadOnly && status === "needs_revision" && (
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>
                          {t("cms.articles.field.note")}
                        </FormLabel>
                        <FormControl>
                          <Textarea rows={2} maxLength={1000} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required={categorize}>
                        {t("cms.articles.field.category")}
                      </FormLabel>
                      <Select<Option>
                        inputId="cms-article-category"
                        aria-label={t("cms.articles.field.category")}
                        options={categoryOptions}
                        isDisabled={isReadOnly}
                        value={
                          categoryOptions.find(
                            (o) => o.value === field.value,
                          ) ?? null
                        }
                        placeholder={t("cms.articles.field.category_ph")}
                        onChange={(o) => field.onChange(o?.value ?? "")}
                      />
                      <FormMessage />
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
                  {t("cms.articles.field.featured")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ImageUpload
                  type="rounded"
                  ratio={16 / 9}
                  width={280}
                  className="editor-image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  showCamera={false}
                  disabled={isReadOnly}
                  value={featured}
                  onChange={(value) => {
                    setFeatured(value);
                    setMediaDirty(true);
                  }}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("cms.articles.editor.featured_hint")}
                </p>
              </CardContent>
            </Card>
          </aside>
          <Card className="editor-wide editor-card" id="art-seo">
            <CardHeader className="editor-heading">
              <CardTitle>
                <Search className="size-4 text-muted-foreground" aria-hidden />
                {t("cms.articles.editor.seo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="editor-seo-preview">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  {t("cms.articles.editor.search_preview")}
                </p>
                <span className="text-xs font-medium text-muted-foreground">
                  {"Zukatek"}
                </span>
                <p className="mt-1 break-words text-lg font-medium text-primary-ink">
                  {form.watch("seo_title") ||
                    form.watch("title") ||
                    t("cms.articles.editor.preview_title")}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {form.watch("seo_description") ||
                    form.watch("excerpt") ||
                    t("cms.articles.editor.preview_description")}
                </p>
              </div>
              <div className="space-y-4">
                {" "}
                <FormField
                  control={form.control}
                  name="seo_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.articles.seo.title")}</FormLabel>
                      <FormControl>
                        <TextField
                          maxLength={255}
                          disabled={isReadOnly}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />{" "}
                <FormField
                  control={form.control}
                  name="seo_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.articles.seo.description")}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          maxLength={500}
                          disabled={isReadOnly}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {" "}
                <FormField
                  control={form.control}
                  name="seo_keywords"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.articles.seo.keywords")}</FormLabel>
                      <FormControl>
                        <TextField
                          maxLength={255}
                          disabled={isReadOnly}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />{" "}
                <FormField
                  control={form.control}
                  name="canonical_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cms.articles.seo.canonical")}</FormLabel>
                      <FormControl>
                        <Input type="url" disabled={isReadOnly} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-wrap items-center gap-5 rounded-lg border bg-muted/20 p-4">
                <Checkbox
                  id="cms-article-noindex"
                  label={t("cms.articles.seo.noindex")}
                  checked={form.watch("seo_noindex")}
                  disabled={isReadOnly}
                  onChange={(e) =>
                    form.setValue("seo_noindex", e.target.checked, {
                      shouldDirty: true,
                    })
                  }
                />
                <Checkbox
                  id="cms-article-nofollow"
                  label={t("cms.articles.seo.nofollow")}
                  checked={form.watch("seo_nofollow")}
                  disabled={isReadOnly}
                  onChange={(e) =>
                    form.setValue("seo_nofollow", e.target.checked, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>
              <div className="border-t pt-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-medium">
                  <Globe2 className="size-4 text-primary-ink" aria-hidden />
                  {t("cms.articles.editor.social")}
                </h3>
                <div className="editor-social">
                  <div className="space-y-4">
                    {" "}
                    <FormField
                      control={form.control}
                      name="og_title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("cms.articles.seo.og_title")}
                          </FormLabel>
                          <FormControl>
                            <TextField
                              maxLength={255}
                              disabled={isReadOnly}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />{" "}
                    <FormField
                      control={form.control}
                      name="og_description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("cms.articles.seo.og_description")}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              rows={2}
                              maxLength={500}
                              disabled={isReadOnly}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium">
                      {t("cms.articles.seo.og_image")}
                    </p>
                    <ImageUpload
                      type="rounded"
                      ratio={16 / 9}
                      width={280}
                      className="editor-image"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      showCamera={false}
                      disabled={isReadOnly}
                      value={og}
                      onChange={(value) => {
                        setOg(value);
                        setMediaDirty(true);
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}
