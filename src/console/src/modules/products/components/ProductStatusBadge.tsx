import { useTranslation } from "react-i18next";

import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";

import type {
  ProductLifecycle,
  ProductStatus,
} from "../services/products.service";

// Two badges, never one. `status` says who can see the row; `lifecycle` says
// what the page claims about the product, and the pair is meaningful on its own
// (published + idea = publicly gauging demand). See docs/domains/products §3.

const STATUS_TONE: Record<ProductStatus, StatusTone> = {
  draft: "neutral",
  published: "success",
  archived: "warning",
};

const LIFECYCLE_TONE: Record<ProductLifecycle, StatusTone> = {
  idea: "neutral",
  building: "warning",
  launched: "success",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={STATUS_TONE[status]}>
      {t(`products.status.${status}`)}
    </StatusBadge>
  );
}

export function ProductLifecycleBadge({
  lifecycle,
}: {
  lifecycle: ProductLifecycle;
}) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={LIFECYCLE_TONE[lifecycle]}>
      {t(`products.lifecycle.${lifecycle}`)}
    </StatusBadge>
  );
}
