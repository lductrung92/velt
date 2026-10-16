import { Copy, Eye, EyeOff, KeyRound, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ModalHeader } from "@/components/common/ModalHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { parseApiError } from "@/utils/apiError";

import { useResetUserPassword } from "../hooks/useAdminUsers";
import type { AdminUser } from "../services/admin.service";

const MASK = "••••••••••••••••";

/**
 * The login details for one account: the email they sign in with, and — right
 * after the account is created or its password is regenerated — the temporary
 * password, readable once.
 *
 * The password is minted by the server, stored only as a hash and handed back
 * in a single response, so this dialog is the only place it ever exists in
 * readable form. Hence masked by default, and the warning under it.
 */
export function UserCredentialsDialog({
  user,
  initialPassword,
  onClose,
}: {
  user: AdminUser;
  /** Set when the dialog opens straight after a create — shown immediately. */
  initialPassword?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState(initialPassword ?? "");
  const [error, setError] = useState<string | null>(null);
  const reset = useResetUserPassword();

  const regenerate = () => {
    setError(null);
    reset.mutate(user.id, {
      onSuccess: (res) => setPassword(res.temporary_password),
      onError: (err) => setError(parseApiError(err, t).message),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t("common.close")}>
        <ModalHeader
          icon={KeyRound}
          title={t("admin.users.credentials_title")}
          subject={user.full_name}
        />
        {error && <Alert variant="danger" message={error} />}

        <div className="space-y-1.5">
          <Label>{t("admin.users.login_label")}</Label>
          <CopyRow value={user.email} />
        </div>

        <div className="space-y-1.5">
          <Label>{t("admin.users.temp_password_label")}</Label>
          {password ? (
            <>
              <CopyRow value={password} secret />
              <p className="text-xs text-muted-foreground">
                {t("admin.users.temp_password_once")}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("admin.users.temp_password_hidden")}
            </p>
          )}
        </div>

        <DialogFooter className="!mt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="size-4" />
            {t("common.close")}
          </Button>
          <Button type="button" loading={reset.isPending} onClick={regenerate}>
            <RotateCcw className="size-4" />
            {t("admin.users.regenerate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One readable value with a copy button; `secret` masks it behind a toggle. */
function CopyRow({ value, secret }: { value: string; secret?: boolean }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const shown = !secret || visible;
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded border bg-muted px-2 py-1.5 font-mono text-xs">
        {shown ? value : MASK}
      </code>
      {secret && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={
            visible ? t("common.hide_password") : t("common.show_password")
          }
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("common.copy")}
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success(t("common.copied"));
        }}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
