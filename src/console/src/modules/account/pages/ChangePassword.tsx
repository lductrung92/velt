import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PasswordField } from "@/components/common/PasswordField";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useLogoutAll } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { useChangePassword } from "../hooks/useAccount";
import {
  makeChangePasswordSchema,
  type ChangePasswordValues,
} from "../schemas/account";

export default function ChangePassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const schema = useMemo(() => makeChangePasswordSchema(t), [t]);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
    mode: "onChange",
  });

  const change = useChangePassword();
  const logoutAll = useLogoutAll();
  const [topError, setTopError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit((values) => {
    setTopError(null);
    // confirm_password is client-only and never sent.
    change.mutate(
      {
        currentPassword: values.current_password,
        newPassword: values.new_password,
      },
      {
        onSuccess: () => {
          toast.success(t("account.password.success"));
          form.reset();
        },
        onError: (err) => {
          const parsed = parseApiError(err, t);
          if (parsed.key === "invalid_credentials") {
            form.setError("current_password", { message: parsed.message });
          } else if (parsed.key === "password_unchanged") {
            form.setError("new_password", { message: parsed.message });
          } else if (parsed.code === 422 && parsed.fieldErrors.new_password) {
            form.setError("new_password", {
              message: parsed.fieldErrors.new_password,
            });
          } else {
            setTopError(parsed.message);
          }
        },
      },
    );
  });

  function onLogoutAll() {
    logoutAll.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  }

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4 pt-5">
        {topError && <Alert variant="danger" message={topError} />}
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="current_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>
                    {t("account.password.current_label")}
                  </FormLabel>
                  <FormControl>
                    <PasswordField
                      autoComplete="current-password"
                      placeholder={t("account.password.current_ph")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>
                    {t("account.password.new_label")}
                  </FormLabel>
                  <FormControl>
                    <PasswordField
                      autoComplete="new-password"
                      placeholder={t("account.password.new_ph")}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("account.password.length_hint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>
                    {t("account.password.confirm_label")}
                  </FormLabel>
                  <FormControl>
                    <PasswordField
                      autoComplete="new-password"
                      placeholder={t("account.password.confirm_ph")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" loading={change.isPending}>
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </form>
        </Form>

        <div className="border-t pt-4">
          <Button
            type="button"
            variant="outline"
            loading={logoutAll.isPending}
            onClick={onLogoutAll}
          >
            <LogOut className="size-4" />
            {t("account.password.logout_all")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
