import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/common/StatusBadge";

import type { CategoryStatus } from "../services/categories.service";
import { statusTone } from "../utils/articleStatus";

// Thin wrapper over the shared StatusBadge, exactly like PageStatusBadge: a
// category's three states are a subset of the editorial ones, so they reuse the
// one palette and the common content_status.* labels (status-badge §1 — never a
// per-module colour or label).
export function CategoryStatusBadge({ status }: { status: CategoryStatus }) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={statusTone(status)}>
      {t(`content_status.${status}`)}
    </StatusBadge>
  );
}
