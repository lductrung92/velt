import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

import type { NavItem, NavSection } from "./navItems";

interface SidebarNavProps {
  sections: NavSection[];
  pathname: string;
  showLabels: boolean;
  isRail: boolean;
  openBranch: string | null;
  onToggleBranch: (key: string) => void;
  onNavClick: () => void;
}

// Pure renderer for the sidebar across three modes: expanded inline submenu,
// icon-rail flyout, mobile drawer. Gating happens upstream (visibleNavSections).
// Sections render a muted caption when labels are shown, or a hairline divider
// in rail mode (caption hidden, group boundary still legible).
export function SidebarNav({
  sections,
  pathname,
  showLabels,
  isRail,
  openBranch,
  onToggleBranch,
  onNavClick,
}: SidebarNavProps) {
  const { t } = useTranslation();
  return (
    <nav className="flex-1 overflow-y-auto p-2">
      {sections.map((section, i) => (
        <div key={section.key} className={cn(i > 0 && "mt-4")}>
          {showLabels ? (
            <p className="p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t(section.labelKey)}
            </p>
          ) : (
            i > 0 && <div aria-hidden className="mx-2 mb-2 border-t" />
          )}
          <ul className="space-y-1">
            {section.items.map((item) => (
              <NavItemRow
                key={item.key}
                item={item}
                pathname={pathname}
                showLabels={showLabels}
                isRail={isRail}
                openBranch={openBranch}
                onToggleBranch={onToggleBranch}
                onNavClick={onNavClick}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

interface NavItemRowProps {
  item: NavItem;
  pathname: string;
  showLabels: boolean;
  isRail: boolean;
  openBranch: string | null;
  onToggleBranch: (key: string) => void;
  onNavClick: () => void;
}

// Splits leaf vs branch into separate components so hooks (in the branch) are
// never called conditionally (rules-of-hooks).
function NavItemRow(props: NavItemRowProps) {
  return props.item.children ? (
    <NavBranch {...props} />
  ) : (
    <NavLeaf {...props} />
  );
}

function NavLeaf({ item, showLabels, onNavClick }: NavItemRowProps) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.labelKey);
  return (
    <li>
      <NavLink
        to={item.path!}
        end={item.end ?? item.path === "/"}
        onClick={onNavClick}
        title={label}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )
        }
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {showLabels && (
          <>
            <span className="flex-1 truncate text-left">{label}</span>
            {item.badge && (
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
                {item.badge}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

function NavBranch({
  item,
  pathname,
  showLabels,
  isRail,
  openBranch,
  onToggleBranch,
  onNavClick,
}: NavItemRowProps) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const children = item.children!;

  const isOpen = openBranch === item.key;
  const isBranchActive = children.some(
    (c) => pathname === c.path || pathname.startsWith(c.path + "/"),
  );
  const activeChildIndex = children.findIndex((c) =>
    c.end
      ? pathname === c.path
      : pathname === c.path || pathname.startsWith(c.path + "/"),
  );

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [flyoutCoords, setFlyoutCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!isRail || !isOpen || !buttonRef.current) {
      setFlyoutCoords(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setFlyoutCoords({ top: rect.top, left: rect.right + 13 });
  }, [isRail, isOpen]);

  return (
    <li className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onToggleBranch(item.key)}
        aria-expanded={isOpen}
        aria-current={isBranchActive ? "page" : undefined}
        title={label}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isOpen || isBranchActive
            ? "text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          isBranchActive && isRail && "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {showLabels && (
          <>
            <span className="flex-1 truncate text-left">{label}</span>
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </>
        )}
        {isRail && (
          <ChevronRight className="absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/40" />
        )}
      </button>

      {/* Expanded mode: inline submenu with a guide line down to the active row. */}
      {!isRail && isOpen && (
        <ul className="ml-5 mt-1 space-y-0">
          {children.map((child, i) => {
            const childActive = i === activeChildIndex;
            const showLine = activeChildIndex !== -1 && i < activeChildIndex;
            const ChildIcon = child.icon;
            return (
              <li key={child.path} className="relative">
                {showLine && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-0 top-0 h-full w-px bg-border"
                  />
                )}
                {childActive && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-0 top-0 h-1/2 w-2.5 rounded-bl-[10px] border-b border-l border-border"
                  />
                )}
                <NavLink
                  to={child.path}
                  end={child.end}
                  onClick={onNavClick}
                  className={cn(
                    "group flex h-9 items-center gap-3 rounded-lg pl-4 pr-3 text-sm font-medium transition-colors",
                    childActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ChildIcon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      childActive
                        ? "text-primary"
                        : "text-muted-foreground/70 group-hover:text-foreground/70",
                    )}
                  />
                  <span className="truncate">{t(child.labelKey)}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}

      {/* Rail-mode flyout: portal'd to <body> so the aside's overflow can't clip it. */}
      {isRail &&
        isOpen &&
        flyoutCoords &&
        createPortal(
          <ul
            data-rail-flyout
            style={{ top: flyoutCoords.top, left: flyoutCoords.left }}
            className="fixed z-50 min-w-[12rem] rounded-md border bg-popover p-1 shadow-md"
          >
            <li className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </li>
            {children.map((child) => {
              const ChildIcon = child.icon;
              return (
                <li key={child.path}>
                  <NavLink
                    to={child.path}
                    end={child.end}
                    onClick={onNavClick}
                    className={({ isActive }) =>
                      cn(
                        "flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                      )
                    }
                  >
                    <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t(child.labelKey)}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </li>
  );
}
