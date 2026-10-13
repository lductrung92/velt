import type { Product } from "../types";
import { useSite } from "../context";
import {
  categoryLabel,
  categoryOf,
  lifecycleLabel,
  lifecycleTone,
  productPath,
} from "../lib/catalog";
import { demoLink, safeUrl } from "../lib/links";
import { Icon } from "./Icon";

export function ProductVisual({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  const { products, t } = useSite();
  const image = safeUrl(product.image);
  const tones = ["blue", "purple", "green", "orange"];
  const categories = [...new Set(products.map(categoryOf))];
  const tone = tones[categories.indexOf(categoryOf(product)) % 4] || "blue";
  return (
    <div
      className={`catalog-image ${image ? "" : tone} ${large ? "large" : ""}`}
      aria-hidden={!image}
    >
      {image ? (
        <img
          src={image}
          alt={t("catalog.visual_alt", { name: product.name })}
          loading="lazy"
        />
      ) : (
        <>
          <div className="catalog-mockup">
            <div className="mockup-bar">
              <i />
              <i />
              <i />
              <span />
            </div>
            <div className="mockup-body">
              <div className="mockup-nav">
                <i />
                <i />
                <i />
              </div>
              <div className="mockup-content">
                <span className="mockup-title" />
                <div className="mockup-stats">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="mockup-table">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
          </div>
          <span className="catalog-art-orb" />
        </>
      )}
    </div>
  );
}
export function ProductCard({ product }: { product: Product }) {
  const { data, referrer, href, t } = useSite();
  const people = data.members.filter((member) =>
    product.memberIds?.includes(member.id),
  );
  const status = lifecycleTone(product.status);
  const detail = href(productPath(product)),
    demo = demoLink(product, referrer);
  return (
    <article className="catalog-card">
      <ProductVisual product={product} />
      <div className="catalog-card-body">
        <div className="catalog-meta">
          <span className="catalog-category">
            {categoryLabel(t, categoryOf(product))}
          </span>
          {product.example && (
            <span className="example-label">{t("catalog.card_example")}</span>
          )}
        </div>
        <h3>
          <a href={detail}>{product.name}</a>
        </h3>
        <p className="catalog-summary">{product.summary}</p>
        <div className="catalog-tags">
          {product.status && (
            <span className={`catalog-status ${status}`}>
              <i />
              {lifecycleLabel(t, product.status)}
            </span>
          )}
          {product.audience && (
            <span className="catalog-audience">{product.audience}</span>
          )}
        </div>
        {!!people.length && (
          <div
            className="catalog-contributors"
            title={people.map((member) => member.name).join(", ")}
          >
            {people.slice(0, 3).map((member) => (
              <i key={member.id}>{member.name.slice(0, 1)}</i>
            ))}
            <small>{people.map((member) => member.name).join(", ")}</small>
          </div>
        )}
        <div className="product-purchase-info">
          {product.priceLabel ||
            t(
              product.example
                ? "catalog.price_example"
                : "catalog.price_contact",
            )}
        </div>
        <div className="catalog-card-actions">
          {demo ? (
            <a
              className="button button-small demo-button"
              href={demo}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t(
                product.demoPlaceholder
                  ? "catalog.card_demo_placeholder_aria"
                  : "catalog.card_demo_aria",
                { name: product.name },
              )}
            >
              {t(
                product.demoPlaceholder
                  ? "catalog.card_demo_placeholder"
                  : "catalog.card_demo",
              )}
              {" ↗"}
            </a>
          ) : (
            <span className="demo-unavailable">
              {t("catalog.card_no_demo")}
            </span>
          )}
          <a
            className="text-link product-button"
            href={detail}
            aria-label={t("catalog.card_view_aria", { name: product.name })}
          >
            {t("catalog.card_detail")}
            <Icon name="arrow" />
          </a>
        </div>
        {demo && (
          <small className="demo-access-note">
            {product.demoAccess || t("catalog.card_demo_note")}
          </small>
        )}
      </div>
    </article>
  );
}
export function Categories({
  products,
  selected,
  onChange,
}: {
  products: Product[];
  selected: string;
  onChange: (category: string) => void;
}) {
  const { t } = useSite();
  const categories = [...new Set(products.map(categoryOf))];
  return (
    <>
      {["", ...categories].map((category) => (
        <button
          key={category}
          type="button"
          className="category-button"
          data-category={category}
          aria-pressed={category === selected}
          onClick={() => onChange(category)}
        >
          {category ? categoryLabel(t, category) : t("catalog.categories_all")}
          <span>
            {category
              ? products.filter((product) => categoryOf(product) === category)
                  .length
              : products.length}
          </span>
        </button>
      ))}
    </>
  );
}
