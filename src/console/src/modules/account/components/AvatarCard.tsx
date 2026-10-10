import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  ImageUpload,
  type ImageUploadValue,
} from "@/components/common/ImageHandler";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseApiError } from "@/utils/apiError";

import { accountKeys } from "../hooks/accountKeys";
import { useDeleteAvatar, useProfile } from "../hooks/useAccount";
import type { AvatarResponse } from "../services/account.service";

// AvatarCard is the left column of the account screen: the user's avatar plus
// name/email. Uses the shared ImageUpload picker (crop/zoom/rotate + webcam) —
// it uploads the cropped blob straight to /account/avatar, then we refresh the
// (shared) profile query so the new avatar shows here and in the topbar.
export function AvatarCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const profile = useProfile();
  const remove = useDeleteAvatar();

  const user = profile.data?.user;
  const avatarValue: ImageUploadValue = user?.avatar_url
    ? { kind: "uploaded", fileId: "", url: user.avatar_url }
    : { kind: "empty" };

  function handleChange(next: ImageUploadValue) {
    if (next.kind === "uploaded") {
      // The picker already POSTed the cropped image to /account/avatar; just
      // refresh the canonical profile so every avatar (here + topbar) updates.
      qc.invalidateQueries({ queryKey: accountKeys.profile() });
      toast.success(t("account.profile.avatar_updated"));
    } else if (next.kind === "empty") {
      remove.mutate(undefined, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: accountKeys.profile() });
          toast.success(t("account.profile.avatar_removed"));
        },
        onError: (err) => toast.error(parseApiError(err, t).message),
      });
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 pt-5 text-center">
        {profile.isLoading ? (
          <Skeleton className="size-28 rounded-full" />
        ) : (
          <ImageUpload
            type="circle"
            radius={56}
            value={avatarValue}
            onChange={handleChange}
            uploadUrl="/account/avatar"
            uploadResponseAdapter={(r) => ({
              fileId: "",
              url: (r as AvatarResponse).avatar_url,
            })}
          />
        )}

        {user && (
          <div className="space-y-0.5">
            <p className="font-medium">{user.full_name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
