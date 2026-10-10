import { RotateCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PageHeader } from "@/components/common/PageHeader";
import { Select, type SelectOption } from "@/components/common/Select/Select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { useCmsSettings, useUpdateCmsSettings } from "../hooks/useCmsSettings";
import { usePages } from "../hooks/useCmsPages";
import type { CmsSettingsView } from "../services/cmsSettings.service";
import type { PageNode } from "../services/pages.service";

// Registry key for the slug of the page served as the public homepage ("/").
const HOME_SLUG_KEY = "cms.home_page_slug";

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

// Current homepage slug from the "cms" group ("" when unset → built-in home).
function readHomeSlug(data: CmsSettingsView): string {
  const v = (data.cms ?? []).find((e) => e.key === HOME_SLUG_KEY)?.value;
  return typeof v === "string" ? v : "";
}

function SettingsBody({ data }: { data: CmsSettingsView }) {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("cms.settings.manage");

  const initial = useMemo(() => buildInitial(data), [data]);
  const [draft, setDraft] = useState<Record<string, boolean>>(initial);
  // Resync after a successful save (cache reseeded with the fresh view).
  useEffect(() => setDraft(initial), [initial]);

  // Homepage slug (a string setting) is tracked separately from the boolean flags.
  const initialHomeSlug = useMemo(() => readHomeSlug(data), [data]);
  const [homeSlug, setHomeSlug] = useState(initialHomeSlug);
  useEffect(() => setHomeSlug(initialHomeSlug), [initialHomeSlug]);

  // Page options for the homepage picker (value = slug).
  const pagesQuery = usePages();
  const pageOptions = useMemo(
    () => pageSlugOptions(pagesQuery.data ?? []),
    [pagesQuery.data],
  );
  const selectedHome =
    pageOptions.find((o) => o.value === homeSlug) ??
    (homeSlug ? { value: homeSlug, label: homeSlug } : null);

  const update = useUpdateCmsSettings();
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    FLAGS.some((f) => draft[f.key] !== initial[f.key]) ||
    homeSlug !== initialHomeSlug;

  function save() {
    setSaveError(null);
    const updates: Record<string, boolean | string> = {};
    for (const f of FLAGS) {
      if (draft[f.key] !== initial[f.key]) updates[f.key] = draft[f.key];
    }
    // Empty string clears the homepage override (web falls back to built-in home).
    if (homeSlug !== initialHomeSlug) updates[HOME_SLUG_KEY] = homeSlug;
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
