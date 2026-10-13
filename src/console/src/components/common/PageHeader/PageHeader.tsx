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
  /** Breadcrumb trail (Overview and the URL's admin scope are auto-prepended). Omit
   *  on top-level routes. */
  breadcrumbs?: BreadcrumbItem[];
  /** Right-column actions (detail/edit pages). List screens put their "+ New"
   *  in the body ListToolbar, not here. */
  actions?: ReactNode;
  className?: string;
}

// Add the admin ancestor so pages only declare their own crumb.
// Breadcrumb itself supplies the universal Overview → /dashboard root:
//   /admin            → no root (the page IS the admin root)
//   /admin/*          → "Quản trị" → /admin
//   everything else   → no root; module breadcrumbs are explicitly declared
//                       by their pages. "/" forwards to the dashboard.
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
        <h1 className="max-w-3xl break-words text-2xl font-medium tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {(trail || actions) && (
        <div className="flex min-w-0 max-w-full flex-col gap-2 md:max-w-[55%] md:items-end">
          {trail && <Breadcrumb items={trail} />}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
