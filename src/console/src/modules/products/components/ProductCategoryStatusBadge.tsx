import { useTranslation } from "react-i18next";

import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";

import type { ProductCategoryStatus } from "../services/productCategories.service";

// A category's three states, on the shared palette and the common
// content_status.* labels (status-badge §1 — never a per-module label). Not
// ProductStatusBadge: that one is a product's own vocabulary, and the two
// happening to overlap today is not a reason to make a category's status
// change whenever a product's does.
const TONE: Record<ProductCategoryStatus, StatusTone> = {
  draft: "neutral",
  published: "success",
  archived: "archive",
};

export function ProductCategoryStatusBadge({
  status,
}: {
  status: ProductCategoryStatus;
}) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={TONE[status]}>
      {t(`content_status.${status}`)}
    </StatusBadge>
  );
}
