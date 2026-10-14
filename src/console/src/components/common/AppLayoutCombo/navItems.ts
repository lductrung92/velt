import {
  FileStack,
  FileText,
  FolderTree,
  Headset,
  History,
  LayoutDashboard,
  LayoutPanelTop,
  ListTree,
  MessagesSquare,
  MonitorSmartphone,
  Newspaper,
  Package,
  PackageSearch,
  Shapes,
  ShieldCheck,
  ShieldHalf,
  SlidersHorizontal,
  Tags,
  UserPlus,
  Users,
  Users2,
  type LucideIcon,
} from "lucide-react";

// Console navigation model. Branches render inline (expanded) or as a rail
// flyout (collapsed). Gating is RBAC permission/role based — UX-only; the
// backend re-enforces every call.
export interface NavChild {
  path: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
  /**
   * Hidden unless the user holds this permission (super_admin `*` bypasses).
   * A list means "any of these" — one screen can be reachable through more
   * than one permission when it shows each role a different slice of itself.
   */
  permission?: string | string[];
}

export interface NavItem {
  /** Stable key for expand/collapse state (survives translation). */
  key: string;
  labelKey: string;
  icon: LucideIcon;
  path?: string;
  end?: boolean;
  children?: NavChild[];
  permission?: string | string[];
  /** Hidden unless the user holds at least one of these RBAC roles. */
  rbacRoles?: string[];
  /** Right-aligned count/notification badge. */
  badge?: string;
}

// A labelled group of nav items. The sidebar renders the section label as a
// muted caption (expanded) or a divider (rail). A section with no visible items
// is dropped entirely.
export interface NavSection {
  /** Stable key (survives translation). */
  key: string;
  labelKey: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "overview",
    labelKey: "nav.section.overview",
    items: [
      {
        key: "dashboard",
        labelKey: "dashboard.title",
        icon: LayoutDashboard,
        path: "/dashboard",
        end: true,
      },
      {
        key: "cms",
        labelKey: "nav.cms",
        icon: Newspaper,
        children: [
          {
            path: "/cms/articles",
            labelKey: "nav.cms_articles",
            icon: FileText,
            permission: "cms.article.view",
          },
          {
            path: "/cms/pages",
            labelKey: "nav.cms_pages",
            icon: FileStack,
            permission: "cms.page.view",
          },
          {
            path: "/cms/categories",
            labelKey: "nav.cms_categories",
            icon: FolderTree,
            permission: "cms.article.view",
          },
          {
            path: "/cms/tags",
            labelKey: "nav.cms_tags",
            icon: Tags,
            permission: "cms.article.view",
          },
          {
            path: "/cms/menus",
            labelKey: "nav.cms_menus",
            icon: ListTree,
            permission: "cms.menu.manage",
          },
          {
            path: "/cms/giao-dien",
            labelKey: "nav.cms_appearance",
            icon: LayoutPanelTop,
            permission: "cms.menu.manage",
          },
        ],
      },
      {
        key: "crm",
        labelKey: "nav.crm",
        icon: Headset,
        children: [
          {
            path: "/leads",
            labelKey: "nav.leads",
            icon: UserPlus,
            permission: "crm.leads.view_all",
          },
          {
            path: "/chat",
            labelKey: "nav.chat",
            icon: MessagesSquare,
            permission: "ai.chat.handle",
          },
        ],
      },
      {
        key: "catalog",
        labelKey: "nav.catalog",
        icon: Package,
        children: [
          {
            path: "/products",
            labelKey: "nav.products",
            icon: PackageSearch,
            permission: "products.view",
          },
          {
            path: "/product-categories",
            labelKey: "nav.product_categories",
            icon: Shapes,
            permission: "products.view",
          },
        ],
      },
    ],
  },
  {
    key: "system",
    labelKey: "nav.section.system",
    items: [
      {
        key: "members",
        labelKey: "nav.members",
        icon: Users2,
        path: "/members",
        permission: "members.view",
      },
      {
        key: "admin",
        labelKey: "nav.admin",
        icon: ShieldHalf,
        children: [
          {
            path: "/admin/users",
            labelKey: "nav.users",
            icon: Users,
            permission: "users.read",
          },
          {
            path: "/admin/roles",
            labelKey: "nav.rbac",
            icon: ShieldCheck,
            permission: "roles.read",
          },
          {
            path: "/admin/sessions",
            labelKey: "nav.sessions",
            icon: MonitorSmartphone,
            permission: "sessions.read",
          },
          {
            path: "/admin/activity",
            labelKey: "nav.activity",
            icon: History,
            permission: "activity.read",
          },
          {
            path: "/admin/settings",
            labelKey: "nav.settings",
            icon: SlidersHorizontal,
            // Either permission opens it; the screen shows what you may write.
            permission: ["settings.manage", "cms.settings.manage"],
          },
        ],
      },
    ],
  },
  // Account (profile/password/2FA) is reached from the header user menu, not the
  // sidebar — see AppLayoutCombo + docs/styles/console/layout.md.
];

// Filter the nav tree against the user's permissions/roles. A branch with no
// visible children is dropped; a section with no visible items is dropped too.
// (No single-child collapse — keeps the branch label meaningful, see
// docs/reports/console-ui-parity.md.)
export function visibleNavSections(
  perms: Set<string>,
  roles: Set<string>,
): NavSection[] {
  const isSuper = perms.has("*");
  const can = (p?: string | string[]) =>
    !p || isSuper || (Array.isArray(p) ? p.some((x) => perms.has(x)) : perms.has(p));
  const hasRole = (rs?: string[]) => !rs || rs.some((r) => roles.has(r));

  const filterItems = (items: NavItem[]) =>
    items.flatMap((item) => {
      if (!item.children) {
        return can(item.permission) && hasRole(item.rbacRoles) ? [item] : [];
      }
      if (!hasRole(item.rbacRoles)) return [];
      const children = item.children.filter((c) => can(c.permission));
      return children.length > 0 ? [{ ...item, children }] : [];
    });

  return NAV_SECTIONS.flatMap((section) => {
    const items = filterItems(section.items);
    return items.length > 0 ? [{ ...section, items }] : [];
  });
}

// Which branch (if any) owns the current pathname — used to auto-open it.
export function activeBranchKey(pathname: string): string | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!item.children) continue;
      if (
        item.children.some(
          (c) => pathname === c.path || pathname.startsWith(c.path + "/"),
        )
      ) {
        return item.key;
      }
    }
  }
  return null;
}
