import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

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
import { parseApiError } from "@/utils/apiError";

import { AuthLayout } from "../components/AuthLayout";
import { useResetPassword } from "../hooks/useAuth";
import { makeResetSchema, type ResetValues } from "../schemas/auth";

// Full-panel terminal state: no token in the URL, or the server rejected it as
// expired/used. docs/screens/auth-reset-password/workflows.md.
function TokenPanel({
  titleKey,
  bodyKey,
}: {
  titleKey: string;
  bodyKey: string;
}) {
  const { t } = useTranslation();
  return (
    <AuthLayout title={t(titleKey)} subtitle={t(bodyKey)}>
      <Link to="/forgot-password" className="block">
        <Button type="button" className="w-full">
          {t("auth.reset.request_new_link")}
        </Button>
      </Link>
    </AuthLayout>
  );
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const schema = useMemo(() => makeResetSchema(t), [t]);
  const form = useForm<ResetValues>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", confirm_password: "" },
    mode: "onChange",
  });

  const reset = useResetPassword();
  const [topError, setTopError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  // No token → can't proceed at all.
  if (!token) {
    return (
      <TokenPanel
        titleKey="auth.reset.token_missing_title"
        bodyKey="auth.reset.token_missing_body"
      />
    );
  }

  // Server said the token is expired/used → terminal panel, offer a new link.
  if (tokenInvalid) {
    return (
      <TokenPanel
        titleKey="auth.reset.token_invalid_title"
        bodyKey="auth.reset.token_invalid_body"
      />
    );
  }

  const onSubmit = form.handleSubmit((values) => {
    setTopError(null);
    // confirm_password is client-only and never leaves the browser.
    reset.mutate(
      { token, newPassword: values.new_password },
      {
        onSuccess: () => {
          toast.success(t("auth.reset.success"));
          navigate("/login", { replace: true });
        },
        onError: (err) => {
          const parsed = parseApiError(err, t);
          if (parsed.key === "invalid_or_expired_token") {
            setTokenInvalid(true);
            return;
          }
          if (parsed.code === 422 && parsed.fieldErrors.new_password) {
            form.setError("new_password", {
              message: parsed.fieldErrors.new_password,
            });
            return;
          }
          setTopError(parsed.message);
        },
      },
    );
  });

  return (
    <AuthLayout
      title={t("auth.reset.title")}
      subtitle={t("auth.reset.subtitle")}
    >
      {topError && (
        <Alert className="mb-4" variant="danger" message={topError} />
      )}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="new_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>
                  {t("auth.reset.new_password_label")}
                </FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="new-password"
                    placeholder={t("auth.reset.new_password_ph")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirm_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("auth.reset.confirm_label")}</FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="new-password"
                    placeholder={t("auth.reset.confirm_ph")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" loading={reset.isPending}>
            {t("auth.reset.submit")}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
