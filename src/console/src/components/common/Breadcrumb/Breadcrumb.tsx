import { ChevronRight, LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import "./breadcrumb.css";

export interface BreadcrumbItem {
  /** i18n key. Preferred over `label`. */
  labelKey?: string;
  /** Already-translated text (when the label can't live in i18n). */
  label?: string;
  /** Link target. The last item never links (WAI-ARIA current page). */
  to?: string;
}

// Every trail starts at Overview. The current page never links to itself.
export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const root: BreadcrumbItem = {
    labelKey: "dashboard.title",
    to: "/dashboard",
  };
  const hasRoot =
    items[0].to === root.to || items[0].labelKey === root.labelKey;
  const trail = hasRoot ? [root, ...items.slice(1)] : [root, ...items];

  return (
    <nav
      aria-label={t("common.breadcrumbs")}
      className={cn("breadcrumb", className)}
    >
      <ol className="breadcrumb-trail">
        {trail.map((item, i) => {
          const isLast = i === trail.length - 1;
          const text = item.labelKey ? t(item.labelKey) : (item.label ?? "");
          return (
            <li className="breadcrumb-item" key={i}>
              {i > 0 && (
                <ChevronRight
                  className="breadcrumb-separator"
                  aria-hidden="true"
                />
              )}
              {item.to && !isLast ? (
                <Link to={item.to} className="breadcrumb-link" title={text}>
                  {i === 0 && (
                    <span className="breadcrumb-root-icon" aria-hidden="true">
                      <LayoutDashboard />
                    </span>
                  )}
                  <span className="breadcrumb-text">{text}</span>
                </Link>
              ) : (
                <span
                  className={
                    isLast ? "breadcrumb-current" : "breadcrumb-parent"
                  }
                  aria-current={isLast ? "page" : undefined}
                  title={text}
                >
                  {text}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
