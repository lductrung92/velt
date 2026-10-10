import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/common/StatusBadge";

import type { PageStatus } from "../services/pages.service";
import { statusTone } from "../utils/articleStatus";

// Thin wrapper over the shared StatusBadge: page statuses are a subset of the
// editorial statuses, so they reuse the one palette + content_status.* labels
// (status-badge §1 — never a per-module colour/label).
export function PageStatusBadge({ status }: { status: PageStatus }) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={statusTone(status)}>
      {t(`content_status.${status}`)}
    </StatusBadge>
  );
}
