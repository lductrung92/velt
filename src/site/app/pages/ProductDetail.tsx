import { useSite } from "../context";
import {
  categoryLabel,
  categoryOf,
  lifecycleLabel,
  productPath,
} from "../lib/catalog";
import { demoLink } from "../lib/links";
import { ProductCard, ProductVisual } from "../components/Products";
import { Skills } from "../components/Team";
import { Icon } from "../components/Icon";
import type { Product } from "../types";

export function NotFound() {
  const { href, t } = useSite();
  return (
    <div className="container product-not-found">
      <span className="tag">ZUKATEK</span>
      <h1>{t("product.notfound_title")}</h1>
      <p>{t("product.notfound_body")}</p>
      <a className="button" href={href("/products")}>
        {t("product.notfound_cta")}
      </a>
    </div>
  );
}
export function ProductDetail({ product }: { product: Product }) {
  const { products, data, referrer, href, t } = useSite();
  const people = data.members.filter((member) =>
    product.memberIds?.includes(member.id),
  );
  const related = products
    .filter(
      (item) =>
        item.id !== product.id && categoryOf(item) === categoryOf(product),
    )
    .slice(0, 3);
  const demo = demoLink(product, referrer);
  return (
    <div className="container" id="product-detail">
      <nav className="breadcrumbs" aria-label={t("catalog.breadcrumb")}>
        <a href={href("/")}>{t("catalog.breadcrumb_home")}</a>
        <span aria-hidden="true">/</span>
        <a href={href("/products")}>{t("catalog.breadcrumb_products")}</a>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>
      {product.example && (
        <div className="catalog-example-note">
          <span>{t("product.example_note_title")}</span>
          {` ${t("product.example_note_body")}`}
        </div>
      )}
      <div className="product-detail-hero">
        <div>
          <span className="tag">{categoryLabel(t, categoryOf(product))}</span>
          <h1>{product.name}</h1>
          <p>{product.summary}</p>
          <div className="catalog-tags">
            {product.status && (
              <span className="catalog-status">
                {lifecycleLabel(t, product.status)}
              </span>
            )}
            {product.audience && (
              <span className="catalog-audience">{product.audience}</span>
            )}
          </div>
          <div className="product-detail-actions">
            {demo && (
              <a
                className="button"
                href={demo}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(
                  product.demoPlaceholder
                    ? "product.demo_placeholder"
                    : "product.demo",
                )}{" "}
                ↗
              </a>
            )}
            <a
              className="button button-soft"
              href={href(`/?product=${encodeURIComponent(product.id)}#contact`)}
            >
              {t("product.contact_cta")}
              <Icon name="arrow" />
            </a>
          </div>
          <p className="product-purchase-info">
            {product.priceLabel ||
              t(
                product.example
                  ? "catalog.price_example"
                  : "catalog.price_contact",
              )}
          </p>
        </div>
        <ProductVisual product={product} large />
      </div>
      <div className="product-detail-body">
        <section>
          <div className="product-demo-panel">
            <h2>
              {t(
                product.demoPlaceholder
                  ? "product.demo_panel_placeholder_title"
                  : "product.demo_panel_title",
              )}
            </h2>
            <p>
              {product.demoPlaceholder
                ? t("product.demo_panel_placeholder_body")
                : demo
                  ? product.demoAccess || t("product.demo_panel_body")
                  : t("product.demo_panel_none")}
            </p>
            {!!product.demoInstructions?.length && (
              <ol>
                {product.demoInstructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </div>
          <h2>{t("product.about_title")}</h2>
          <p className="product-description">
            {product.description || product.summary}
          </p>
          {!!product.skills?.length && (
            <>
              <h2>{t("product.skills_title")}</h2>
              <div className="detail-skills">
                <Skills skills={product.skills} />
              </div>
            </>
          )}
        </section>
        <aside>
          <h2>{t("product.members_title")}</h2>
          {people.length ? (
            people.map((member) => (
              <a
                className="product-person"
                key={member.id}
                href={href(`/?member=${encodeURIComponent(member.id)}#team`)}
              >
                <span>{member.name.slice(0, 1)}</span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.role || t("product.member_role")}</small>
                </div>
                <Icon name="arrow" />
              </a>
            ))
          ) : (
            <p>
              {t(
                product.example
                  ? "product.members_example"
                  : "product.members_pending",
              )}
            </p>
          )}
        </aside>
      </div>
      {!!related.length && (
        <section className="related-products">
          <div className="related-heading">
            <h2>{t("product.related_title")}</h2>
            <a
              className="text-link primary-text"
              href={href(
                `/products?category=${encodeURIComponent(categoryOf(product))}`,
              )}
            >
              {t("product.related_link")}
              <Icon name="arrow" />
            </a>
          </div>
          <div className="catalog-grid">
            {related.map((item) => (
              <ProductCard key={productPath(item)} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
