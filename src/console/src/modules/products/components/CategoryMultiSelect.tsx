import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";

import { useProductCategories } from "../hooks/useProductCategories";
import { ChipMultiSelect } from "./ChipMultiSelect";

// Categories are a small curated vocabulary (four of them today), so the same
// chip treatment as audience/platforms shows the whole set and the current
// answer at once. If the taxonomy ever grows past a screenful this becomes a
// searchable picker instead.
export function CategoryMultiSelect({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const categories = useProductCategories();

  if (categories.isLoading) return <Skeleton className="h-9 w-full" />;

  const items = categories.data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("products.categories.empty_title")}
      </p>
    );
  }

  return (
    <ChipMultiSelect
      name="product-categories"
      value={value}
      disabled={disabled}
      options={items.map((c) => ({ value: c.id, label: c.name }))}
      onChange={onChange}
    />
  );
}
