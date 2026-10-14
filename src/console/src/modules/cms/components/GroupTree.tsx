import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import {
  ancestry,
  GROUPING_ONLY,
  type Group,
  type RegionGroupDetail,
} from "../services/regions.service";

/**
 * Which kind of page the board below is editing.
 *
 * A tree rather than tabs: nine groups with two levels of nesting read as a
 * hierarchy, which is the whole point — a block put on a parent shows on every
 * child. Tabs would flatten exactly the relationship the editor needs to see.
 *
 * A grouping-only node (Products, Blog) matches no page of its own; it exists
 * so "every product page" has somewhere to live. It is selectable, because
 * that is where such a block is put, and it says so underneath.
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
  return (
    <div className="space-y-1">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("cms.appearance.groups_title")}
      </p>
      <ul
        className="space-y-0.5"
        role="tree"
        aria-label={t("cms.appearance.groups_title")}
      >
        {groups.map(({ group }) => {
          const depth = ancestry(group, groups).length - 1;
          const grouping = GROUPING_ONLY.includes(group);
          return (
            <li key={group} role="none">
              <button
                type="button"
                role="treeitem"
                aria-selected={group === value}
                aria-level={depth + 1}
                style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
                className={cn(
                  "w-full rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
                  group === value
                    ? "bg-accent font-medium text-accent-foreground"
                    : "hover:bg-muted/50",
                )}
                onClick={() => onChange(group)}
              >
                {t(`cms.appearance.group.${group}`)}
                {grouping && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {t("cms.appearance.grouping_only")}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
