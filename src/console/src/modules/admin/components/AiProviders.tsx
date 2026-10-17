import { KeyRound, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ModalHeader } from "@/components/common/ModalHeader/ModalHeader";
import { Select } from "@/components/common/Select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useAiProviders,
  useCreateProvider,
  useDeleteProvider,
  useUpdateProvider,
} from "@/modules/ai/hooks/useAiEndpoints";
import {
  revealProviderKeys,
  type AiProvider,
} from "@/modules/ai/services/aiEndpoints.service";
import { parseApiError } from "@/utils/apiError";

import { SettingsSection } from "./SettingsSection";

/**
 * The endpoints the assistant may talk to.
 *
 * One row per endpoint rather than one set of fields, because there can be
 * several and the chains below point at them by name. Keys are hidden by
 * default — the list only says how many are stored — and an operator who
 * needs to read one unlocks it with their own password, which is recorded.
 * Leaving the box empty keeps what is stored; typing replaces the whole list.
 */
export function AiProviders({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const providers = useAiProviders();
  const remove = useDeleteProvider();
  const [editing, setEditing] = useState<AiProvider | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AiProvider | null>(null);

  const items = providers.data ?? [];

  return (
    <SettingsSection
      icon={Server}
      title={t("settings.section.ai_providers.title")}
      description={t("settings.section.ai_providers.help")}
      footer={
        canManage && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" />
            {t("ai.providers.add")}
          </Button>
        )
      }
    >
      <div className="py-4 first:pt-1">
        {providers.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t("ai.providers.empty")}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                data-testid="ai-provider-row"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    <StatusBadge tone="neutral">{p.kind}</StatusBadge>
                    {!p.enabled && (
                      <StatusBadge tone="warning">
                        {t("ai.providers.disabled")}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {p.base_url || t("ai.providers.default_url")}
                  </p>
                </div>
                <span
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  title={
                    p.has_key
                      ? t("ai.providers.key_set")
                      : t("ai.providers.key_missing")
                  }
                >
                  <KeyRound
                    className={`size-3.5 ${p.has_key ? "text-success-ink" : "text-muted-foreground"}`}
                    aria-hidden
                  />
                  {!p.has_key
                    ? t("ai.providers.key_missing")
                    : p.key_count > 1
                      ? t("ai.providers.key_count", { count: p.key_count })
                      : t("ai.providers.key_set")}
                </span>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.edit")}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.delete")}
                      className="text-destructive-ink"
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(adding || editing) && (
        <ProviderDialog
          provider={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("ai.providers.delete.title")}
        description={t("ai.providers.delete.body", {
          label: deleting?.label ?? "",
        })}
        confirmLabel={t("common.delete")}
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t("ai.providers.deleted"));
            setDeleting(null);
          } catch (err) {
            toast.error(parseApiError(err, t).message);
          }
        }}
      />
    </SettingsSection>
  );
}

/** Add or edit one endpoint. `provider` present = edit. */
function ProviderDialog({
  provider,
  onClose,
}: {
  provider: AiProvider | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const [label, setLabel] = useState(provider?.label ?? "");
  const [kind, setKind] = useState<AiProvider["kind"]>(
    provider?.kind ?? "openai",
  );
  const [baseURL, setBaseURL] = useState(provider?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  // Unlocking the stored keys. `revealed` latches so the password is asked
  // once per dialog, not once per keystroke; closing the dialog drops it with
  // the component, which is the whole lifetime the plaintext should have.
  const [asking, setAsking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [pw, setPw] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState("");

  async function reveal() {
    if (!provider || !pw) return;
    setRevealing(true);
    setRevealError("");
    try {
      const keys = await revealProviderKeys(provider.id, pw);
      // Straight into the editor: the operator asked to see them, and having
      // them in the field they already edit means fixing one is a keystroke
      // rather than a retype of the whole list.
      setApiKey(keys.join("\n"));
      setRevealed(true);
      setAsking(false);
    } catch (err) {
      setRevealError(parseApiError(err, t).message);
    } finally {
      // Never kept, not even for a retry.
      setPw("");
      setRevealing(false);
    }
  }

  const kinds = [
    { value: "openai", label: t("ai.providers.kind.openai") },
    { value: "anthropic", label: t("ai.providers.kind.anthropic") },
  ];
  const saving = create.isPending || update.isPending;

  async function save() {
    try {
      if (provider) {
        await update.mutateAsync({
          id: provider.id,
          body: {
            label,
            kind,
            base_url: baseURL,
            enabled,
            // Only send a key when one was typed: an untouched box must not
            // wipe the stored credential.
            ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          },
        });
      } else {
        await create.mutateAsync({
          label,
          kind,
          base_url: baseURL,
          enabled,
          api_key: apiKey.trim() || undefined,
        });
      }
      toast.success(t("ai.providers.saved"));
      onClose();
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("common.close")}>
        <ModalHeader
          icon={Server}
          title={
            provider
              ? t("ai.providers.edit_title")
              : t("ai.providers.new_title")
          }
          subject={t("settings.section.ai_providers.title")}
        />
        <div className="space-y-4">
          <Field label={t("ai.providers.field.label")}>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("ai.providers.field.label_ph")}
            />
          </Field>
          <Field
            label={t("ai.providers.field.kind")}
            help={t("ai.providers.field.kind_help")}
          >
            <Select
              inputId="ai-provider-kind"
              options={kinds}
              isClearable={false}
              isSearchable={false}
              value={kinds.find((k) => k.value === kind) ?? null}
              onChange={(o) =>
                setKind((o?.value as AiProvider["kind"]) ?? "openai")
              }
            />
          </Field>
          <Field
            label={t("ai.providers.field.base_url")}
            help={t("ai.providers.field.base_url_help")}
          >
            <Input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.groq.com/openai/v1"
            />
          </Field>
          <Field
            label={t("ai.providers.field.api_key")}
            help={
              provider?.has_key
                ? t("ai.providers.field.api_key_set")
                : t("ai.providers.field.api_key_help")
            }
          >
            {/* A textarea, not a password field: an endpoint may hold several
                keys, one per line, and they are tried in order when one hits
                its quota. Masking them would make a list impossible to check
                for a typo, and nothing here is readable without the session
                that already has permission to change it. */}
            <Textarea
              rows={3}
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider?.has_key
                  ? "••••••••"
                  : t("ai.providers.field.api_key_ph")
              }
            />
            {/* Reading a stored key is a separate act from changing one, so
                it asks for the password again. A console left unlocked on a
                desk is the ordinary way these keys walk out, and a session
                cookie cannot tell whether the person is still sitting there. */}
            {provider?.has_key && !revealed && (
              <div className="mt-2 space-y-2">
                {!asking ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAsking(true)}
                  >
                    <KeyRound className="size-3.5" />
                    {t("ai.providers.reveal.open")}
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
                    <p className="text-xs text-muted-foreground">
                      {t("ai.providers.reveal.prompt")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="password"
                        className="min-w-48 flex-1"
                        value={pw}
                        autoComplete="current-password"
                        placeholder={t("ai.providers.reveal.password")}
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void reveal();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!pw || revealing}
                        onClick={() => void reveal()}
                      >
                        {t("ai.providers.reveal.confirm")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAsking(false);
                          setPw("");
                          setRevealError("");
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                    {revealError && (
                      <p className="text-xs text-danger-ink">{revealError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("ai.providers.field.api_key_rotate")}
            </p>
          </Field>
          <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <span className="text-sm">
              <span className="font-medium">
                {t("ai.providers.field.enabled")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("ai.providers.field.enabled_help")}
              </span>
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={saving || !label.trim()}
            onClick={save}
          >
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
