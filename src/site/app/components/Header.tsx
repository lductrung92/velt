import { useEffect, useRef, useState } from "react";
import { useSite } from "../context";
import { Icon } from "./Icon";

export function Header() {
  const { href, url } = useSite();
  const [menuOpen, setMenuOpen] = useState(false),
    [dropdownOpen, setDropdownOpen] = useState(false);
  const header = useRef<HTMLElement>(null),
    menuToggle = useRef<HTMLButtonElement>(null),
    dropdownToggle = useRef<HTMLButtonElement>(null);
  const productLink = href(url.pathname === "/" ? "/#products" : "/products");
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
        setDropdownOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
          menuToggle.current?.focus();
        }
        if (dropdownOpen) {
          setDropdownOpen(false);
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
  }, [menuOpen, dropdownOpen]);
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
          <div className="nav-dropdown">
            <button
              ref={dropdownToggle}
              className="nav-link dropdown-toggle"
              aria-expanded={dropdownOpen}
              aria-controls="explore-menu"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              Khám phá <Icon name="down" />
            </button>
            <div
              className="dropdown-panel"
              id="explore-menu"
              hidden={!dropdownOpen}
            >
              <a href={productLink} onClick={() => setDropdownOpen(false)}>
                <span className="menu-icon">
                  <Icon name="grid" />
                </span>
                <span>
                  <strong>Sản phẩm</strong>
                  <small>Danh mục, tính năng và bản trải nghiệm</small>
                </span>
              </a>
              <a href={href("/#team")} onClick={() => setDropdownOpen(false)}>
                <span className="menu-icon">
                  <Icon name="users" />
                </span>
                <span>
                  <strong>Đội ngũ & kỹ năng</strong>
                  <small>Con người đứng sau ZUKATEK</small>
                </span>
              </a>
            </div>
          </div>
          <a className="nav-link" href={productLink}>
            Sản phẩm
          </a>
          <a className="nav-link" href={href("/#team")}>
            Đội ngũ & kỹ năng
          </a>
        </nav>
        <div className="nav-right">
          <a
            className="button button-small contact-nav"
            href={href("/#contact")}
          >
            <Icon name="support" />
            Liên hệ
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
            setDropdownOpen(false);
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
        <a href={productLink}>
          Sản phẩm <Icon name="arrow" />
        </a>
        <a href={href("/#team")}>
          Đội ngũ & kỹ năng <Icon name="arrow" />
        </a>
        <a href={href("/#collaboration")}>
          Cách mua sản phẩm <Icon name="arrow" />
        </a>
        <a className="button contact-nav" href={href("/#contact")}>
          <Icon name="support" />
          Liên hệ
        </a>
      </nav>
    </header>
  );
}
