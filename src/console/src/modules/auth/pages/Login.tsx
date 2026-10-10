import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiError } from "@/utils/apiError";
import { safeRedirect } from "@/utils/redirect";

import { AuthLayout } from "../components/AuthLayout";
import { useLogin, useVerifyTwoFactor } from "../hooks/useAuth";
import { makeLoginSchema, type LoginValues } from "../schemas/auth";
import { isTwoFactorChallenge } from "../services/auth.service";

type Step = "credentials" | "two_factor";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = safeRedirect(params.get("redirect"));

  const [step, setStep] = useState<Step>("credentials");
  const [challengeToken, setChallengeToken] = useState("");
  const [topError, setTopError] = useState<string | null>(null);

  // Step 1 uses react-hook-form (multi-field). Step 2 is a single field, so
  // plain local state keeps it simple (avoids a second RHF form instance).
  const loginSchema = useMemo(() => makeLoginSchema(t), [t]);
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const login = useLogin();
  const verify = useVerifyTwoFactor();

  // Focus the code field when the 2FA step opens (workflows.md §2).
  useEffect(() => {
    if (step === "two_factor") codeRef.current?.focus();
  }, [step]);

  function backToCredentials() {
    setStep("credentials");
    setTopError(null);
    setCode("");
    setCodeError(null);
  }

  function handleError(err: unknown) {
    const parsed = parseApiError(err, t);
    // 422 → inline per field; otherwise a top-level alert (incl. the
    // anti-enumeration `invalid_credentials`). 401 domain keys never logout.
    if (parsed.code === 422 && Object.keys(parsed.fieldErrors).length > 0) {
      for (const [field, message] of Object.entries(parsed.fieldErrors)) {
        if (field === "email" || field === "password") {
          loginForm.setError(field, { message });
        }
      }
      setTopError(null);
      return;
    }
    // 2FA challenge expired → restart from the password step.
    if (parsed.key === "challenge_expired") {
      setStep("credentials");
      setCode("");
      setCodeError(null);
    }
    setTopError(parsed.message);
  }

  const onSubmitCredentials = loginForm.handleSubmit((values) => {
    setTopError(null);
    login.mutate(values, {
      onSuccess: (result) => {
        if (isTwoFactorChallenge(result)) {
          setChallengeToken(result.challenge_token);
          setStep("two_factor");
          return;
        }
        navigate(redirectTo, { replace: true });
      },
      onError: handleError,
    });
  });

  function onSubmitTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setCodeError(t("errors.validation.required"));
      return;
    }
    setCodeError(null);
    setTopError(null);
    verify.mutate(
      { challengeToken, code: code.trim() },
      {
        onSuccess: () => navigate(redirectTo, { replace: true }),
        onError: handleError,
      },
    );
  }

  return (
    <AuthLayout
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
    >
      {topError && (
        <Alert className="mb-4" variant="danger" message={topError} />
      )}

      {step === "credentials" ? (
        <Form {...loginForm}>
          <form onSubmit={onSubmitCredentials} noValidate className="space-y-4">
            <FormField
              control={loginForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("auth.login.email_label")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username"
                      placeholder={t("auth.login.email_ph")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={loginForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>
                    {t("auth.login.password_label")}
                  </FormLabel>
                  <FormControl>
                    <PasswordField
                      autoComplete="current-password"
                      placeholder={t("auth.login.password_ph")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" loading={login.isPending}>
              {t("auth.login.submit")}
            </Button>
            <div className="text-center">
              <Link
                to="/forgot-password"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {t("auth.login.forgot")}
              </Link>
            </div>
          </form>
        </Form>
      ) : (
        <form onSubmit={onSubmitTwoFactor} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="twofactor-code" required>
              {t("auth.login.code_label")}
            </Label>
            <Input
              id="twofactor-code"
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("auth.login.code_ph")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!codeError}
              aria-describedby={codeError ? "twofactor-code-error" : undefined}
            />
            <p className="text-xs text-muted-foreground">
              {t("auth.login.code_hint")}
            </p>
            {codeError && (
              <p
                id="twofactor-code-error"
                role="alert"
                className="!mt-1 text-xs font-medium text-destructive"
              >
                {codeError}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" loading={verify.isPending}>
            {t("auth.login.verify")}
          </Button>
          <div className="text-center">
            <button
              type="button"
              onClick={backToCredentials}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("auth.login.back_to_password")}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
