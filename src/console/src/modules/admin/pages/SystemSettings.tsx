import {
  Bot,
  Building2,
  DatabaseZap,
  FileText,
  Gauge,
  Globe,
  HardDrive,
  Languages,
  ListOrdered,
  Mail,
  MessageSquare,
  RotateCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PageHeader } from "@/components/common/PageHeader";
import { Select, type SelectOption } from "@/components/common/Select/Select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { usePageOptions } from "@/modules/cms";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { parseApiError } from "@/utils/apiError";

import { AiExtras } from "../components/AiExtras";
import { SettingRow, SettingsSection } from "../components/SettingsSection";
import {
  useSettingsAccess,
  usePurgeCache,
  useSystemSettings,
  useTestEmail,
  useUpdateSystemSettings,
} from "../hooks/useSystemSettings";
import type {
  SettingEntry,
  SettingUpdate,
  SettingsView,
} from "../services/settings.service";

/**
 * Every setting in the system, on one screen.
 *
 * The form is built from the API's own description of each key — type, format,
 * allowed values, whether it is a secret — rather than from a list kept here.
 * That is deliberate: a key added to the backend registry appears here on its
 * own, with a sensible control, and the only thing anyone has to write is its
 * Vietnamese label. A key with no label falls back to showing its id, which is
 * ugly enough to be noticed and harmless enough to ship.
 *
 * Three keys are too particular for that and are special-cased: the homepage
 * (a list of published pages), the site's chrome (translatable, so it carries
 * language tabs) and the SMTP block (which gets a "send a test" button).
 */

/** Tab order, and the icon each one wears. Unknown groups come last, plainly. */
const GROUPS: { key: string; icon: LucideIcon }[] = [
  { key: "general", icon: SlidersHorizontal },
  { key: "cache", icon: DatabaseZap },
  { key: "site", icon: Globe },
  { key: "seo", icon: Search },
  { key: "cms", icon: FileText },
  { key: "translation", icon: Languages },
  { key: "email", icon: Mail },
  { key: "storage", icon: HardDrive },
  { key: "ai", icon: Bot },
  { key: "chatbot", icon: MessageSquare },
  { key: "security", icon: ShieldCheck },
];
const groupIcon = (group: string) =>
  GROUPS.find((g) => g.key === group)?.icon ?? Settings2;

/**
 * Which keys sit together, under which heading.
 *
 * This is presentation, not truth: a key missing from it still renders, in a
 * section of its own at the end, so the registry stays the only place that
 * decides what exists.
 */
const SECTIONS: Record<
  string,
  { id: string; icon?: LucideIcon; keys: string[] }[]
> = {
  general: [
    {
      id: "brand",
      icon: Building2,
      keys: [
        "app.name",
        "app.logo_url",
        "app.favicon_url",
        "app.primary_color",
      ],
    },
    {
      id: "console",
      icon: SlidersHorizontal,
      keys: ["app.default_locale", "app.language_switcher_enabled"],
    },
    {
      id: "pagination",
      icon: ListOrdered,
      keys: ["app.page_size", "app.pagination_template"],
    },
  ],
  cache: [
    {
      id: "ttl",
      icon: Timer,
      keys: [
        "site.cache_ttl_seconds",
        "cache.public_max_age_seconds",
        "cache.console_refresh_seconds",
      ],
    },
  ],
  site: [
    { id: "brand", icon: Building2, keys: ["site.og_image_url"] },
    {
      id: "chrome",
      icon: FileText,
      keys: ["site.brand_tagline", "site.footer_copyright"],
    },
    {
      id: "contact",
      icon: Mail,
      keys: [
        "site.contact_email",
        "site.contact_zalo",
        "site.contact_phone",
        "site.address",
      ],
    },
    {
      id: "social",
      icon: Globe,
      keys: [
        "site.social_facebook",
        "site.social_linkedin",
        "site.social_youtube",
        "site.social_github",
      ],
    },
    {
      id: "display",
      icon: Settings2,
      keys: ["site.blog_page_size", "site.products_page_size"],
    },
  ],
  seo: [
    {
      id: "indexing",
      icon: Search,
      keys: [
        "seo.noindex_all",
        "seo.google_site_verification",
        "seo.analytics_id",
      ],
    },
  ],
  cms: [
    {
      id: "articles",
      icon: FileText,
      keys: [
        "cms.article.categorize",
        "cms.article.require_review",
        "cms.article.allow_slug_edit",
      ],
    },
    {
      id: "publishing",
      icon: Globe,
      keys: [
        "cms.publish.allow_now",
        "cms.newsletter.notify_on_publish",
        "cms.home_page_slug",
      ],
    },
  ],
  translation: [
    {
      id: "languages",
      icon: Languages,
      keys: ["translation.enabled", "translation.locales"],
    },
  ],
  email: [
    {
      id: "smtp",
      icon: Mail,
      keys: [
        "mail.smtp_host",
        "mail.smtp_port",
        "mail.smtp_user",
        "mail.smtp_password",
      ],
    },
    {
      id: "sender",
      icon: Building2,
      keys: ["mail.from_address", "mail.from_name"],
    },
  ],
  storage: [
    { id: "where", icon: HardDrive, keys: ["storage.driver"] },
    {
      id: "s3",
      icon: Globe,
      keys: [
        "storage.s3_bucket",
        "storage.s3_region",
        "storage.s3_endpoint",
        "storage.s3_access_key",
        "storage.s3_secret",
      ],
    },
    {
      id: "limits",
      icon: Settings2,
      keys: [
        "storage.max_upload_mb",
        "files_max_upload_mb",
        "files_storage_quota_mb",
      ],
    },
  ],
  security: [
    {
      id: "recaptcha",
      icon: ShieldCheck,
      keys: [
        "security.recaptcha_enabled",
        "security.recaptcha_site_key",
        "security.recaptcha_secret",
      ],
    },
  ],
  ai: [
    // The endpoint itself is not a setting any more: it is a record in
    // ai_providers, edited by <AiEndpoints/> below. What is left here is the
    // on/off switch.
    { id: "connection", icon: Bot, keys: ["ai.enabled"] },
    { id: "behaviour", icon: Settings2, keys: ["ai.system_persona"] },
  ],
  // Its own tab, not a section of "ai": everything here answers "how much may
  // a stranger on the internet spend of ours", which is a different question
  // from how the assistant is wired or what voice it uses. They were mixed in
  // with the provider settings, where a ceiling is easy to miss.
  chatbot: [
    {
      id: "limits",
      icon: Gauge,
      keys: ["ai.max_turns", "ai.max_message_len", "ai.daily_token_cap"],
    },
    {
      id: "abuse",
      icon: ShieldCheck,
      keys: ["ai.chat.require_captcha", "ai.chat.max_per_day"],
    },
  ],
};

/** Keys whose text is stored per language (translation entity "site_chrome"). */
const CHROME_KEYS = SECTIONS.site[1].keys;
const CHROME_ID = "00000000-0000-0000-0000-00005174e000";

/** Keys that deserve more than one line. */
const LONG_KEYS = new Set(["site.brand_tagline", "ai.system_persona"]);

const HOME_SLUG_KEY = "cms.home_page_slug";

/** i18n keys cannot carry dots, which every setting key is full of. */
const labelKey = (key: string) => `settings.label.${key.replace(/\./g, "_")}`;
const helpKey = (key: string) => `settings.help.${key.replace(/\./g, "_")}`;

/**
 * A stored value as the form holds it — text, whatever its type.
 *
 * Booleans included: without them every switch read "" and therefore rendered
 * OFF, no matter what was saved. The draft is text because one state has to
 * cover six control types; `save` turns it back into the declared type.
 */
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export default function SystemSettings() {
  const { t } = useTranslation();
  const { canRead, scoped } = useSettingsAccess();
  const query = useSystemSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.title")}
        subtitle={
          scoped ? t("settings.subtitle_scoped") : t("settings.subtitle")
        }
        breadcrumbs={[{ labelKey: "nav.settings" }]}
      />
      {!canRead ? (
        <Card>
          <CardContent className="pt-6">
            <Alert variant="danger" message={t("errors.access_denied")} />
          </CardContent>
        </Card>
      ) : query.isLoading ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : query.isError || !query.data ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Alert
              variant="danger"
              message={parseApiError(query.error, t).message}
            />
            <Button
              variant="outline"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RotateCw className="size-4" />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SettingsBody data={query.data} />
      )}
    </div>
  );
}

function SettingsBody({ data }: { data: SettingsView }) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const known = GROUPS.map((g) => g.key);
    return Object.keys(data)
      .filter((g) => (data[g] ?? []).length > 0)
      .sort((a, b) => {
        const ai = known.indexOf(a),
          bi = known.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  }, [data]);
  const [group, setGroup] = useState(groups[0] ?? "general");
  useEffect(() => {
    if (!groups.includes(group)) setGroup(groups[0] ?? "general");
  }, [groups, group]);

  // The stored value of every key, as text. Secrets start empty: an empty box
  // means "leave what is stored", never "clear it".
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const entries of Object.values(data)) {
      for (const entry of entries ?? []) {
        out[entry.key] = entry.type === "secret" ? "" : text(entry.value);
      }
    }
    return out;
  }, [data]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);

  const tr = useEntityTranslation("site_chrome", CHROME_ID);
  const translating = tr.enabled && !tr.isBase;

  const update = useUpdateSystemSettings();
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    Object.keys(initial).some((key) => draft[key] !== initial[key]) || tr.dirty;

  function save() {
    setSaveError(null);
    void tr.flush(CHROME_ID);
    const updates: SettingUpdate = {};
    for (const entries of Object.values(data)) {
      for (const entry of entries ?? []) {
        const next = draft[entry.key] ?? "";
        if (next === (initial[entry.key] ?? "")) continue;
        if (entry.type === "bool") updates[entry.key] = next === "true";
        else if (entry.type === "int") {
          const n = Number(next);
          if (!Number.isFinite(n) || next.trim() === "") continue;
          updates[entry.key] = n;
        } else updates[entry.key] = next;
      }
    }
    if (Object.keys(updates).length === 0) {
      if (tr.dirty) toast.success(t("settings.saved"));
      return;
    }
    update.mutate(updates, {
      onSuccess: () => toast.success(t("settings.saved")),
      onError: (err) => {
        const parsed = parseApiError(err, t);
        if (parsed.code >= 500) toast.error(parsed.message);
        else setSaveError(parsed.message);
      },
    });
  }

  const entries = data[group] ?? [];
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const planned = SECTIONS[group] ?? [];
  const placed = new Set(planned.flatMap((section) => section.keys));
  // Anything the layout above does not mention still has to be editable.
  const leftovers = entries.filter((e) => !placed.has(e.key));

  const field = (entry: SettingEntry) => (
    <Field
      key={entry.key}
      entry={entry}
      value={draft[entry.key] ?? ""}
      onChange={(next) => setDraft((prev) => ({ ...prev, [entry.key]: next }))}
      disabled={update.isPending}
      translation={CHROME_KEYS.includes(entry.key) ? tr : undefined}
      translating={translating}
    />
  );

  return (
    <div className="space-y-4">
      <Tabs value={group} onValueChange={setGroup}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 p-1">
          {groups.map((name) => {
            const Icon = groupIcon(name);
            return (
              <TabsTrigger key={name} value={name} className="gap-1.5">
                <Icon className="size-4" aria-hidden />
                {t(`settings.group.${name}`, name)}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {group === "site" && tr.enabled && tr.tabs.length > 1 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-xs text-muted-foreground">
              {translating
                ? t("settings.chrome.translating")
                : t("settings.chrome.base")}
            </p>
            <div className="flex gap-1" role="group" aria-label={t("tr.tabs")}>
              {tr.tabs.map((locale) => (
                <Button
                  key={locale}
                  type="button"
                  size="sm"
                  variant={locale === tr.locale ? "secondary" : "ghost"}
                  aria-pressed={locale === tr.locale}
                  onClick={() => tr.setLocale(locale)}
                >
                  {locale.toUpperCase()}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {planned.map((section) => {
        const rows = section.keys
          .map((key) => byKey.get(key))
          .filter((e): e is SettingEntry => !!e);
        if (rows.length === 0) return null;
        return (
          <SettingsSection
            key={section.id}
            icon={section.icon}
            title={t(`settings.section.${group}_${section.id}.title`)}
            description={t(`settings.section.${group}_${section.id}.help`, "")}
            footer={
              section.id === "smtp" ? (
                <EmailTest disabled={update.isPending} />
              ) : section.id === "ttl" ? (
                <CachePurge disabled={update.isPending} />
              ) : undefined
            }
          >
            {rows.map(field)}
          </SettingsSection>
        );
      })}

      {leftovers.length > 0 && (
        <SettingsSection
          icon={groupIcon(group)}
          title={t("settings.section.other.title")}
          description={t("settings.section.other.help")}
        >
          {leftovers.map(field)}
        </SettingsSection>
      )}

      {/* AI carries two things that are not settings — a connection test and a
          usage chart — and they belong beside the fields they describe. */}
      {group === "ai" && <AiExtras />}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saveError && <Alert variant="danger" message={saveError} />}
        <Button loading={update.isPending} disabled={!dirty} onClick={save}>
          <Save className="size-4" />
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

type Translation = ReturnType<typeof useEntityTranslation>;

function Field({
  entry,
  value,
  onChange,
  disabled,
  translation,
  translating,
}: {
  entry: SettingEntry;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  /** Present when this key's text is stored per language. */
  translation?: Translation;
  translating: boolean;
}) {
  const { t } = useTranslation();
  const id = `set-${entry.key.replace(/\./g, "-")}`;
  const label = t(labelKey(entry.key), entry.key);
  const help = t(helpKey(entry.key), "");
  // A key that is not translatable has nothing to show while another language
  // is selected: it is the same value in every language.
  const field = translation?.values[entry.key.replace("site.", "")];
  const inLanguage = translating && !!translation;
  const shown = inLanguage ? (typeof field === "string" ? field : "") : value;
  const locked = disabled || (translating && !translation);

  const common = {
    id,
    disabled: locked,
    value: shown,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      inLanguage
        ? translation.setField(entry.key.replace("site.", ""), e.target.value)
        : onChange(e.target.value),
  };

  const row = (control: ReactNode, badge?: ReactNode) => (
    <SettingRow id={id} label={label} help={help} badge={badge}>
      {control}
    </SettingRow>
  );

  if (entry.key === HOME_SLUG_KEY && !translating) {
    return row(
      <HomePagePicker value={value} onChange={onChange} disabled={disabled} />,
    );
  }

  if (entry.type === "bool") {
    return row(
      <Switch
        id={id}
        checked={value === "true"}
        disabled={locked}
        onCheckedChange={(next) => onChange(String(next))}
      />,
    );
  }

  if (entry.type === "secret") {
    return row(
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        placeholder={t("settings.secret.placeholder")}
        disabled={locked}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />,
      <Badge variant={entry.is_set ? "secondary" : "outline"}>
        {entry.is_set ? t("settings.secret.set") : t("settings.secret.unset")}
      </Badge>,
    );
  }

  if (entry.type === "enum") {
    const options: SelectOption[] = (entry.allowed_values ?? []).map((v) => ({
      value: v,
      label: t(`settings.value.${v}`, v),
    }));
    return row(
      <Select
        inputId={id}
        options={options}
        value={options.find((o) => o.value === value) ?? null}
        isDisabled={locked}
        isClearable={false}
        isSearchable={false}
        onChange={(o) => onChange(o?.value ?? "")}
      />,
    );
  }

  if (entry.type === "int") {
    return row(<Input {...common} type="number" className="max-w-44" />);
  }

  if (LONG_KEYS.has(entry.key)) {
    return row(<Textarea {...common} rows={3} maxLength={2000} />);
  }

  // type=url would refuse "/assets/logo.png" in the browser before the server
  // ever saw it, and a same-site path is the common case for an image this site
  // hosts itself — so only e-mail narrows the input type.
  return row(
    entry.format === "email" ? (
      <Input {...common} type="email" />
    ) : (
      <TextField {...common} maxLength={500} />
    ),
  );
}

function HomePagePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  // Every page, not one page of the list: this picker is how the homepage gets
  // chosen, and a missing option reads as "that page cannot be the homepage".
  const pages = usePageOptions();
  const options = useMemo<SelectOption[]>(
    () => (pages.data ?? []).map((p) => ({ value: p.slug, label: p.title })),
    [pages.data],
  );
  const selected =
    options.find((o) => o.value === value) ??
    (value ? { value, label: value } : null);
  return (
    <Select
      inputId="set-cms-home-page-slug"
      options={options}
      value={selected}
      isLoading={pages.isLoading}
      isDisabled={disabled}
      isClearable
      placeholder={t("settings.home_page.placeholder")}
      onChange={(o) => onChange(o?.value ?? "")}
    />
  );
}

/**
 * Sends a message with the SMTP settings AS STORED.
 *
 * Deliberately not with the values in the boxes above: a test that passes on
 * unsaved values tells you nothing about the configuration the application
 * will actually use.
 */
/**
 * "Clear it now" for the three delays above.
 *
 * The settings in this section decide how long something MAY be stale; this
 * ends the current wait without changing any of them. It drops the snapshot the
 * API holds and moves the token the public site polls, which is what tells the
 * site to throw away the pages it has already rendered.
 */
function CachePurge({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const purge = usePurgeCache();
  return (
    <SettingRow
      id="set-cache-purge"
      label={t("settings.cache_purge.label")}
      help={t("settings.cache_purge.help")}
    >
      <Button
        type="button"
        variant="outline"
        loading={purge.isPending}
        disabled={disabled}
        onClick={() =>
          purge.mutate(undefined, {
            onSuccess: () => toast.success(t("settings.cache_purge.ok")),
            onError: (err) => toast.error(parseApiError(err, t).message),
          })
        }
      >
        <Trash2 className="size-4" />
        {t("settings.cache_purge.run")}
      </Button>
    </SettingRow>
  );
}

function EmailTest({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const [to, setTo] = useState("");
  const test = useTestEmail();
  return (
    // The same two-column grid as every row above, so the action lines up
    // with the fields it belongs to instead of floating in its own box.
    <SettingRow
      id="set-email-test"
      label={t("settings.email_test.label")}
      help={t("settings.email_test.help")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="set-email-test"
          type="email"
          className="max-w-80"
          placeholder="you@example.com"
          value={to}
          disabled={disabled}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          loading={test.isPending}
          disabled={disabled || !to.trim()}
          onClick={() =>
            test.mutate(to.trim(), {
              onSuccess: () => toast.success(t("settings.email_test.ok")),
              onError: (err) => toast.error(parseApiError(err, t).message),
            })
          }
        >
          <Mail className="size-4" />
          {t("settings.email_test.run")}
        </Button>
      </div>
    </SettingRow>
  );
}
