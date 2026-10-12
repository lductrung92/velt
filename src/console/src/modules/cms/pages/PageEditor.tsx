import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Globe,
  Globe2,
  Languages,
  Lock,
  PenLine,
  Save,
  Search,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar";
import { PageHeader } from "@/components/common/PageHeader";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { usePermission } from "@/modules/auth";
import { LanguageTabs } from "@/modules/translation/components/LanguageTabs";
import { TranslatedField } from "@/modules/translation/components/TranslatedField";
import {
  useEntityTranslation,
  type EntityTranslation,
} from "@/modules/translation/hooks/useEntityTranslation";
import { parseApiError } from "@/utils/apiError";

import { WidgetInsertControl, WidgetNode } from "../components/inlineWidget";
import {
  LandingDesigner,
  type LandingDesignerHandle,
} from "../components/puck/LandingDesigner";
import { PageStatusBadge } from "../components/PageStatusBadge";
import { WidgetSelect } from "../components/WidgetSelect";
import { EMPTY_SEO, normalizeSeo, seoEquals } from "../components/pageSeo";
import { useCmsSettings } from "../hooks/useCmsSettings";
import { useLanding } from "../hooks/useCmsLanding";
import {
  useCreatePage,
  usePage,
  usePublishPage,
  useUpdatePage,
} from "../hooks/useCmsPages";
import type {
  CreatePageBody,
  PageKind,
  PageSEO,
  UpdatePageBody,
} from "../services/pages.service";
import "@/styles/editor-page.css";
import "./page-editor.css";

const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({
    default: m.RichTextEditor,
  })),
);

const makeSchema = (t: (k: string) => string) =>
  z.object({
    title: z.string().trim().min(1, t("errors.validation.required")),
    slug: z.string().optional(),
    body_html: z.string().optional(),
  });
type PageFormValues = z.infer<ReturnType<typeof makeSchema>>;

// The page's SEO fields, in the order the article editor shows its own: what the
// search result is built from first, then the pair that only speaks to crawlers,
// then the social card.
const SEO_MAIN = [
  { key: "title", max: 255, multiline: false },
  { key: "description", max: 500, multiline: true },
] as const;
const SEO_TECHNICAL = [
  { key: "keywords", max: 255, multiline: false },
  { key: "canonical_url", max: 500, multiline: false },
] as const;
const SEO_SOCIAL = [
  { key: "og_title", max: 255, multiline: false },
  { key: "og_description", max: 500, multiline: true },
] as const;
type SeoRow = (
  | typeof SEO_MAIN
  | typeof SEO_TECHNICAL
  | typeof SEO_SOCIAL
)[number];

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function PageEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { hasPermission } = usePermission();
  const canPublish = hasPermission("cms.page.publish");
  const canDesign = hasPermission("cms.landing.manage");

  const pageQuery = usePage(id);
  const page = pageQuery.data;
  const settingsQuery = useCmsSettings(true);
  const create = useCreatePage();
  const update = useUpdatePage();
  const publish = usePublishPage();

  // A landing page being edited: the body editor is hidden and the visual (Puck)
  // builder is embedded inline (no separate /design screen). Its design is loaded
  // here and saved together with the page fields on the single Save.
  const isLandingEdit = isEdit && !!page?.landing_id;
  const landingQuery = useLanding(page?.landing_id ?? undefined);
  const designerRef = useRef<LandingDesignerHandle>(null);
  const [savingDesign, setSavingDesign] = useState(false);
  // Puck design edits live inside LandingDesigner, so surface their dirtiness here
  // to fold into the unsaved-changes guard (cleared on a successful save).
  const [designDirty, setDesignDirty] = useState(false);

  // Pages share the CMS slug-edit flag with articles (backend Base.AllowSlugEdit
  // reads cms.article.allow_slug_edit for both). OFF → the permalink has no way
  // in; offer a "regenerate from title" toggle instead.
  const allowSlugEdit = (() => {
    const e = settingsQuery.data?.cms?.find(
      (x) => x.key === "cms.article.allow_slug_edit",
    );
    return e ? Boolean(e.value) : true;
  })();
  const [regenerate, setRegenerate] = useState(false);

  // kind (create only): "landing" → backend auto-creates + attaches a landing;
  // the body editor is hidden (design happens inline once the page is created).
  const [kind, setKind] = useState<PageKind>("content");
  const isLandingKind = !isEdit && kind === "landing";

  // SEO — whole-object replace on save; kept outside the form (no field rules).
  const [seo, setSeo] = useState<PageSEO>(EMPTY_SEO);

  const [bodyJson, setBodyJson] = useState<Record<string, unknown> | null>(
    null,
  );
  // seedJson is the editor's load seed (set once per page load); kept separate
  // from bodyJson (the live save payload, updated on every keystroke) so live
  // edits don't re-seed and jump the caret. The inline-widget node lives here.
  const [seedJson, setSeedJson] = useState<Record<string, unknown> | null>(
    null,
  );
  const widgetExtensions = useMemo(() => [WidgetNode], []);
  // Seed the form once per page id — NOT on every `page` identity change (a save
  // re-seeds the detail cache, which would otherwise reset in-progress edits).
  const seededId = useRef<string | null>(null);

  const form = useForm<PageFormValues>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: { title: "", slug: "", body_html: "" },
    mode: "onTouched",
  });
  // Translations live outside this form: their shape is locale x declared field,
  // which a static zod schema cannot describe — the same reason the SEO state
  // sits outside it.
  const tr = useEntityTranslation("page", page?.id);
  // seo lives outside the form, so fold its changes into the guard.
  const seoDirty = isEdit && !!page && !seoEquals(seo, page.seo);
  useUnsavedGuard(
    form.formState.isDirty || seoDirty || designDirty || tr.dirty,
  );

  useEffect(() => {
    if (!page || seededId.current === page.id) return;
    seededId.current = page.id;
    form.reset({
      title: page.title,
      slug: page.slug,
      body_html: page.body_html ?? "",
    });
    setSeo(page.seo ?? EMPTY_SEO);
    const json = (page.body_json as Record<string, unknown> | null) ?? null;
    setBodyJson(json);
    setSeedJson(json);
  }, [page, form]);

  // mapPageFieldError maps a page-save failure onto its form fields.
  const mapPageFieldError = (err: unknown) => {
    const { message, key, fieldErrors } = parseApiError(err, t);
    (["title", "slug"] as const).forEach((f) => {
      if (fieldErrors[f]) form.setError(f, { message: fieldErrors[f] });
    });
    if (!fieldErrors.slug && key === "slug_already_exists")
      form.setError("slug", { message });
    toast.error(message);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (isEdit && page) {
      const body: UpdatePageBody = {
        updated_at: page.updated_at,
        title: values.title.trim(),
        body_html: values.body_html ?? "",
        body_json: bodyJson ?? undefined,
        // No attach UI (content pages use inline widgets instead) — preserve
        // whatever landing the page already owns.
        landing_id: page.landing_id ?? null,
        seo: normalizeSeo(seo),
      };
      // Only when it actually changed: sending the current slug back on every
      // save would re-run the rename path for nothing, and a slug is an address
      // people already hold.
      const nextSlug = values.slug?.trim();
      if (allowSlugEdit && nextSlug && nextSlug !== page.slug) {
        body.slug = nextSlug;
      } else if (!allowSlugEdit && regenerate) {
        body.regenerate_slug = true;
      }
      // 1) Page fields. On failure, map errors to the page's own fields.
      try {
        // Before the page write, not after: publishing reads the stored
        // translations, so the other order would publish the previous ones and
        // force a second Save to get this one onto the site.
        await tr.flush(page.id);
        await update.mutateAsync({ id: page.id, body });
        await tr.refresh();
      } catch (err) {
        mapPageFieldError(err);
        return;
      }
      // 2) Embedded design (landing). Runs after the page update; its errors are
      // NOT page-field errors, so surface a design-specific message rather than
      // mis-mapping section errors onto title/slug. The page fields DID save.
      if (isLandingEdit && canDesign && designerRef.current) {
        setSavingDesign(true);
        try {
          await designerRef.current.save();
        } catch (err) {
          toast.error(
            t("cms.pages.design.save_failed", {
              defaultValue: parseApiError(err, t).message,
            }),
          );
          return;
        } finally {
          setSavingDesign(false);
        }
      }
      // Clean save → clear dirtiness so the unsaved-changes guard doesn't fire.
      form.reset(values);
      setDesignDirty(false);
      toast.success(t("cms.pages.toast.saved"));
      return;
    }

    const body: CreatePageBody = {
      title: values.title.trim(),
      kind,
      seo: normalizeSeo(seo),
    };
    if (kind !== "landing") {
      // Content page: rich-text body (dynamic blocks come from inline widgets,
      // not a landing attachment).
      body.body_html = values.body_html ?? "";
      body.body_json = bodyJson ?? undefined;
    }
    try {
      const created = await create.mutateAsync(body);
      toast.success(t("cms.pages.toast.created"));
      // Landing or content, editing continues on the same page editor; a landing
      // now shows its Puck builder inline (no separate screen).
      navigate(`/cms/pages/${created.id}`, { replace: true });
    } catch (err) {
      mapPageFieldError(err);
    }
  });

  function togglePublish() {
    if (!page) return;
    const goPublish = page.status !== "published";
    publish.mutate(
      { id: page.id, publish: goPublish },
      {
        onSuccess: () =>
          toast.success(
            t(
              goPublish
                ? "cms.pages.toast.published"
                : "cms.pages.toast.unpublished",
            ),
          ),
        onError: (e) => toast.error(parseApiError(e, t).message),
      },
    );
  }

  const saving = create.isPending || update.isPending || savingDesign;
  const status = useMemo(() => page?.status ?? "draft", [page]);

  // The SEO fields carry no validation rules of their own, so they are rendered
  // from one row shape rather than through FormField.
  const seoRow = ({ key, max, multiline }: SeoRow) => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`cms-page-seo-${key}`}>{t(`cms.pages.seo.${key}`)}</Label>
      {multiline ? (
        <Textarea
          id={`cms-page-seo-${key}`}
          rows={2}
          maxLength={max}
          value={seo[key] ?? ""}
          onChange={(e) => setSeo({ ...seo, [key]: e.target.value })}
        />
      ) : (
        <Input
          id={`cms-page-seo-${key}`}
          type={key === "canonical_url" ? "url" : "text"}
          maxLength={max}
          value={seo[key] ?? ""}
          onChange={(e) => setSeo({ ...seo, [key]: e.target.value })}
        />
      )}
    </div>
  );

  if (isEdit && pageQuery.isLoading && !page) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isEdit && pageQuery.isError) {
    return (
      <Alert
        variant="danger"
        message={parseApiError(pageQuery.error, t).message}
      />
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        noValidate
        className="editor-page space-y-5"
        data-editor="page"
      >
        <PageHeader
          title={
            isEdit
              ? t("cms.pages.editor.edit_title")
              : t("cms.pages.editor.new_title")
          }
          breadcrumbs={[
            { labelKey: "nav.cms_pages", to: "/cms/pages" },
            { label: isEdit ? (page?.title ?? "") : t("common.new") },
          ]}
        />

        <EditorActionBar
          center={<LanguageTabs tr={tr} disabled={!isEdit} embedded />}
          left={
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/cms/pages")}
            >
              <ArrowLeft className="size-4" />
              {t("common.back")}
            </Button>
          }
        >
          {isEdit && canPublish && (
            <Button
              type="button"
              variant="outline"
              loading={publish.isPending}
              onClick={togglePublish}
            >
              {status === "published" ? (
                <Undo2 className="size-4" />
              ) : (
                <Globe className="size-4" />
              )}
              {status === "published"
                ? t("cms.pages.unpublish")
                : t("cms.pages.publish")}
            </Button>
          )}
          <Button type="submit" loading={saving}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </EditorActionBar>

        {!tr.isBase && (
          <PageTranslationPanel
            tr={tr}
            showBody={!isLandingEdit}
            source={{
              title: form.watch("title"),
              slug: form.watch("slug") ?? "",
              bodyHtml: form.watch("body_html") ?? "",
              seoTitle: seo.title ?? "",
              seoDescription: seo.description ?? "",
            }}
          />
        )}

        {/* The source-language form stays mounted while another language is on
            screen: unmounting it would drop edits in progress and re-seed the
            Puck designer on every tab switch. */}
        <div className="space-y-5" hidden={!tr.isBase}>
          <div className="editor-grid">
            <Card className="editor-main editor-card" id="page-basic">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <PenLine
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("cms.pages.editor.content")}
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
                          {t("cms.pages.field.title")}
                        </FormLabel>
                        <FormControl>
                          <TextField maxLength={200} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Only after the first save: before that the server derives
                      the slug from the title, and an empty box would just invite
                      a worse answer. */}
                  {isEdit && page && (
                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <SlugField
                            label={t("cms.pages.editor.permalink")}
                            value={field.value ?? ""}
                            original={page.slug}
                            onChange={field.onChange}
                            canEdit={allowSlugEdit}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {isEdit && !allowSlugEdit && (
                    <Checkbox
                      id="cms-page-regenerate-slug"
                      label={t("cms.pages.field.regenerate_slug")}
                      checked={regenerate}
                      onChange={(e) => setRegenerate(e.target.checked)}
                    />
                  )}
                </div>
                {!isLandingKind && !isLandingEdit && (
                  <FormField
                    control={form.control}
                    name="body_html"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("cms.pages.field.body")}</FormLabel>
                        <Suspense
                          fallback={<Skeleton className="h-40 w-full" />}
                        >
                          <RichTextEditor
                            value={field.value ?? ""}
                            initialJSON={seedJson}
                            extraExtensions={widgetExtensions}
                            renderToolbarExtras={(editor) => (
                              <WidgetInsertControl editor={editor} />
                            )}
                            ariaLabel={t("cms.pages.field.body")}
                            className="editor-body"
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
                )}
              </CardContent>
            </Card>

            <aside
              className="editor-side space-y-4"
              aria-label={t("cms.pages.editor.settings")}
            >
              <Card className="editor-card">
                <CardHeader className="editor-heading">
                  <CardTitle>
                    <SlidersHorizontal
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    {t("cms.pages.editor.settings")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!isEdit && (
                    <div className="space-y-1.5">
                      <Label htmlFor="cms-page-kind">
                        {t("cms.pages.kind.label")}
                      </Label>
                      <WidgetSelect
                        inputId="cms-page-kind"
                        ariaLabel={t("cms.pages.kind.label")}
                        value={kind}
                        onChange={(v) => setKind(v as PageKind)}
                        options={[
                          {
                            value: "content",
                            label: t("cms.pages.kind.content"),
                          },
                          {
                            value: "landing",
                            label: t("cms.pages.kind.landing"),
                          },
                        ]}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("cms.pages.editor.kind_hint")}
                      </p>
                    </div>
                  )}
                  {isEdit && (
                    <div className="space-y-2">
                      <Label>{t("cms.pages.field.status")}</Label>
                      <div>
                        <PageStatusBadge status={status} />
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("cms.pages.editor.publish_hint")}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>

            <Card className="editor-wide editor-card" id="page-seo">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <Search
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("cms.pages.seo.heading")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="editor-seo-preview">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    {t("cms.pages.editor.search_preview")}
                  </p>
                  <span className="text-xs font-medium text-muted-foreground">
                    {"Zukatek"}
                  </span>
                  <p className="mt-1 break-words text-lg font-medium text-primary">
                    {seo.title ||
                      form.watch("title") ||
                      t("cms.pages.editor.preview_title")}
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                    {seo.description ||
                      t("cms.pages.editor.preview_description")}
                  </p>
                </div>
                <div className="space-y-4">{SEO_MAIN.map(seoRow)}</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {SEO_TECHNICAL.map(seoRow)}
                </div>
                <div className="flex flex-wrap items-center gap-5 rounded-lg border bg-muted/20 p-4">
                  {(["noindex", "nofollow"] as const).map((f) => (
                    <Checkbox
                      key={f}
                      id={`cms-page-seo-${f}`}
                      label={t(`cms.pages.seo.${f}`)}
                      checked={seo[f]}
                      onChange={(e) =>
                        setSeo({ ...seo, [f]: e.target.checked })
                      }
                    />
                  ))}
                </div>
                <div className="border-t pt-5">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <Globe2 className="size-4 text-primary" aria-hidden />
                    {t("cms.pages.editor.social")}
                  </h3>
                  <div className="space-y-4">{SEO_SOCIAL.map(seoRow)}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {isLandingEdit &&
            (!canDesign ? (
              <Alert
                variant="info"
                message={t("cms.pages.design.no_permission")}
              />
            ) : landingQuery.isError ? (
              <Alert
                variant="danger"
                message={parseApiError(landingQuery.error, t).message}
              />
            ) : landingQuery.isLoading || !landingQuery.data ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <LandingDesigner
                key={landingQuery.data.id}
                ref={designerRef}
                detail={landingQuery.data}
                onDirty={() => setDesignDirty(true)}
              />
            ))}
        </div>
      </form>
    </Form>
  );
}

interface PageSource {
  title: string;
  slug: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
}

/**
 * The page form for a non-source language.
 *
 * It reuses the same three grid areas as the Vietnamese form — content, side,
 * SEO — so switching language moves nothing on screen. Only the fields that may
 * be translated appear: the publish state and a landing design belong to the
 * page, not to one of its languages.
 */
function PageTranslationPanel({
  tr,
  source,
  showBody,
}: {
  tr: EntityTranslation;
  source: PageSource;
  /** A landing page has no rich-text body — its design is not translated. */
  showBody: boolean;
}) {
  const { t } = useTranslation();
  // Every label here is rendered in the language being written, not in the
  // console's own. Typing English into boxes labelled in Vietnamese is exactly
  // how a translator ends up filling the wrong one.
  const tl = (key: string) => t(key, { lng: tr.locale });
  const seo = (tr.values.seo ?? {}) as Record<string, unknown>;
  const setSeo = (key: string, value: string) =>
    tr.setField("seo", { ...seo, [key]: value });

  return (
    <div className="editor-grid">
      <Card className="editor-main editor-card">
        <CardHeader className="editor-heading">
          <CardTitle>
            <PenLine className="size-4 text-muted-foreground" aria-hidden />
            {tl("cms.pages.editor.content")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="editor-titleblock space-y-2">
            <TranslatedField
              id="tr-page-title"
              className="editor-title"
              label={tl("cms.pages.field.title")}
            >
              <TextField
                id="tr-page-title"
                value={str(tr.values.title)}
                maxLength={200}
                onChange={(e) => tr.setField("title", e.target.value)}
              />
            </TranslatedField>

            {/* Same row, same place as the source form: a translator should not
                have to learn a second layout to change a URL. Left empty, this
                language keeps the source language's address. */}
            <div>
              <SlugField
                label={tl("cms.pages.editor.permalink")}
                value={str(tr.values.slug)}
                original={str(tr.values.slug)}
                emptyValue={source.slug}
                locale={tr.locale}
                onChange={(v) => tr.setField("slug", v)}
              />
              {/* Only while there is nothing here: once a slug is set, the hint
                  describes a state the page is no longer in. */}
              {!str(tr.values.slug) && (
                <p className="tr-caption mt-1.5">{tl("tr.slug_hint")}</p>
              )}
            </div>
          </div>

          {showBody && (
            <div>
              {/* Two headings on one row so each column is labelled: the editor
                  on the left, the Vietnamese it is being translated from on the
                  right. */}
              <div className="tr-body-heads">
                <p className="text-sm font-medium leading-none">
                  {tl("cms.pages.field.body")}
                </p>
                <span className="tr-caption">{tl("tr.source")}</span>
              </div>
              <div className="tr-body">
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <RichTextEditor
                    value={str(tr.values.body_html)}
                    ariaLabel={tl("cms.pages.field.body")}
                    className="editor-body"
                    onChange={(html) => tr.setField("body_html", html)}
                  />
                </Suspense>
                <div
                  className="tr-body-source"
                  // The source body is the editor's own sanitised output, read
                  // back for reference only.
                  dangerouslySetInnerHTML={{
                    __html:
                      source.bodyHtml || `<p>${tl("tr.source_empty")}</p>`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <aside className="editor-side space-y-5">
        <Card className="editor-card">
          <CardHeader className="editor-heading">
            <CardTitle>
              <Lock className="size-4 text-muted-foreground" aria-hidden />
              {tl("tr.shared_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="tr-shared">
              <li>{tl("cms.pages.field.status")}</li>
              <li>{tl("cms.pages.kind.label")}</li>
              <li>{tl("cms.pages.seo.canonical_url")}</li>
            </ul>
          </CardContent>
        </Card>
      </aside>

      <Card className="editor-wide editor-card">
        <CardHeader className="editor-heading">
          <CardTitle>
            <Search className="size-4 text-muted-foreground" aria-hidden />
            {tl("cms.pages.seo.heading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="editor-seo-preview">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Languages className="size-3.5" aria-hidden />
              {tl("cms.pages.editor.search_preview")}
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
                str(tr.values.title) ||
                source.title}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
              {str(seo.description) || source.seoDescription}
            </p>
          </div>

          <TranslatedField
            id="tr-page-seo-title"
            label={tl("cms.pages.seo.title")}
          >
            <TextField
              id="tr-page-seo-title"
              value={str(seo.title)}
              maxLength={255}
              onChange={(e) => setSeo("title", e.target.value)}
            />
          </TranslatedField>

          <TranslatedField
            id="tr-page-seo-desc"
            label={tl("cms.pages.seo.description")}
          >
            <Textarea
              id="tr-page-seo-desc"
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
