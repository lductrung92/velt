import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Alert } from "@/components/common/Alert";
import { PasswordField } from "@/components/common/PasswordField";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { makeReauthSchema, type ReauthValues } from "../schemas/account";

// Inline re-auth panel for sensitive 2FA ops (disable / regenerate). Password is
// verified by the BE; client only requires non-empty. Errors are passed back in
// via `error` so the panel stays open for retry.
export function ReauthConfirm({
  title,
  description,
  confirmLabel,
  destructive = false,
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading: boolean;
  error: string | null;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<ReauthValues>({
    resolver: zodResolver(makeReauthSchema(t)),
    defaultValues: { password: "" },
    mode: "onChange",
  });

  const onSubmit = form.handleSubmit((v) => onConfirm(v.password));

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {error && <Alert variant="danger" message={error} />}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>
                  {t("account.2fa.password_label")}
                </FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="current-password"
                    placeholder={t("account.2fa.password_ph")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              loading={loading}
            >
              {confirmLabel}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
