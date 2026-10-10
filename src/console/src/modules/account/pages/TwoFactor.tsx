import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseApiError } from "@/utils/apiError";

import { ReauthConfirm } from "../components/ReauthConfirm";
import { RecoveryCodesPanel } from "../components/RecoveryCodesPanel";
import { TwoFactorEnroll } from "../components/TwoFactorEnroll";
import { accountKeys } from "../hooks/accountKeys";
import {
  useDisableTwoFactor,
  useProfile,
  useRegenerateRecoveryCodes,
  useSetupTwoFactor,
} from "../hooks/useAccount";
import type {
  ProfileResponse,
  Setup2faResponse,
} from "../services/account.service";

type Mode = "idle" | "setup" | "disable" | "regenerate" | "recovery";

export default function TwoFactor() {
  const { t } = useTranslation();
  const profile = useProfile();

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-5">
        {profile.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-9 w-32" />
          </div>
        ) : profile.isError || !profile.data ? (
          <Alert
            variant="danger"
            message={parseApiError(profile.error, t).message}
          />
        ) : (
          <TwoFactorPanel profile={profile.data} />
        )}
      </CardContent>
    </Card>
  );
}

function TwoFactorPanel({ profile }: { profile: ProfileResponse }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const enabled = profile.two_factor_enabled;
  const remaining = profile.recovery_codes_remaining;

  const [mode, setMode] = useState<Mode>("idle");
  const [setupData, setSetupData] = useState<Setup2faResponse | null>(null);
  const [regenCodes, setRegenCodes] = useState<string[]>([]);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const setup = useSetupTwoFactor();
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateRecoveryCodes();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: accountKeys.profile() });
  const reset = () => {
    setMode("idle");
    setSetupData(null);
    setRegenCodes([]);
    setReauthError(null);
  };

  function onEnableClick() {
    setup.mutate(undefined, {
      onSuccess: (data) => {
        setSetupData(data);
        setMode("setup");
      },
      onError: (err) => {
        const parsed = parseApiError(err, t);
        // Already enabled elsewhere → just resync.
        if (parsed.key === "two_factor_already_enabled") invalidate();
        else toast.error(parsed.message);
      },
    });
  }

  function onDisableConfirm(password: string) {
    setReauthError(null);
    disable.mutate(password, {
      onSuccess: () => {
        toast.success(t("account.2fa.disabled"));
        reset();
      },
      onError: (err) => {
        const parsed = parseApiError(err, t);
        if (parsed.key === "two_factor_not_enabled") {
          invalidate();
          reset();
        } else {
          setReauthError(parsed.message);
        }
      },
    });
  }

  function onRegenerateConfirm(password: string) {
    setReauthError(null);
    regenerate.mutate(password, {
      onSuccess: (res) => {
        setRegenCodes(res.recovery_codes);
        setMode("recovery");
      },
      onError: (err) => {
        const parsed = parseApiError(err, t);
        if (parsed.key === "two_factor_not_enabled") {
          invalidate();
          reset();
        } else {
          setReauthError(parsed.message);
        }
      },
    });
  }

  if (mode === "setup" && setupData) {
    return (
      <TwoFactorEnroll
        setup={setupData}
        onCancel={reset}
        onNotPending={() => {
          toast.error(t("errors.two_factor_not_pending"));
          reset();
        }}
        onComplete={() => {
          invalidate();
          toast.success(t("account.2fa.enabled"));
          reset();
        }}
      />
    );
  }

  if (mode === "recovery") {
    return (
      <RecoveryCodesPanel
        codes={regenCodes}
        onDone={() => {
          invalidate();
          reset();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm">{t("account.2fa.status_label")}</span>
        <StatusBadge tone={enabled ? "success" : "neutral"}>
          {enabled ? t("account.2fa.on") : t("account.2fa.off")}
        </StatusBadge>
      </div>

      {enabled && remaining !== null && (
        <div>
          {remaining === 0 ? (
            <Alert variant="danger" message={t("account.2fa.codes_empty")} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("account.2fa.codes_remaining", { n: remaining })}
              {remaining <= 2 && ` — ${t("account.2fa.codes_low")}`}
            </p>
          )}
        </div>
      )}

      {!enabled ? (
        <Button loading={setup.isPending} onClick={onEnableClick}>
          <ShieldCheck className="size-4" />
          {t("account.2fa.enable")}
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setReauthError(null);
              setMode("regenerate");
            }}
          >
            <RotateCcw className="size-4" />
            {t("account.2fa.regenerate")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setReauthError(null);
              setMode("disable");
            }}
          >
            <ShieldOff className="size-4" />
            {t("account.2fa.disable")}
          </Button>
        </div>
      )}

      {mode === "disable" && (
        <ReauthConfirm
          title={t("account.2fa.disable_title")}
          description={t("account.2fa.disable_desc")}
          confirmLabel={t("account.2fa.disable")}
          destructive
          loading={disable.isPending}
          error={reauthError}
          onConfirm={onDisableConfirm}
          onCancel={reset}
        />
      )}

      {mode === "regenerate" && (
        <ReauthConfirm
          title={t("account.2fa.regenerate_title")}
          description={t("account.2fa.regenerate_desc")}
          confirmLabel={t("account.2fa.regenerate")}
          loading={regenerate.isPending}
          error={reauthError}
          onConfirm={onRegenerateConfirm}
          onCancel={reset}
        />
      )}
    </div>
  );
}
