import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { parseApiError } from "@/utils/apiError";

import { AuthLayout } from "../components/AuthLayout";
import { useForgotPassword } from "../hooks/useAuth";
import { makeForgotSchema, type ForgotValues } from "../schemas/auth";

const RESEND_COOLDOWN_SEC = 30; // docs/screens/auth-forgot-password (default 30s)

export default function ForgotPassword() {
  const { t } = useTranslation();
  const schema = useMemo(() => makeForgotSchema(t), [t]);
  const form = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  const forgot = useForgotPassword();
  const [submitted, setSubmitted] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Tick down the resend cooldown. One interval runs while active; the
  // functional update reads the latest value, so `cooldown` isn't a dependency
  // and the effect only re-runs when it crosses the 0 boundary.
  const active = cooldown > 0;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);

  function submit(email: string) {
    setTopError(null);
    forgot.mutate(
      { email },
      {
        onSuccess: () => {
          // ALWAYS generic — never reveal whether the email exists.
          setSubmitted(true);
          setCooldown(RESEND_COOLDOWN_SEC);
        },
        onError: (err) => {
          const parsed = parseApiError(err, t);
          if (parsed.code === 422 && parsed.fieldErrors.email) {
            form.setError("email", { message: parsed.fieldErrors.email });
            return;
          }
          if (parsed.key === "rate_limited") setCooldown(RESEND_COOLDOWN_SEC);
          setTopError(parsed.message);
        },
      },
    );
  }

  const onSubmit = form.handleSubmit((values) => submit(values.email));

  return (
    <AuthLayout
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
    >
      {topError && (
        <Alert className="mb-4" variant="danger" message={topError} />
      )}

      {submitted ? (
        <div className="space-y-4">
          <Alert variant="info" message={t("auth.forgot.success_generic")} />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={cooldown > 0}
            loading={forgot.isPending}
            onClick={() => submit(form.getValues("email"))}
          >
            {cooldown > 0
              ? t("auth.forgot.resend_in", { seconds: cooldown })
              : t("auth.forgot.resend")}
          </Button>
          <div className="text-center">
            <Link
              to="/login"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {t("common.back_to_login")}
            </Link>
          </div>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("auth.forgot.email_label")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username"
                      placeholder={t("auth.forgot.email_ph")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" loading={forgot.isPending}>
              {t("auth.forgot.submit")}
            </Button>
            <div className="text-center">
              <Link
                to="/login"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {t("common.back_to_login")}
              </Link>
            </div>
          </form>
        </Form>
      )}
    </AuthLayout>
  );
}
