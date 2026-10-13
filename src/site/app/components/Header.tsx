import { useEffect, useRef, useState } from "react";
import { useSite } from "../context";
import { navHref, navIcon, type NavItem } from "../lib/layout";
import { Icon } from "./Icon";

export function Header() {
  const { href, url, layout } = useSite();
  const [menuOpen, setMenuOpen] = useState(false),
    // Which dropdown is open, by position — the menu may define several.
    [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const header = useRef<HTMLElement>(null),
    menuToggle = useRef<HTMLButtonElement>(null),
    // The toggle that opened the current dropdown, so Escape returns focus to
    // the button the visitor actually pressed.
    dropdownToggle = useRef<HTMLButtonElement | null>(null);
  // On the home page the catalogue link stays an in-page anchor, exactly as the
  // markup did: "/products" scrolls to the section instead of reloading it.
  const to = (item: NavItem) =>
    url.pathname === "/" && item.href === "/products"
      ? href("/#products")
      : navHref(item, href);
  const linkProps = (item: NavItem) =>
    item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const ctaHref = /^https?:\/\//i.test(layout.chrome.ctaHref)
    ? layout.chrome.ctaHref
    : href(layout.chrome.ctaHref);
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
    <header className="site-header" ref={header}>
      <div className="nav-container">
        <a
          className="brand"
          href={href("/#top")}
          aria-label="ZUKATEK — về đầu trang"
        >
          <img src="/assets/logo.png" alt="ZUKATEK" width="1222" height="249" />
        </a>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
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
        <div className="nav-right">
          <a className="button button-small contact-nav" href={ctaHref}>
            <Icon name="support" />
            {layout.chrome.ctaLabel}
          </a>
        </div>
        <button
          ref={menuToggle}
          className="menu-toggle icon-button"
          aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
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
        aria-label="Điều hướng trên điện thoại"
        hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      >
        {layout.headerMobile.map((item, index) => (
          <a key={index} href={to(item)} {...linkProps(item)}>
            {item.label} <Icon name="arrow" />
          </a>
        ))}
        <a className="button contact-nav" href={ctaHref}>
          <Icon name="support" />
          {layout.chrome.ctaLabel}
        </a>
      </nav>
    </header>
  );
}
