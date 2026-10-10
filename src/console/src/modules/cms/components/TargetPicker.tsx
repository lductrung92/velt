import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Select } from "@/components/common/Select/Select";

import {
  useArticleTargets,
  useCategoryTargets,
  usePageTargets,
} from "../hooks/useMenuTargets";
import type { MenuLinkType } from "../services/menus.service";

// Entity target picker for a menu item. Renders a searchable <Select> over the
// entity matching `linkType` (article = server-side search; page/category =
// client-filtered full list). `value` is the target_id; `onChange` emits the id.
export function TargetPicker({
  linkType,
  value,
  onChange,
  invalid,
  inputId,
}: {
  linkType: MenuLinkType;
  value: string | null;
  onChange: (id: string | null) => void;
  invalid?: boolean;
  inputId?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");

  const article = useArticleTargets(q, linkType === "article");
  const page = usePageTargets(linkType === "page");
  const category = useCategoryTargets(linkType === "category");

  const active =
    linkType === "article" ? article : linkType === "page" ? page : category;

  // Resolve the selected option's label from the loaded list; fall back to a
  // generic label when the current target isn't in the current results (a
  // paginated article search may not include it).
  const selected = value
    ? (active.options.find((o) => o.value === value) ?? {
        value,
        label: t("cms.menus.item.target_selected"),
      })
    : null;

  return (
    <Select
      inputId={inputId}
      options={active.options}
      value={selected}
      onChange={(o) => onChange(o?.value ?? null)}
      isLoading={active.isLoading}
      invalid={invalid}
      placeholder={t("cms.menus.item.target_ph")}
      {...(linkType === "article"
        ? { inputValue: q, onInputChange: setQ }
        : {})}
    />
  );
}
