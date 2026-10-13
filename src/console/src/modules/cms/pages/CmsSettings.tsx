import { RotateCw, Save } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PageHeader } from "@/components/common/PageHeader";
import { Select, type SelectOption } from "@/components/common/Select/Select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePermission } from "@/modules/auth";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { parseApiError } from "@/utils/apiError";

import { useCmsSettings, useUpdateCmsSettings } from "../hooks/useCmsSettings";
import { usePages } from "../hooks/useCmsPages";
import type { CmsSettingsView } from "../services/cmsSettings.service";
import type { PageNode } from "../services/pages.service";

// Registry key for the slug of the page served as the public homepage ("/").
const HOME_SLUG_KEY = "cms.home_page_slug";

// How long the site may serve a page from its own cache (seconds, 0 = never).
const TTL_KEY = "site.cache_ttl_seconds";

// The chrome is one record that lives in the settings table, so its
// translations are stored against a fixed id (translation.SiteChromeID).
const SITE_CHROME_ID = "00000000-0000-0000-0000-00005174e000";

// Which languages the site offers. They belong to the translation module and
// arrive in their own group; this is the only screen that shows them, because
// the alternative — the one that was in force until now — is editing the
// database by hand to add a language.
const TR_ENABLED_KEY = "translation.enabled";
const TR_LOCALES_KEY = "translation.locales";

// The site's chrome: the words around the navigation, which belong to no
// article or page. The links themselves are edited in the menu builder.
// Empty means "keep the copy the site ships with", so clearing a field is a
// way back to the default rather than a way to blank the page.
const SITE_FIELDS = [
  { key: "site.brand_tagline", name: "brand_tagline", multiline: true },
  { key: "site.footer_note_title", name: "footer_note_title" },
  { key: "site.footer_note_text", name: "footer_note_text", multiline: true },
  { key: "site.footer_copyright", name: "footer_copyright" },
  { key: "site.header_cta_label", name: "header_cta_label" },
  { key: "site.header_cta_url", name: "header_cta_url" },
] as const;

// Flatten the page tree into slug options, indenting nested pages so the
// hierarchy reads in a flat <Select>. value = slug (what the web resolves "/" by).
function pageSlugOptions(tree: PageNode[], depth = 0): SelectOption[] {
  return tree.flatMap((p) => [
    { value: p.slug, label: "— ".repeat(depth) + p.title },
    ...pageSlugOptions(p.children, depth + 1),
  ]);
}

// The five CMS feature flags (registry group "cms"). `key` is the registry key;
// label/help are i18n keys; `default` seeds the toggle when the key is missing
// from the response. Order = article create → workflow → slug → publish →
// newsletter. Source of truth: docs/domains/cms/business-rules.md §9.
const FLAGS = [
  {
    key: "cms.article.categorize",
    labelKey: "cms.settings.article_categorize.label",
    helpKey: "cms.settings.article_categorize.help",
    default: true,
  },
  {
    key: "cms.article.require_review",
    labelKey: "cms.settings.article_require_review.label",
    helpKey: "cms.settings.article_require_review.help",
    default: true,
  },
  {
    key: "cms.article.allow_slug_edit",
    labelKey: "cms.settings.article_allow_slug_edit.label",
    helpKey: "cms.settings.article_allow_slug_edit.help",
    default: true,
  },
  {
    key: "cms.publish.allow_now",
    labelKey: "cms.settings.publish_allow_now.label",
    helpKey: "cms.settings.publish_allow_now.help",
    default: true,
  },
  {
    key: "cms.newsletter.notify_on_publish",
    labelKey: "cms.settings.newsletter_notify.label",
    helpKey: "cms.settings.newsletter_notify.help",
    default: false,
  },
] as const;

export default function CmsSettings() {
  const { t } = useTranslation();
  const settings = useCmsSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("cms.settings.title")}
        subtitle={t("cms.settings.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_settings" }]}
      />
      {settings.isLoading ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {FLAGS.map((f) => (
              <Skeleton key={f.key} className="h-16 w-full" />
            ))}
            <Skeleton className="h-9 w-24" />
          </CardContent>
        </Card>
      ) : settings.isError || !settings.data ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Alert
              variant="danger"
              message={parseApiError(settings.error, t).message}
            />
            <Button
              variant="outline"
              loading={settings.isFetching}
              onClick={() => void settings.refetch()}
            >
              <RotateCw className="size-4" />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SettingsBody data={settings.data} />
      )}
    </div>
  );
}

// Read every flag's current value from the "cms" group, falling back to its
// registry default when the key is absent.
function buildInitial(data: CmsSettingsView): Record<string, boolean> {
  const byKey = new Map((data.cms ?? []).map((e) => [e.key, e.value]));
  const out: Record<string, boolean> = {};
  for (const f of FLAGS) {
    out[f.key] = byKey.has(f.key) ? Boolean(byKey.get(f.key)) : f.default;
  }
  return out;
}

// A value from any group of the response.
function readValue(data: CmsSettingsView, key: string): unknown {
  for (const entries of Object.values(data)) {
    const hit = (entries ?? []).find((e) => e.key === key);
    if (hit) return hit.value;
  }
  return undefined;
}

// Current homepage slug from the "cms" group ("" when unset → built-in home).
function readHomeSlug(data: CmsSettingsView): string {
  const v = (data.cms ?? []).find((e) => e.key === HOME_SLUG_KEY)?.value;
  return typeof v === "string" ? v : "";
}

// Every string setting on this screen, read as text (missing → empty).
function readTexts(data: CmsSettingsView): Record<string, string> {
  const byKey = new Map((data.cms ?? []).map((e) => [e.key, e.value]));
  const out: Record<string, string> = {};
  for (const f of SITE_FIELDS) {
    const v = byKey.get(f.key);
    out[f.key] = typeof v === "string" ? v : "";
  }
  const ttl = byKey.get(TTL_KEY);
  out[TTL_KEY] = typeof ttl === "number" ? String(ttl) : "";
  const locales = readValue(data, TR_LOCALES_KEY);
  out[TR_LOCALES_KEY] = typeof locales === "string" ? locales : "";
  return out;
}

function SettingsBody({ data }: { data: CmsSettingsView }) {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("cms.settings.manage");

  const initial = useMemo(() => buildInitial(data), [data]);
  const initialLanguages = readValue(data, TR_ENABLED_KEY) === true;
  const [languages, setLanguages] = useState(initialLanguages);
  useEffect(() => setLanguages(initialLanguages), [initialLanguages]);
  const [draft, setDraft] = useState<Record<string, boolean>>(initial);
  // Resync after a successful save (cache reseeded with the fresh view).
  useEffect(() => setDraft(initial), [initial]);

  // Homepage slug (a string setting) is tracked separately from the boolean flags.
  const initialHomeSlug = useMemo(() => readHomeSlug(data), [data]);
  const [homeSlug, setHomeSlug] = useState(initialHomeSlug);
  useEffect(() => setHomeSlug(initialHomeSlug), [initialHomeSlug]);

  // The site's cache TTL and chrome copy (all strings while being edited).
  const initialTexts = useMemo(() => readTexts(data), [data]);
  const [texts, setTexts] = useState(initialTexts);
  useEffect(() => setTexts(initialTexts), [initialTexts]);

  // Page options for the homepage picker (value = slug).
  const pagesQuery = usePages();
  const pageOptions = useMemo(
    () => pageSlugOptions(pagesQuery.data ?? []),
    [pagesQuery.data],
  );
  const selectedHome =
    pageOptions.find((o) => o.value === homeSlug) ??
    (homeSlug ? { value: homeSlug, label: homeSlug } : null);

  /*
   * The chrome in the site's other languages.
   *
   * The same six boxes, bound to the translation draft instead of the settings
   * draft while a second language is selected — one form, one Save, and no
   * second screen to keep in step with this one.
   */
  const tr = useEntityTranslation("site_chrome", SITE_CHROME_ID);
  const showLanguages = tr.enabled && tr.tabs.length > 1;
  const translating = showLanguages && !tr.isBase;

  const update = useUpdateCmsSettings();
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    FLAGS.some((f) => draft[f.key] !== initial[f.key]) ||
    homeSlug !== initialHomeSlug ||
    Object.keys(initialTexts).some((k) => texts[k] !== initialTexts[k]) ||
    languages !== initialLanguages ||
    tr.dirty;

  function save() {
    setSaveError(null);
    // Translations have their own endpoint; store them first so one Save
    // writes both halves, the way every editor screen does it.
    void tr.flush(SITE_CHROME_ID);
    const updates: Record<string, boolean | string | number> = {};
    for (const f of FLAGS) {
      if (draft[f.key] !== initial[f.key]) updates[f.key] = draft[f.key];
    }
    // Empty string clears the homepage override (web falls back to built-in home).
    if (homeSlug !== initialHomeSlug) updates[HOME_SLUG_KEY] = homeSlug;
    for (const f of SITE_FIELDS) {
      if (texts[f.key] !== initialTexts[f.key]) updates[f.key] = texts[f.key];
    }
    if (languages !== initialLanguages) updates[TR_ENABLED_KEY] = languages;
    if (texts[TR_LOCALES_KEY] !== initialTexts[TR_LOCALES_KEY]) {
      updates[TR_LOCALES_KEY] = texts[TR_LOCALES_KEY];
    }
    // The TTL is the one number here; an unreadable box is left alone rather
    // than written as 0, which would silently switch the site's cache off.
    if (texts[TTL_KEY] !== initialTexts[TTL_KEY]) {
      const ttl = Number(texts[TTL_KEY]);
      if (Number.isFinite(ttl) && texts[TTL_KEY].trim() !== "") {
        updates[TTL_KEY] = ttl;
      }
    }
    if (Object.keys(updates).length === 0) return;
    update.mutate(updates, {
      onSuccess: () => toast.success(t("cms.settings.saved")),
      onError: (err) => {
        const parsed = parseApiError(err, t);
        // 403/422 are actionable → top banner; transient 5xx/network → toast.
        if (parsed.code >= 500) toast.error(parsed.message);
        else setSaveError(parsed.message);
      },
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Homepage picker (first) — a string setting; pick which published page
            serves "/". Clearing it reverts the web to its built-in home. */}
        <div className="space-y-1 rounded-md border p-4">
          <Label htmlFor="cms-home-slug" className="text-sm font-medium">
            {t("cms.settings.homepage.label")}
          </Label>
          <p className="pb-1 text-xs text-muted-foreground">
            {t("cms.settings.homepage.help")}
          </p>
          <Select
            inputId="cms-home-slug"
            options={pageOptions}
            value={selectedHome}
            isLoading={pagesQuery.isLoading}
            isDisabled={!canManage || update.isPending}
            isClearable
            placeholder={t("cms.settings.homepage.placeholder")}
            onChange={(o) => setHomeSlug(o?.value ?? "")}
          />
        </div>

        {FLAGS.map((f) => {
          const id = `cms-flag-${f.key}`;
          const help = t(f.helpKey);
          return (
            <div
              key={f.key}
              className="flex items-start justify-between gap-3 rounded-md border p-4"
            >
              <div className="space-y-1">
                <Label
                  htmlFor={id}
                  className="text-sm font-medium leading-none"
                >
                  {t(f.labelKey)}
                </Label>
                <p id={`${id}-help`} className="text-xs text-muted-foreground">
                  {help}
                </p>
              </div>
              <Switch
                id={id}
                checked={draft[f.key]}
                disabled={!canManage || update.isPending}
                aria-describedby={`${id}-help`}
                onCheckedChange={(c) => setDraft((d) => ({ ...d, [f.key]: c }))}
              />
            </div>
          );
        })}

        {/* Which languages the site serves. The switch and the list are the
            translation module's own settings; they live here because this is
            the screen that owns everything else about the public site. */}
        <div className="!mt-6 space-y-3 rounded-md border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="tr-enabled" className="text-sm font-medium">
                {t("cms.settings.languages.label")}
              </Label>
              <p id="tr-enabled-help" className="text-xs text-muted-foreground">
                {t("cms.settings.languages.help")}
              </p>
            </div>
            <Switch
              id="tr-enabled"
              checked={languages}
              disabled={!canManage || update.isPending}
              aria-describedby="tr-enabled-help"
              onCheckedChange={setLanguages}
            />
          </div>
          {languages && (
            <div className="space-y-1">
              <Label htmlFor="tr-locales" className="text-sm font-medium">
                {t("cms.settings.languages.list_label")}
              </Label>
              <p className="pb-1 text-xs text-muted-foreground">
                {t("cms.settings.languages.list_help")}
              </p>
              <Input
                id="tr-locales"
                className="max-w-60"
                value={texts[TR_LOCALES_KEY]}
                disabled={!canManage || update.isPending}
                placeholder="en"
                onChange={(e) =>
                  setTexts((v) => ({ ...v, [TR_LOCALES_KEY]: e.target.value }))
                }
              />
            </div>
          )}
        </div>

        {/* The site's chrome. Links live in the menu builder; these are the
            words beside them, plus how long the site may cache a page. */}
        <div className="!mt-6 space-y-4 rounded-md border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium leading-none">
                {t("cms.settings.site.title")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {translating
                  ? t("cms.settings.site.help_translate")
                  : t("cms.settings.site.help")}
              </p>
            </div>
            {showLanguages && (
              <div className="flex gap-1" role="group" aria-label={t("tr.tabs")}>
                {tr.tabs.map((locale) => (
                  <Button
                    key={locale}
                    type="button"
                    size="sm"
                    variant={locale === tr.locale ? "secondary" : "ghost"}
                    aria-pressed={locale === tr.locale}
                    disabled={!canManage || update.isPending}
                    onClick={() => tr.setLocale(locale)}
                  >
                    {locale.toUpperCase()}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1" hidden={translating}>
            <Label htmlFor="site-cache-ttl" className="text-sm font-medium">
              {t("cms.settings.site.cache_ttl.label")}
            </Label>
            <p className="pb-1 text-xs text-muted-foreground">
              {t("cms.settings.site.cache_ttl.help")}
            </p>
            <Input
              id="site-cache-ttl"
              type="number"
              min={0}
              max={86400}
              className="max-w-40"
              value={texts[TTL_KEY]}
              disabled={!canManage || update.isPending}
              onChange={(e) =>
                setTexts((v) => ({ ...v, [TTL_KEY]: e.target.value }))
              }
            />
          </div>

          {SITE_FIELDS.map((f) => {
            const id = `site-${f.name}`;
            const translated =
              typeof tr.values[f.name] === "string"
                ? (tr.values[f.name] as string)
                : "";
            const common = {
              id,
              value: translating ? translated : texts[f.key],
              disabled: !canManage || update.isPending,
              // In another language the Vietnamese text is the placeholder: an
              // empty box means "use it", which is exactly what the site does.
              placeholder: translating
                ? texts[f.key] || t(`cms.settings.site.${f.name}.placeholder`)
                : t(`cms.settings.site.${f.name}.placeholder`),
              onChange: (
                e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
              ) =>
                translating
                  ? tr.setField(f.name, e.target.value)
                  : setTexts((v) => ({ ...v, [f.key]: e.target.value })),
            };
            return (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={id} className="text-sm font-medium">
                  {t(`cms.settings.site.${f.name}.label`)}
                </Label>
                <p className="pb-1 text-xs text-muted-foreground">
                  {t(`cms.settings.site.${f.name}.help`)}
                </p>
                {f.multiline ? (
                  <Textarea rows={2} maxLength={500} {...common} />
                ) : (
                  <TextField maxLength={300} {...common} />
                )}
              </div>
            );
          })}
        </div>

        {canManage && (
          <div className="!mt-6">
            {saveError && (
              <Alert className="mb-3" variant="danger" message={saveError} />
            )}
            <div className="flex justify-end">
              <Button
                loading={update.isPending}
                disabled={!dirty}
                onClick={save}
              >
                <Save className="size-4" />
                {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
