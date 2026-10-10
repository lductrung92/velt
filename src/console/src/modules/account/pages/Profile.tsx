import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { parseApiError } from "@/utils/apiError";

import type { ProfileResponse } from "../services/account.service";
import { useProfile, useUpdateProfile } from "../hooks/useAccount";
import { makeProfileSchema, type ProfileValues } from "../schemas/account";

// Basic-info tab of the account screen (rendered in the right column via the
// AccountLayout <Outlet/>). The avatar lives in the shared left column
// (AvatarCard); this panel owns the editable identity fields only.
export default function Profile() {
  const { t } = useTranslation();
  const profile = useProfile();

  if (profile.isLoading) return <ProfileSkeleton />;
  if (profile.isError || !profile.data) {
    return (
      <Card>
        <CardContent className="pt-5">
          <Alert
            variant="danger"
            message={parseApiError(profile.error, t).message}
          />
        </CardContent>
      </Card>
    );
  }
  return <ProfileForm profile={profile.data} />;
}

function ProfileSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

function ProfileForm({ profile }: { profile: ProfileResponse }) {
  const { t } = useTranslation();
  const { user } = profile;

  const schema = makeProfileSchema(t);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: user.full_name },
    mode: "onChange",
  });

  const update = useUpdateProfile();

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(values.full_name.trim(), {
      onSuccess: () => toast.success(t("account.profile.saved")),
      onError: (err) => {
        const parsed = parseApiError(err, t);
        if (parsed.code === 422 && parsed.fieldErrors.full_name) {
          form.setError("full_name", { message: parsed.fieldErrors.full_name });
        } else {
          toast.error(parsed.message);
        }
      },
    });
  });

  return (
    <Card>
      <CardContent className="pt-5">
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>
                    {t("account.profile.full_name_label")}
                  </FormLabel>
                  <FormControl>
                    <TextField
                      maxLength={120}
                      placeholder={t("account.profile.full_name_ph")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label htmlFor="account-email">
                {t("account.profile.email_label")}
              </Label>
              <Input id="account-email" value={user.email} disabled readOnly />
              <p className="text-xs text-muted-foreground">
                {t("account.profile.email_locked_hint")}
              </p>
            </div>
            <Button type="submit" loading={update.isPending}>
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
