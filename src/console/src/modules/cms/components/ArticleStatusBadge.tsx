import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/common/StatusBadge";

import type { ArticleStatus } from "../services/articles.service";
import { statusTone } from "../utils/articleStatus";

// The shared 6-state editorial status pill: one palette, labels from the common
// content_status.* bundle (table-columns §2 — never a per-module label).
export function ArticleStatusBadge({ status }: { status: ArticleStatus }) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={statusTone(status)}>
      {t(`content_status.${status}`)}
    </StatusBadge>
  );
}
