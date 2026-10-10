import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  /** i18n key. Preferred over `label`. */
  labelKey?: string;
  /** Already-translated text (when the label can't live in i18n). */
  label?: string;
  /** Link target. The last item never links (WAI-ARIA current page). */
  to?: string;
}

// Compact breadcrumb trail. Last item is aria-current="page" and rendered as
// plain text even if `to` is set; intermediate items render as <Link>.
export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t("common.breadcrumbs")}
      className={cn("text-sm", className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const text = item.labelKey ? t(item.labelKey) : (item.label ?? "");
          return (
            <Fragment key={i}>
              {i > 0 && (
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              )}
              <li
                className={cn(
                  "block max-w-xs truncate",
                  isLast && "font-medium text-foreground",
                )}
                aria-current={isLast ? "page" : undefined}
                title={text}
              >
                {item.to && !isLast ? (
                  <Link
                    to={item.to}
                    className="transition-colors hover:text-foreground"
                  >
                    {text}
                  </Link>
                ) : (
                  text
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
