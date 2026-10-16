import { ArrowDown, ArrowUp, Plus, Route, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Select } from "@/components/common/Select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAiChain,
  useAiProviders,
  useProviderModels,
  useSetChain,
} from "@/modules/ai/hooks/useAiEndpoints";
import {
  AI_PURPOSES,
  type AiPurpose,
} from "@/modules/ai/services/aiEndpoints.service";
import { parseApiError } from "@/utils/apiError";

import { SettingsSection } from "./SettingsSection";

interface Draft {
  provider_id: string;
  model: string;
}

/**
 * Which endpoints each job runs, in order.
 *
 * The list IS the priority: step 1 answers, and a step that comes back rate
 * limited hands over to the one below it. Measured on Groq, every model on one
 * account shares a request budget — so a second STEP only buys anything when
 * it points at a different endpoint. The copy says so, because an operator
 * stacking three Groq models would otherwise expect three times the quota.
 */
export function AiRouting({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  return (
    <SettingsSection
      icon={Route}
      title={t("settings.section.ai_routing.title")}
      description={t("settings.section.ai_routing.help")}
    >
      <div className="space-y-6 py-4 first:pt-1">
        {AI_PURPOSES.map((purpose) => (
          <PurposeChain key={purpose} purpose={purpose} canManage={canManage} />
        ))}
      </div>
    </SettingsSection>
  );
}

function PurposeChain({
  purpose,
  canManage,
}: {
  purpose: AiPurpose;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const providers = useAiProviders();
  const chain = useAiChain(purpose);
  const save = useSetChain();
  const [draft, setDraft] = useState<Draft[] | null>(null);

  // The server's chain is the truth until the operator edits; once they do,
  // the draft owns the screen so a background refetch cannot undo their work.
  useEffect(() => {
    if (chain.data && draft === null) {
      setDraft(
        chain.data.map((s) => ({ provider_id: s.provider_id, model: s.model })),
      );
    }
  }, [chain.data, draft]);

  const steps = draft ?? [];
  const options = (providers.data ?? []).map((p) => ({
    value: p.id,
    label: p.enabled ? p.label : `${p.label} (${t("ai.providers.disabled")})`,
  }));
  const dirty =
    !!chain.data &&
    JSON.stringify(steps) !==
      JSON.stringify(
        chain.data.map((s) => ({ provider_id: s.provider_id, model: s.model })),
      );

  function patch(index: number, next: Partial<Draft>) {
    setDraft(steps.map((s, i) => (i === index ? { ...s, ...next } : s)));
  }
  function move(index: number, by: number) {
    const to = index + by;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[index], next[to]] = [next[to], next[index]];
    setDraft(next);
  }

  return (
    <div className="rounded-md border" data-testid={`ai-chain-${purpose}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div>
          <h4 className="text-sm font-semibold">
            {t(`ai.purpose.${purpose}`)}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t(`ai.purpose.${purpose}_help`)}
          </p>
        </div>
        {canManage && dirty && (
          <Button
            type="button"
            size="sm"
            loading={save.isPending}
            onClick={async () => {
              try {
                const saved = await save.mutateAsync({
                  purpose,
                  steps: steps.filter((s) => s.provider_id && s.model.trim()),
                });
                setDraft(
                  saved.map((s) => ({
                    provider_id: s.provider_id,
                    model: s.model,
                  })),
                );
                toast.success(t("ai.routing.saved"));
              } catch (err) {
                toast.error(parseApiError(err, t).message);
              }
            }}
          >
            {t("common.save")}
          </Button>
        )}
      </div>

      <div className="space-y-2 p-3">
        {chain.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : steps.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">
            {t("ai.routing.empty")}
          </p>
        ) : (
          steps.map((step, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-[10rem] flex-1">
                <Select
                  inputId={`${purpose}-provider-${index}`}
                  options={options}
                  isClearable={false}
                  isDisabled={!canManage}
                  aria-label={t("ai.routing.provider")}
                  value={
                    options.find((o) => o.value === step.provider_id) ?? null
                  }
                  onChange={(o) =>
                    patch(index, { provider_id: o?.value ?? "" })
                  }
                />
              </div>
              <div className="min-w-[12rem] flex-1">
                <ModelPicker
                  providerID={step.provider_id}
                  value={step.model}
                  disabled={!canManage}
                  onChange={(model) => patch(index, { model })}
                />
              </div>
              {canManage && (
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("ai.routing.move_up")}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("ai.routing.move_down")}
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("ai.routing.remove")}
                    className="text-destructive-ink"
                    onClick={() =>
                      setDraft(steps.filter((_, i) => i !== index))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}

        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={(providers.data ?? []).length === 0}
            onClick={() =>
              setDraft([
                ...steps,
                { provider_id: providers.data?.[0]?.id ?? "", model: "" },
              ])
            }
          >
            <Plus className="size-4" />
            {t("ai.routing.add_step")}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * A model box that offers what the endpoint actually has.
 *
 * Still typeable: not every endpoint answers /models, and a brand-new model
 * can be live before a catalogue lists it. The dropdown is a convenience over
 * the text, never a gate.
 */
function ModelPicker({
  providerID,
  value,
  disabled,
  onChange,
}: {
  providerID: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const models = useProviderModels(providerID || null);
  const items = models.data?.items ?? [];
  const options = items.map((m) => ({ value: m, label: m }));
  // A model the endpoint did not list — typed by hand, or newer than the
  // catalogue — still has to show as the current choice.
  if (value && !items.includes(value)) options.unshift({ value, label: value });

  return (
    <Select
      inputId={`model-${providerID}-${value}`}
      options={options}
      isClearable={false}
      isDisabled={disabled}
      isLoading={models.isPending && !!providerID}
      aria-label={t("ai.routing.model")}
      placeholder={t("ai.routing.model_ph")}
      value={options.find((o) => o.value === value) ?? null}
      onChange={(o) => onChange(o?.value ?? "")}
    />
  );
}
