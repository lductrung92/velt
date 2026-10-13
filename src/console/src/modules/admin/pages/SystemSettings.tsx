import { Mail, RotateCw, Save } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PageHeader } from "@/components/common/PageHeader";
import { Select, type SelectOption } from "@/components/common/Select/Select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { AiAssistant } from "@/modules/ai";
import { usePages, type PageNode } from "@/modules/cms";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { parseApiError } from "@/utils/apiError";

import {
  useSettingsAccess,
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

/** The order the groups are shown in; anything unknown goes last. */
const GROUP_ORDER = [
  "general",
  "site",
  "seo",
  "cms",
  "translation",
  "email",
  "storage",
  "ai",
];

/** Keys whose text is stored per language (translation entity "site_chrome"). */
const CHROME_KEYS = [
  "site.brand_tagline",
  "site.footer_note_title",
  "site.footer_note_text",
  "site.footer_copyright",
  "site.header_cta_label",
  "site.header_cta_url",
];
const CHROME_ID = "00000000-0000-0000-0000-00005174e000";

/** Keys that deserve more than one line. */
const LONG_KEYS = new Set([
  "site.brand_tagline",
  "site.footer_note_text",
  "ai.system_persona",
]);

const HOME_SLUG_KEY = "cms.home_page_slug";

/** i18n keys cannot carry dots, which every setting key is full of. */
const labelKey = (key: string) => `settings.label.${key.replace(/\./g, "_")}`;
const helpKey = (key: string) => `settings.help.${key.replace(/\./g, "_")}`;

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
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
        subtitle={scoped ? t("settings.subtitle_scoped") : t("settings.subtitle")}
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
  const groups = useMemo(
    () =>
      Object.keys(data)
        .filter((g) => (data[g] ?? []).length > 0)
        .sort((a, b) => {
          const ai = GROUP_ORDER.indexOf(a),
            bi = GROUP_ORDER.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        }),
    [data],
  );
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

  return (
    <div className="space-y-4">
      <Tabs value={group} onValueChange={setGroup}>
        <TabsList className="flex-wrap">
          {groups.map((name) => (
            <TabsTrigger key={name} value={name}>
              {t(`settings.group.${name}`, name)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <p className="text-xs text-muted-foreground">
            {t(`settings.group_help.${group}`, "")}
          </p>

          {group === "site" && tr.enabled && tr.tabs.length > 1 && (
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
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
            </div>
          )}

          {/* AI is the one group with more than settings — a connection test
              and a usage chart — so its own screen is rendered here rather
              than flattened into generic fields. */}
          {group === "ai" ? (
            <AiAssistant embedded />
          ) : (
            entries.map((entry) => (
            <Field
              key={entry.key}
              entry={entry}
              value={draft[entry.key] ?? ""}
              onChange={(next) =>
                setDraft((prev) => ({ ...prev, [entry.key]: next }))
              }
              disabled={update.isPending}
              translation={CHROME_KEYS.includes(entry.key) ? tr : undefined}
              translating={translating}
            />
            ))
          )}

          {group === "email" && <EmailTest disabled={update.isPending} />}

          {/* The AI panel brings its own Save, because it saves more than
              plain fields; every other group shares this one. */}
          <div className="!mt-6" hidden={group === "ai"}>
            {saveError && (
              <Alert className="mb-3" variant="danger" message={saveError} />
            )}
            <div className="flex justify-end">
              <Button loading={update.isPending} disabled={!dirty} onClick={save}>
                <Save className="size-4" />
                {t("common.save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
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

  const common = {
    id,
    disabled: disabled || (translating && !translation),
    value: shown,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      inLanguage
        ? translation.setField(entry.key.replace("site.", ""), e.target.value)
        : onChange(e.target.value),
  };

  if (entry.key === HOME_SLUG_KEY && !translating) {
    return (
      <Row id={id} label={label} help={help}>
        <HomePagePicker value={value} onChange={onChange} disabled={disabled} />
      </Row>
    );
  }

  if (entry.type === "bool") {
    return (
      <div className="flex items-start justify-between gap-3 rounded-md border p-4">
        <div className="space-y-1">
          <Label htmlFor={id} className="text-sm font-medium leading-none">
            {label}
          </Label>
          {help && <p className="text-xs text-muted-foreground">{help}</p>}
        </div>
        <Switch
          id={id}
          checked={value === "true"}
          disabled={disabled || translating}
          onCheckedChange={(next) => onChange(String(next))}
        />
      </div>
    );
  }

  if (entry.type === "secret") {
    return (
      <Row
        id={id}
        label={label}
        help={help || t("settings.secret.hint")}
        badge={
          <Badge variant={entry.is_set ? "secondary" : "outline"}>
            {entry.is_set ? t("settings.secret.set") : t("settings.secret.unset")}
          </Badge>
        }
      >
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          placeholder={t("settings.secret.placeholder")}
          disabled={disabled || translating}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Row>
    );
  }

  if (entry.type === "enum") {
    const options: SelectOption[] = (entry.allowed_values ?? []).map((v) => ({
      value: v,
      label: t(`settings.value.${v}`, v),
    }));
    return (
      <Row id={id} label={label} help={help}>
        <Select
          inputId={id}
          options={options}
          value={options.find((o) => o.value === value) ?? null}
          isDisabled={disabled || translating}
          isClearable={false}
          isSearchable={false}
          onChange={(o) => onChange(o?.value ?? "")}
        />
      </Row>
    );
  }

  if (entry.type === "int") {
    return (
      <Row id={id} label={label} help={help}>
        <Input
          {...common}
          type="number"
          className="max-w-44"
          disabled={disabled || translating}
        />
      </Row>
    );
  }

  if (LONG_KEYS.has(entry.key)) {
    return (
      <Row id={id} label={label} help={help}>
        <Textarea {...common} rows={3} maxLength={2000} />
      </Row>
    );
  }

  return (
    <Row id={id} label={label} help={help}>
      {/* type=url would refuse "/assets/logo.png" in the browser before the
          server ever saw it, and a same-site path is the common case for an
          image this site hosts itself. */}
      {entry.format === "email" ? (
        <Input {...common} type="email" />
      ) : (
        <TextField {...common} maxLength={500} />
      )}
    </Row>
  );
}

function Row({
  id,
  label,
  help,
  badge,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {badge}
      </div>
      {help && <p className="pb-1 text-xs text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}

/** The homepage is a published page, so it is picked rather than typed. */
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
  const pages = usePages();
  const options = useMemo(() => {
    const walk = (nodes: PageNode[] | undefined, depth = 0): SelectOption[] =>
      (nodes ?? []).flatMap((p: PageNode) => [
        { value: p.slug, label: "— ".repeat(depth) + p.title },
        ...walk(p.children, depth + 1),
      ]);
    return walk(pages.data);
  }, [pages.data]);
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
function EmailTest({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const [to, setTo] = useState("");
  const test = useTestEmail();
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-4">
      <Label htmlFor="set-email-test" className="text-sm font-medium">
        {t("settings.email_test.label")}
      </Label>
      <p className="pb-1 text-xs text-muted-foreground">
        {t("settings.email_test.help")}
      </p>
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
    </div>
  );
}
