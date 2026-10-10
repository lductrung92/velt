import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface Props {
  accept: string;
  maxSizeMb: number;
  className?: string;
}

// Help block above the picker — accepted MIMEs (rendered as JPEG/PNG/WEBP)
// and the size cap. Lives inside the Upload tab so the constraints are
// surfaced before the user triggers the OS dialog.
export function ImageUploadHelp({ accept, maxSizeMb, className }: Props) {
  const { t } = useTranslation();
  const formats = accept
    .split(",")
    .map((m) => m.trim().split("/")[1]?.toUpperCase() ?? m.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <ul
      className={cn(
        "mb-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground",
        className,
      )}
    >
      <li>{t("image.upload.help.format", { formats })}</li>
      <li>{t("image.upload.help.max_size", { size: maxSizeMb })}</li>
    </ul>
  );
}
