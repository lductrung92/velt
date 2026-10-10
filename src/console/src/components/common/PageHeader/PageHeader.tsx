import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import {
  Breadcrumb,
  type BreadcrumbItem,
} from "@/components/common/Breadcrumb";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Already-translated heading. */
  title: string;
  subtitle?: string;
  /** Breadcrumb trail (the scope root is auto-prepended from the URL). Omit
   *  on top-level routes. */
  breadcrumbs?: BreadcrumbItem[];
  /** Right-column actions (detail/edit pages). List screens put their "+ New"
   *  in the body ListToolbar, not here. */
  actions?: ReactNode;
  className?: string;
}

// Auto-prepend the scope root so pages only declare their own crumb:
//   /admin            → no root (the page IS the admin root)
//   /admin/*          → "Quản trị" → /admin
//   everything else   → no root. There is no dashboard screen to point at, and
//                       "/" only forwards to the CMS landing, so a root crumb
//                       here would link to a redirect under a stale label.
function pickRoot(pathname: string): BreadcrumbItem | null {
  if (pathname.startsWith("/admin/"))
    return { labelKey: "nav.admin", to: "/admin" };
  return null;
}

// Standard page header — title + subtitle on the left, breadcrumb trail +
// actions on the right (stacks on mobile). docs/styles/console/layout §2.
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  const { pathname } = useLocation();
  const root = pickRoot(pathname);
  const trail: BreadcrumbItem[] | undefined = breadcrumbs?.length
    ? root
      ? [root, ...breadcrumbs]
      : breadcrumbs
    : undefined;

  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="max-w-3xl break-words text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {(trail || actions) && (
        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          {trail && <Breadcrumb items={trail} />}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
