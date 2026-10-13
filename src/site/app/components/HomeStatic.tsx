// Presentation migrated from the approved mockup. All interaction is owned by React.
import { HeroVisual } from "./hero/HeroVisual";
import { safeUrl } from "../lib/links";
import {
  audienceConfig,
  buyingStepsConfig,
  faqConfig,
  heroConfig,
} from "../lib/sections";
import { navHref, type SiteLayout } from "../lib/layout";
import { Lines } from "./Lines";
type LinksProps = { href: (path: string) => string };

// href() only knows in-site paths; a link typed in the console may be absolute.
const sectionHref = (href: (path: string) => string, value: string) =>
  value.startsWith("/") ? href(value) : safeUrl(value);

export function Icons() {
  return (
    <svg
      className="svg-definitions"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <path d="M5 12h14m-6-6 6 6-6 6"></path>
        </symbol>
        <symbol id="i-chevron" viewBox="0 0 24 24">
          <path d="m8 4 8 8-8 8"></path>
        </symbol>
        <symbol id="i-down" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6"></path>
        </symbol>
        <symbol id="i-spark" viewBox="0 0 24 24">
          <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z"></path>
        </symbol>
        <symbol id="i-user" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M4 21v-2a8 8 0 0 1 16 0v2"></path>
        </symbol>
        <symbol id="i-users" viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3"></circle>
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"></path>
        </symbol>
        <symbol id="i-grid" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="2"></rect>
          <rect x="14" y="3" width="7" height="7" rx="2"></rect>
          <rect x="3" y="14" width="7" height="7" rx="2"></rect>
          <rect x="14" y="14" width="7" height="7" rx="2"></rect>
        </symbol>
        <symbol id="i-bulb" viewBox="0 0 24 24">
          <path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"></path>
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="m5 12 4 4L19 6"></path>
        </symbol>
        <symbol id="i-close" viewBox="0 0 24 24">
          <path d="m6 6 12 12M6 18 18 6"></path>
        </symbol>
        <symbol id="i-mail" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="3"></rect>
          <path d="m3 7 9 6 9-6"></path>
        </symbol>
        <symbol id="i-support" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3"></circle>
          <path d="M6 22v-2a6 6 0 0 1 12 0v2M5 10V8a7 7 0 0 1 14 0v2"></path>
          <rect x="3" y="9" width="3" height="6" rx="1.5"></rect>
          <rect x="18" y="9" width="3" height="6" rx="1.5"></rect>
          <path d="M19 15v1a2 2 0 0 1-2 2h-3"></path>
        </symbol>
        <symbol id="i-building" viewBox="0 0 24 24">
          <rect x="5" y="3" width="14" height="18" rx="2"></rect>
          <path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1m-4 6v-3h2v3"></path>
        </symbol>
        <symbol id="i-copy" viewBox="0 0 24 24">
          <rect x="8" y="8" width="12" height="13" rx="2"></rect>
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"></path>
        </symbol>
      </defs>
    </svg>
  );
}

export function Hero({ href, config }: LinksProps & { config?: unknown }) {
  const c = heroConfig(config);
  return (
    <div className="hero-wrap" id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow">{c.eyebrow}</span>
            <h1 id="hero-title">
              <Lines text={c.heading} />
            </h1>
            <p className="hero-subtitle">{c.subheading}</p>
            <div className="hero-actions">
              <a className="button button-large" href={href("/#products")}>
                {"Xem sản phẩm "}
                <svg className="icon">
                  <use href="#i-arrow"></use>
                </svg>
              </a>
            </div>
            <a className="hero-note" href={href("/#team")}>
              <svg className="icon">
                <use href="#i-bulb"></use>
              </svg>
              <span>{"Tìm hiểu đội ngũ phát triển sản phẩm"}</span>
              <svg className="icon note-arrow">
                <use href="#i-chevron"></use>
              </svg>
            </a>
          </div>
          <HeroVisual />
        </div>
      </section>
      <div className="benefits-wrap">
        <div className="benefits">
          <div className="benefit">
            <span className="glass-icon pink">
              <svg className="icon">
                <use href="#i-users"></use>
              </svg>
            </span>
            <div>
              <h2>{"Đội ngũ phát triển"}</h2>
              <p>
                {"Tìm hiểu thành viên, kỹ năng và sản phẩm mỗi người tham gia."}
              </p>
            </div>
          </div>
          <div className="benefit">
            <span className="glass-icon orange">
              <svg className="icon">
                <use href="#i-bulb"></use>
              </svg>
            </span>
            <div>
              <h2>{"Trải nghiệm trước khi mua"}</h2>
              <p>{"Xem tính năng và dùng thử các sản phẩm có bản demo."}</p>
            </div>
          </div>
          <div className="benefit">
            <span className="glass-icon blue">
              <svg className="icon">
                <use href="#i-spark"></use>
              </svg>
            </span>
            <div>
              <h2>{"Tư vấn trực tiếp"}</h2>
              <p>
                {
                  "Liên hệ thành viên giới thiệu để được tư vấn lựa chọn sản phẩm."
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AudienceArt({ kind }: { kind: string }) {
  if (kind === "group")
    return (
      <div className="card-art art-group" aria-hidden="true">
        <div className="art-circle"></div>
        <div className="art-person person-left">
          <span className="person-head"></span>
          <span className="person-body"></span>
        </div>
        <div className="art-person person-right">
          <span className="person-head"></span>
          <span className="person-body"></span>
        </div>
        <div className="group-link">
          <svg className="icon">
            <use href="#i-users"></use>
          </svg>
        </div>
      </div>
    );
  if (kind === "business")
    return (
      <div className="card-art art-business" aria-hidden="true">
        <div className="art-circle"></div>
        <div className="art-building">
          <div className="building-top"></div>
          <div className="building-windows">
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </div>
          <span></span>
        </div>
        <div className="business-bubble">
          <svg className="icon">
            <use href="#i-spark"></use>
          </svg>
        </div>
        <div className="business-leaf"></div>
      </div>
    );
  return (
    <div className="card-art art-individual" aria-hidden="true">
      <div className="art-circle"></div>
      <div className="art-person">
        <span className="person-head"></span>
        <span className="person-body"></span>
      </div>
      <div className="idea-bubble">
        <svg className="icon">
          <use href="#i-bulb"></use>
        </svg>
      </div>
      <div className="art-note">
        <i></i>
        <i></i>
        <i></i>
      </div>
    </div>
  );
}

export function Audience({
  href,
  onAudience,
  config,
}: LinksProps & {
  onAudience: (audience: string) => void;
  config?: unknown;
}) {
  const { title, subtitle, items } = audienceConfig(config);
  return (
    <section
      className="section audience-section"
      id="about"
      aria-labelledby="about-title"
    >
      <div className="container">
        <header className="section-heading">
          <h2 id="about-title">{title}</h2>
          <p>{subtitle}</p>
        </header>
        <div className="audience-grid">
          {items.map((item, index) => (
            <article className="feature-card" key={index}>
              <AudienceArt kind={item.key} />
              <div className="feature-body">
                <h3>{item.headline}</h3>
                <p>{item.body}</p>
                <a
                  className="text-link"
                  href={sectionHref(href, item.cta_href)}
                  onClick={() => onAudience(item.label)}
                  data-audience={item.label}
                >
                  {item.cta_label}
                  <svg className="icon">
                    <use href="#i-arrow"></use>
                  </svg>
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BuyingSteps({ config }: { config?: unknown }) {
  const { title, subtitle, steps } = buyingStepsConfig(config);
  return (
    <section
      className="section collaboration-section"
      id="collaboration"
      aria-labelledby="collaboration-title"
    >
      <div className="container">
        <header className="section-heading">
          <h2 id="collaboration-title">{title}</h2>
          <p>{subtitle}</p>
        </header>
        <div className="steps-grid">
          {steps.map((step, index) => (
            <article className="step" key={index}>
              <span className="step-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQ({ config }: { config?: unknown }) {
  const c = faqConfig(config);
  return (
    <section className="section faq-section" aria-labelledby="faq-title">
      <div className="container faq-layout">
        <header className="faq-heading">
          <span className="tag">{c.eyebrow}</span>
          <h2 id="faq-title">{c.title}</h2>
          <p>{c.subtitle}</p>
        </header>
        <div className="faq-list">
          {c.items.map((item, index) => (
            // The first entry stays open, as it always has: an accordion whose
            // every panel is shut reads as an empty section.
            <details key={`${item.question}-${index}`} open={index === 0}>
              <summary>
                {item.question}
                <span className="faq-plus"></span>
              </summary>
              <p>{item.answer_html}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EmptyProducts({ href }: LinksProps) {
  return (
    <div className="product-empty" id="product-empty">
      <div className="product-empty-art" aria-hidden="true">
        <div className="empty-window">
          <div className="empty-toolbar">
            <i></i>
            <i></i>
            <i></i>
          </div>
          <div className="empty-grid">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="empty-lines">
            <i></i>
            <i></i>
          </div>
        </div>
        <span className="empty-spark">
          <svg className="icon">
            <use href="#i-spark"></use>
          </svg>
        </span>
        <span className="empty-cube"></span>
      </div>
      <div className="empty-copy">
        <span className="tag">{"HÀNH TRÌNH MỚI BẮT ĐẦU"}</span>
        <h3>
          {"Danh mục sản phẩm"}
          <br />
          {"đang được cập nhật"}
        </h3>
        <p>
          {
            "Sản phẩm được công bố sẽ có thông tin tính năng, đường dẫn trải nghiệm và thành viên phụ trách."
          }
        </p>
        <a className="text-link primary-text" href={href("/#contact")}>
          {"Nhận tư vấn sản phẩm "}
          <svg className="icon">
            <use href="#i-arrow"></use>
          </svg>
        </a>
      </div>
    </div>
  );
}

export function Footer({
  href,
  year,
  layout,
}: LinksProps & { year: number; layout: SiteLayout }) {
  // The copyright line is console copy with one placeholder; the year keeps its
  // own element so the markup around it is unchanged.
  const [beforeYear, afterYear] = layout.chrome.copyright.split("{year}");
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a
              className="brand"
              href={href("/#top")}
              aria-label="ZUKATEK — về đầu trang"
            >
              <img
                src="/assets/logo.png"
                alt="ZUKATEK"
                width="1222"
                height="249"
                loading="lazy"
              />
            </a>
            <p>
              <Lines text={layout.chrome.tagline} />
            </p>
          </div>
          {/* One column per root of the footer menu: the root is the heading,
              its children are the links under it. */}
          {layout.footer.map((column, index) => (
            <div key={index}>
              <h3>{column.label}</h3>
              {column.children.map((item, childIndex) => (
                <a
                  key={childIndex}
                  href={navHref(item, href)}
                  {...(item.newTab
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {item.label}
                </a>
              ))}
            </div>
          ))}
          <div className="footer-message">
            <h3>{layout.chrome.noteTitle}</h3>
            <p>
              <Lines text={layout.chrome.noteText} />
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            {beforeYear}
            {afterYear !== undefined && <span id="year">{year}</span>}
            {afterYear ?? ""}
          </span>
          <a href={href("/#top")}>
            {"Về đầu trang "}
            <svg className="icon up">
              <use href="#i-arrow"></use>
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
