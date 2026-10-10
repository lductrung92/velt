import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Globe, Save, Undo2 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar";
import { PageHeader } from "@/components/common/PageHeader";
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
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { WidgetInsertControl, WidgetNode } from "../components/inlineWidget";
import {
  LandingDesigner,
  type LandingDesignerHandle,
} from "../components/puck/LandingDesigner";
import { WidgetSelect } from "../components/WidgetSelect";
import {
  EMPTY_SEO,
  normalizeSeo,
  PageSeoSection,
  seoEquals,
} from "../components/PageSeoSection";
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
  // reads cms.article.allow_slug_edit for both). OFF → slug is auto-derived; show
  // a "regenerate from title" toggle instead of a free slug input.
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
  // seo lives outside the form, so fold its changes into the guard.
  const seoDirty = isEdit && !!page && !seoEquals(seo, page.seo);
  useUnsavedGuard(form.formState.isDirty || seoDirty || designDirty);

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
      if (allowSlugEdit) {
        const s = values.slug?.trim();
        if (s) body.slug = s;
      } else if (regenerate) {
        body.regenerate_slug = true;
      }
      // 1) Page fields. On failure, map errors to the page's own fields.
      try {
        await update.mutateAsync({ id: page.id, body });
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
    if (allowSlugEdit && values.slug?.trim()) body.slug = values.slug.trim();
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
      <form onSubmit={onSubmit} noValidate className="space-y-4">
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

        <Card>
          <CardHeader>
            <CardTitle>{t("cms.pages.editor.basic")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    { value: "content", label: t("cms.pages.kind.content") },
                    { value: "landing", label: t("cms.pages.kind.landing") },
                  ]}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("cms.pages.field.title")}</FormLabel>
                  <FormControl>
                    <TextField maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {allowSlugEdit ? (
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("cms.pages.field.slug")}</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={200}
                        placeholder={t("cms.pages.field.slug_ph")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              isEdit && (
                <Checkbox
                  id="cms-page-regenerate-slug"
                  label={t("cms.pages.field.regenerate_slug")}
                  checked={regenerate}
                  onChange={(e) => setRegenerate(e.target.checked)}
                />
              )
            )}
            {!isLandingKind && !isLandingEdit && (
              <FormField
                control={form.control}
                name="body_html"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("cms.pages.field.body")}</FormLabel>
                    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                      <RichTextEditor
                        value={field.value ?? ""}
                        initialJSON={seedJson}
                        extraExtensions={widgetExtensions}
                        renderToolbarExtras={(editor) => (
                          <WidgetInsertControl editor={editor} />
                        )}
                        ariaLabel={t("cms.pages.field.body")}
                        className="[&_.ProseMirror]:min-h-[9.3rem]"
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

        <PageSeoSection value={seo} onChange={setSeo} />
      </form>
    </Form>
  );
}
