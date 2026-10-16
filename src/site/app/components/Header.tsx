import { useEffect, useRef, useState } from "react";
import { useSite } from "../context";
import { navHref, navIcon, type NavItem } from "../lib/layout";
import { allLocales, localeLabel } from "../lib/locales";
import { Icon } from "./Icon";
import { RegionSlot } from "./RegionSlot";

function LanguageFlag({ code }: { code: string }) {
  const language = code.toLowerCase().split("-")[0];
  return (
    <span className="language-flag" aria-hidden="true">
      {language === "vi" ? (
        <svg viewBox="0 0 24 18" fill="none">
          <path fill="#DA251D" d="M0 0h24v18H0z" />
          <path
            fill="#FFDF00"
            d="m12 3 1.35 4.15h4.35l-3.52 2.56 1.35 4.14L12 11.29l-3.53 2.56 1.35-4.14L6.3 7.15h4.35Z"
          />
        </svg>
      ) : language === "en" ? (
        <svg viewBox="0 0 24 18" fill="none">
          <path fill="#173C79" d="M0 0h24v18H0z" />
          <path stroke="#FFF" strokeWidth="4" d="m0 0 24 18M24 0 0 18" />
          <path stroke="#D62839" strokeWidth="1.5" d="m0 0 24 18M24 0 0 18" />
          <path stroke="#FFF" strokeWidth="6" d="M12 0v18M0 9h24" />
          <path stroke="#D62839" strokeWidth="3.5" d="M12 0v18M0 9h24" />
        </svg>
      ) : (
        <Icon name="globe" />
      )}
    </span>
  );
}

export function Header() {
  const { href, url, layout, regions, locale, locales, localeHref, t } =
    useSite();
  const [menuOpen, setMenuOpen] = useState(false),
    // Which dropdown is open — a position in the menu, or the language one.
    [openDropdown, setOpenDropdown] = useState<number | "lang" | null>(null);
  const header = useRef<HTMLElement>(null),
    menuToggle = useRef<HTMLButtonElement>(null),
    // The toggle that opened the current dropdown, so Escape returns focus to
    // the button the visitor actually pressed.
    dropdownToggle = useRef<HTMLButtonElement | null>(null);
  const [scrollState, setScrollState] = useState({
    hidden: false,
    scrolled: false,
  });
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Clamp browser overscroll so reaching a page edge cannot reverse direction.
    const scrollPosition = () =>
      Math.max(
        0,
        Math.min(
          window.scrollY,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      );
    let previousY = scrollPosition();
    let direction = 0;
    let distance = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = scrollPosition();
      const delta = y - previousY;
      previousY = y;
      const pinned =
        menuOpen ||
        openDropdown !== null ||
        reducedMotion.matches ||
        header.current?.contains(document.activeElement);
      let hidden: boolean | undefined;
      if (y <= 120 || pinned) {
        hidden = false;
        direction = 0;
        distance = 0;
      } else if (delta !== 0) {
        const nextDirection = Math.sign(delta);
        distance =
          nextDirection === direction
            ? distance + Math.abs(delta)
            : Math.abs(delta);
        direction = nextDirection;
        if (direction > 0 && distance >= 20) hidden = true;
        if (direction < 0 && distance >= 10) hidden = false;
      }
      setScrollState((previous) => {
        const next = { hidden: hidden ?? previous.hidden, scrolled: y > 12 };
        return next.hidden === previous.hidden &&
          next.scrolled === previous.scrolled
          ? previous
          : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reducedMotion.addEventListener("change", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener("change", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [menuOpen, openDropdown]);
  // On the home page the catalogue link stays an in-page anchor, exactly as the
  // markup did: "/products" scrolls to the section instead of reloading it.
  const to = (item: NavItem) =>
    url.pathname === "/" && item.href === "/products"
      ? href("/#products")
      : navHref(item, href);
  const linkProps = (item: NavItem) =>
    item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    const surfaces = document.querySelectorAll<HTMLElement>(
      "main,.site-footer,.chat-widget",
    );
    surfaces.forEach((surface) => {
      surface.inert = menuOpen;
    });
    if (menuOpen)
      header.current
        ?.querySelector<HTMLAnchorElement>(".mobile-menu a")
        ?.focus();
    return () => {
      document.body.classList.remove("menu-open");
      surfaces.forEach((surface) => {
        surface.inert = false;
      });
    };
  }, [menuOpen]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!(event.target as Element).closest(".nav-dropdown"))
        setOpenDropdown(null);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
          menuToggle.current?.focus();
        }
        if (openDropdown !== null) {
          setOpenDropdown(null);
          dropdownToggle.current?.focus();
        }
      }
      if (event.key === "Tab" && menuOpen) {
        const links = [
          ...(header.current?.querySelectorAll<HTMLAnchorElement>(
            ".mobile-menu a",
          ) || []),
        ];
        if (event.shiftKey && document.activeElement === menuToggle.current) {
          event.preventDefault();
          links.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === links.at(-1)) {
          event.preventDefault();
          menuToggle.current?.focus();
        }
      }
    };
    const desktop = matchMedia("(min-width:1024px)");
    const resize = () => {
      if (desktop.matches) setMenuOpen(false);
      setOpenDropdown(null);
    };
    document.addEventListener("click", outside);
    document.addEventListener("keydown", keyboard);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", keyboard);
      desktop.removeEventListener("change", resize);
    };
  }, [menuOpen, openDropdown]);
  return (
    <header
      className="site-header"
      ref={header}
      data-hidden={scrollState.hidden}
      data-scrolled={scrollState.scrolled}
      onFocusCapture={() =>
        setScrollState((previous) =>
          previous.hidden ? { ...previous, hidden: false } : previous,
        )
      }
    >
      <div className="nav-container">
        <a
          className="brand"
          href={href("/#top")}
          aria-label={t("a11y.brand_home")}
        >
          <img
            src={layout.chrome.logoUrl || "/assets/logo.png"}
            alt={t("a11y.brand_home")}
            width="1222"
            height="249"
          />
        </a>
        <nav className="desktop-nav" aria-label={t("a11y.nav_main")}>
          {layout.header.map((item, index) =>
            item.children.length > 0 ? (
              <div className="nav-dropdown" key={index}>
                <button
                  className="nav-link dropdown-toggle"
                  aria-expanded={openDropdown === index}
                  aria-controls={`nav-menu-${index}`}
                  onClick={(event) => {
                    dropdownToggle.current = event.currentTarget;
                    setOpenDropdown(openDropdown === index ? null : index);
                  }}
                >
                  {item.label} <Icon name="down" />
                </button>
                <div
                  className="dropdown-panel"
                  id={`nav-menu-${index}`}
                  hidden={openDropdown !== index}
                >
                  {item.children.map((child, childIndex) => (
                    <a
                      key={childIndex}
                      href={to(child)}
                      {...linkProps(child)}
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span className="menu-icon">
                        <Icon name={navIcon(child.href)} />
                      </span>
                      <span>
                        <strong>{child.label}</strong>
                        {child.description && (
                          <small>{child.description}</small>
                        )}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <a
                className="nav-link"
                key={index}
                href={to(item)}
                {...linkProps(item)}
                aria-current={
                  item.href !== "/" && url.pathname.startsWith(item.href)
                    ? "page"
                    : undefined
                }
              >
                {item.label}
              </a>
            ),
          )}
        </nav>
        <RegionSlot name="header" blocks={regions.header} />
        <div className="nav-right">
          {locales.length > 0 && (
            <div className="nav-dropdown lang-switch">
              <button
                className="nav-link dropdown-toggle lang-toggle"
                aria-expanded={openDropdown === "lang"}
                aria-controls="lang-menu"
                aria-label={t("a11y.language", {
                  language: localeLabel(locale),
                })}
                onClick={(event) => {
                  dropdownToggle.current = event.currentTarget;
                  setOpenDropdown(openDropdown === "lang" ? null : "lang");
                }}
              >
                <LanguageFlag code={locale} />
                <span className="lang-current-code">
                  {locale.toUpperCase()}
                </span>
                <Icon name="down" />
              </button>
              <div
                className="dropdown-panel lang-panel"
                id="lang-menu"
                hidden={openDropdown !== "lang"}
              >
                {allLocales(locales).map((code) => (
                  <a
                    key={code}
                    href={localeHref(code)}
                    hrefLang={code}
                    lang={code}
                    aria-current={code === locale ? "true" : undefined}
                    onClick={() => setOpenDropdown(null)}
                  >
                    <LanguageFlag code={code} />
                    <span className="lang-option-label">
                      {localeLabel(code)}
                    </span>
                    <span className="lang-option-check" aria-hidden="true">
                      {code === locale && <Icon name="check" />}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          ref={menuToggle}
          className="menu-toggle icon-button"
          aria-label={menuOpen ? t("a11y.menu_close") : t("a11y.menu_open")}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => {
            setMenuOpen(!menuOpen);
            setOpenDropdown(null);
          }}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      <nav
        className="mobile-menu"
        id="mobile-menu"
        aria-label={t("a11y.nav_mobile")}
        hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      >
        {/* One menu for both widths: the drawer shows the header menu itself,
            so a link added in the console appears on the phone too instead of
            needing a second menu kept in step by hand. A parent with children
            lists them under it — nothing is silently dropped. */}
        {layout.header.flatMap((item, index) => [
          <a key={index} href={to(item)} {...linkProps(item)}>
            {item.label} <Icon name="arrow" />
          </a>,
          ...item.children.map((child, childIndex) => (
            <a
              key={`${index}-${childIndex}`}
              className="mobile-sub"
              href={to(child)}
              {...linkProps(child)}
            >
              {child.label} <Icon name="arrow" />
            </a>
          )),
        ])}
        {locales.length > 0 && (
          <div className="mobile-lang">
            {allLocales(locales).map((code) => (
              <a
                key={code}
                href={localeHref(code)}
                hrefLang={code}
                lang={code}
                aria-current={code === locale ? "true" : undefined}
              >
                <LanguageFlag code={code} />
                <span>{localeLabel(code)}</span>
                {code === locale && (
                  <span className="mobile-lang-check" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}
