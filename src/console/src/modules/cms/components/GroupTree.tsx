import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Select } from "@/components/common/Select";
import { Card } from "@/components/ui/card";

import {
  ancestry,
  GROUPING_ONLY,
  type Group,
  type RegionGroupDetail,
} from "../services/regions.service";

/**
 * Which kind of page the board is editing.
 *
 * One select, the same one every other screen uses. A hand-built tree had to
 * carry its own rails, indents, hover and selected states, and it drifted from
 * the rest of the console every time one of them was tuned; nine entries do
 * not earn a bespoke control.
 *
 * The nesting survives as indentation in the labels, which is enough to read
 * what inherits from what — the board itself names the ancestor a slot is
 * inherited from, so the picker does not have to carry that weight too.
 */
export function GroupTree({
  groups,
  value,
  onChange,
}: {
  groups: RegionGroupDetail[];
  value: Group;
  onChange: (group: Group) => void;
}) {
  const { t } = useTranslation();

  const options = groups.map(({ group }) => {
    const depth = ancestry(group, groups).length - 1;
    const name = t(`cms.appearance.group.${group}`);
    const tag = GROUPING_ONLY.includes(group)
      ? ` ${t("cms.appearance.grouping_only")}`
      : "";
    // Non-breaking spaces: react-select renders the label as text, and a plain
    // space would collapse and take the indent with it.
    return { value: group, label: "  ".repeat(depth) + name + tag };
  });

  return (
    <Card className="appearance-panel appearance-groups">
      <div className="appearance-panel-heading">
        <Layers className="size-4" />
        <h2>{t("cms.appearance.groups_title")}</h2>
      </div>
      <div className="appearance-group-field">
        <Select
          inputId="appearance-group"
          aria-label={t("cms.appearance.groups_title")}
          options={options}
          value={options.find((o) => o.value === value) ?? null}
          onChange={(option) => option && onChange(option.value)}
          isClearable={false}
          isSearchable={false}
        />
      </div>
    </Card>
  );
}
