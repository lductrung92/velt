import { useSite } from "../context";
import { navHref, type NavItem } from "../lib/layout";
import type { RegionBlock, SlotName } from "../lib/regions";

/**
 * Whatever the console put in one slot of this page's chrome.
 *
 * Renders NOTHING when the slot is empty, which is the normal state: a site
 * that never opens the Appearance screen looks exactly as it did before this
 * existed. That is the same bargain every chrome setting makes — empty means
 * "use what the site ships with" — and it is why these slots can sit in the
 * header and footer without changing them.
 *
 * The HTML a rich-text block carries was sanitized by the backend on the way
 * in (htmlsan's allowlist, the same one the article body goes through), which
 * is why it may be set directly here.
 */
export function RegionSlot({
  name,
  blocks,
  className,
}: {
  name: SlotName;
  blocks: RegionBlock[];
  className?: string;
}) {
  if (blocks.length === 0) return null;
  return (
    <div
      className={className ? `region ${className}` : "region"}
      data-region={name}
    >
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: RegionBlock }) {
  if (block.kind === "menu") return <MenuBlock items={block.items} />;
  switch (block.widgetType) {
    case "rich_text":
      return <RichTextBlock props={block.props} />;
    case "cta_banner":
      return <CtaBannerBlock props={block.props} />;
    case "articles_list":
      return <ArticlesBlock props={block.props} />;
    case "categories_showcase":
      return <CategoriesBlock props={block.props} />;
    case "games_list":
      return <GamesBlock props={block.props} />;
    default:
      // A type this build does not know about is skipped rather than guessed
      // at: the console may ship a widget before the site can draw it.
      return null;
  }
}

/* Read defensively: this renders the chrome of every page, so an unexpected
   shape must skip the block rather than throw. */

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((item) =>
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {},
      )
    : [];
}

function Title({ children }: { children: string }) {
  return children ? <h3 className="region-title">{children}</h3> : null;
}

function MenuLink({ item }: { item: NavItem }) {
  const { href } = useSite();
  return (
    <a
      href={navHref(item, href)}
      {...(item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {item.label}
    </a>
  );
}

function MenuBlock({ items }: { items: NavItem[] }) {
  return (
    <nav className="region-menu">
      {items.map((item, index) =>
        // A root with children is a heading over its links — the shape the
        // site's own footer columns already use, so a menu dropped into a
        // region reads the same as the one that was always there.
        item.children.length > 0 ? (
          <div className="region-menu-group" key={index}>
            <Title>{item.label}</Title>
            {item.children.map((child, childIndex) => (
              <MenuLink key={childIndex} item={child} />
            ))}
          </div>
        ) : (
          <MenuLink key={index} item={item} />
        ),
      )}
    </nav>
  );
}

function RichTextBlock({ props }: { props: Record<string, unknown> }) {
  const html = text(props.html);
  if (!html) return null;
  return (
    <div
      className={`region-richtext region-width-${text(props.width) || "normal"}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CtaBannerBlock({ props }: { props: Record<string, unknown> }) {
  const { href } = useSite();
  const buttons = list(props.buttons).filter(
    (b) => text(b.label) && text(b.href),
  );
  const heading = text(props.heading);
  if (!heading && !text(props.sub) && buttons.length === 0) return null;
  return (
    <div className={`region-cta region-align-${text(props.align) || "center"}`}>
      {heading && <strong>{heading}</strong>}
      {text(props.sub) && <p>{text(props.sub)}</p>}
      {buttons.length > 0 && (
        <p className="region-cta-actions">
          {buttons.map((button, index) => {
            const to = text(button.href);
            return (
              <a
                key={index}
                className={`region-cta-button is-${text(button.style) || "primary"}`}
                href={/^https?:\/\//i.test(to) ? to : href(to)}
              >
                {text(button.label)}
              </a>
            );
          })}
        </p>
      )}
    </div>
  );
}

function ArticlesBlock({ props }: { props: Record<string, unknown> }) {
  const { href } = useSite();
  const items = list(props.items);
  if (items.length === 0) return null;
  return (
    <div className="region-list">
      <Title>{text(props.title)}</Title>
      <ul>
        {items.map((item, index) => (
          <li key={index}>
            <a href={href(`/blog/${text(item.slug)}`)}>{text(item.title)}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoriesBlock({ props }: { props: Record<string, unknown> }) {
  const { href } = useSite();
  const items = list(props.items);
  if (items.length === 0) return null;
  return (
    <div className="region-list">
      <Title>{text(props.title)}</Title>
      <ul className="region-chips">
        {items.map((item, index) => (
          <li key={index}>
            <a
              href={href(
                `/blog?category=${encodeURIComponent(text(item.slug))}`,
              )}
            >
              {text(item.name)}
              {typeof item.count === "number" && <span>{item.count}</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GamesBlock({ props }: { props: Record<string, unknown> }) {
  const items = list(props.items);
  if (items.length === 0) return null;
  return (
    <div className="region-list">
      <Title>{text(props.title)}</Title>
      <ul>
        {items.map((item, index) => (
          <li key={index}>
            <a
              href={text(item.play_url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {text(item.title)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
