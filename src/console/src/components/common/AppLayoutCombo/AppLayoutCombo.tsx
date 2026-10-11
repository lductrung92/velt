import {
  ArrowUp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { LanguageToggle } from "@/components/common/LanguageToggle";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLogout } from "@/modules/auth";
import { useAuthStore } from "@/store/auth.store";

import { activeBranchKey, visibleNavSections } from "./navItems";
import { SidebarNav } from "./SidebarNav";

const APP_NAME = "Zukatek"; // brand (proper noun) — used as the logo link's a11y label
const DESKTOP_QUERY = "(min-width: 768px)";
const ASIDE_STORAGE_KEY = "velt.asideOpen";

const ASIDE_WIDTH_OPEN = "w-60";
const ASIDE_WIDTH_RAIL = "w-16";
const MAIN_PAD_OPEN = "md:pl-60";
const MAIN_PAD_RAIL = "md:pl-16";

function readInitialAsideOpen(): boolean {
  if (typeof window === "undefined") return true;
  if (!window.matchMedia(DESKTOP_QUERY).matches) return false; // mobile: closed
  const saved = window.localStorage.getItem(ASIDE_STORAGE_KEY);
  return saved === null ? true : saved !== "false";
}

// Topbar + primary sidebar shell for authenticated routes. Sidebar has three
// layouts: desktop full (w-60) / desktop rail (w-16, flyout submenus) / mobile
// drawer overlay. docs/styles/console (master layout).
export function AppLayoutCombo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const roles = useAuthStore((s) => s.roles);
  const permissions = useAuthStore((s) => s.permissions);
  const logout = useLogout();

  const navPerms = useMemo(() => new Set(permissions), [permissions]);
  const navRoles = useMemo(() => new Set(roles), [roles]);
  const navSections = useMemo(
    () => visibleNavSections(navPerms, navRoles),
    [navPerms, navRoles],
  );

  const [asideOpen, setAsideOpen] = useState(readInitialAsideOpen);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia(DESKTOP_QUERY).matches,
  );
  const [showGoToTop, setShowGoToTop] = useState(false);

  const initialOpenBranch = useMemo(() => {
    if (typeof window !== "undefined") {
      const railOnMount =
        window.matchMedia(DESKTOP_QUERY).matches &&
        window.localStorage.getItem(ASIDE_STORAGE_KEY) === "false";
      if (railOnMount) return null;
    }
    return activeBranchKey(location.pathname);
    // Compute only on mount; route changes handled by the effect below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [openBranch, setOpenBranch] = useState<string | null>(
    initialOpenBranch,
  );

  const asideRef = useRef<HTMLElement>(null);

  // Swap desktop sidebar ↔ mobile drawer on viewport change.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (e.matches) {
        const saved = window.localStorage.getItem(ASIDE_STORAGE_KEY);
        setAsideOpen(saved === null ? true : saved !== "false");
      } else {
        setAsideOpen(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Open the route-active branch on navigation (skip in rail to avoid flyout pop).
  useEffect(() => {
    if (isDesktop && !asideOpen) return;
    const branch = activeBranchKey(location.pathname);
    if (branch) setOpenBranch(branch);
  }, [location.pathname, isDesktop, asideOpen]);

  // Entering rail mode collapses any open submenu.
  useEffect(() => {
    if (isDesktop && !asideOpen) setOpenBranch(null);
  }, [isDesktop, asideOpen]);

  // Persist desktop asideOpen choice (mobile drawer always reopens closed).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    window.localStorage.setItem(ASIDE_STORAGE_KEY, String(asideOpen));
  }, [asideOpen]);

  // Rail mode: click outside the aside dismisses the flyout.
  useEffect(() => {
    if (!isDesktop || asideOpen) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target || !asideRef.current) return;
      if (asideRef.current.contains(target)) return;
      if (target.closest("[data-rail-flyout]")) return;
      setOpenBranch(null);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isDesktop, asideOpen]);

  // Floating scroll-to-top once past 200px.
  useEffect(() => {
    const onScroll = () => setShowGoToTop(window.scrollY > 200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (isDesktop || !asideOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAsideOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDesktop, asideOpen]);

  const handleNavClick = useCallback(() => {
    if (!isDesktop) setAsideOpen(false);
    if (isDesktop && !asideOpen) setOpenBranch(null);
  }, [isDesktop, asideOpen]);

  const toggleBranch = useCallback((key: string) => {
    setOpenBranch((cur) => (cur === key ? null : key));
  }, []);

  function handleLogout() {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  }

  const initials = useMemo(() => {
    if (!user) return "?";
    const name = user.full_name?.trim();
    if (name) {
      const parts = name.split(/\s+/);
      const a = parts[0]?.[0] ?? "";
      const b = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
      return (a + b).toUpperCase() || "?";
    }
    return user.email?.[0]?.toUpperCase() ?? "?";
  }, [user]);

  const asideWidth =
    isDesktop && !asideOpen ? ASIDE_WIDTH_RAIL : ASIDE_WIDTH_OPEN;
  const mainOffset = isDesktop
    ? asideOpen
      ? MAIN_PAD_OPEN
      : MAIN_PAD_RAIL
    : "";
  const showLabels = asideOpen || !isDesktop;
  const isRail = isDesktop && !asideOpen;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        ref={asideRef}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-background transition-[width,transform] duration-200",
          asideWidth,
          !isDesktop && !asideOpen && "-translate-x-full",
        )}
        aria-label={t("nav.primary")}
      >
        <div className="flex h-14 items-center justify-center border-b px-4">
          <Link
            to="/"
            aria-label={APP_NAME}
            className={cn(
              "flex items-center justify-center overflow-hidden dark:rounded-md dark:bg-white",
              !isRail && "dark:px-2 dark:py-1",
            )}
          >
            {isRail ? (
              // Rail → square app-icon that fits the w-16 rail.
              <img
                src="/app-icon.png"
                alt=""
                className="h-8 w-8 object-contain"
              />
            ) : (
              <img
                src="/logo.png"
                alt=""
                className="h-8 w-auto max-w-full object-contain"
              />
            )}
          </Link>
        </div>
        <SidebarNav
          sections={navSections}
          pathname={location.pathname}
          showLabels={showLabels}
          isRail={isRail}
          openBranch={openBranch}
          onToggleBranch={toggleBranch}
          onNavClick={handleNavClick}
        />
      </aside>

      {/* Mobile drawer backdrop */}
      {!isDesktop && asideOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={() => setAsideOpen(false)}
          className="fixed inset-0 z-30 bg-black/50"
        />
      )}

      {/* ── Header + Main ───────────────────────────────────────────── */}
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding]",
          mainOffset,
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("nav.toggle")}
            onClick={() => setAsideOpen((s) => !s)}
            className="-ml-2"
          >
            {asideOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </Button>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 rounded-full p-1 pr-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("nav.user_menu")}
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </span>
                {user && (
                  <span className="hidden sm:inline">{user.full_name}</span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {user && (
                  <>
                    <DropdownMenuLabel className="flex flex-col gap-0.5">
                      <span>{user.full_name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {user.email}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/account/profile">
                    <User className="h-4 w-4" />
                    {t("nav.account")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onSelect={(e) => {
                    e.preventDefault();
                    handleLogout();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  {t("common.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-60 sm:px-6">
          <Outlet />
        </main>
      </div>

      {/* Scroll-to-top */}
      {showGoToTop && (
        <Button
          type="button"
          size="icon"
          aria-label={t("nav.go_to_top")}
          title={t("nav.go_to_top")}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 h-10 w-10 rounded-full shadow-md"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
