import type { Product } from "../types";
import { useSite } from "../context";
import { categoryOf, productPath } from "../lib/catalog";
import { demoLink, safeUrl } from "../lib/links";
import { Icon } from "./Icon";

export function ProductVisual({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  const { products } = useSite();
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
        <img src={image} alt={`Giao diện ${product.name}`} loading="lazy" />
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
  const { data, referrer, href } = useSite();
  const people = data.members.filter((member) =>
    product.memberIds?.includes(member.id),
  );
  const status =
    product.status === "Đã ra mắt"
      ? "released"
      : product.status === "Đang phát triển"
        ? "developing"
        : "idea";
  const detail = href(productPath(product)),
    demo = demoLink(product, referrer);
  return (
    <article className="catalog-card">
      <ProductVisual product={product} />
      <div className="catalog-card-body">
        <div className="catalog-meta">
          <span className="catalog-category">{categoryOf(product)}</span>
          {product.example && <span className="example-label">Minh họa</span>}
        </div>
        <h3>
          <a href={detail}>{product.name}</a>
        </h3>
        <p className="catalog-summary">{product.summary}</p>
        <div className="catalog-tags">
          {product.status && (
            <span className={`catalog-status ${status}`}>
              <i />
              {product.status}
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
            (product.example
              ? "Thông tin mẫu · chưa mở bán"
              : "Liên hệ để nhận báo giá")}
        </div>
        <div className="catalog-card-actions">
          {demo ? (
            <a
              className="button button-small demo-button"
              href={demo}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${product.demoPlaceholder ? "Mở link tạm cho" : "Trải nghiệm"} ${product.name}`}
            >
              {product.demoPlaceholder ? "Mở link tạm" : "Trải nghiệm"} ↗
            </a>
          ) : (
            <span className="demo-unavailable">Chưa có bản demo</span>
          )}
          <a
            className="text-link product-button"
            href={detail}
            aria-label={`Xem ${product.name}`}
          >
            Chi tiết <Icon name="arrow" />
          </a>
        </div>
        {demo && (
          <small className="demo-access-note">
            {product.demoAccess || "Mở bản trải nghiệm trong tab mới"}
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
          {category || "Tất cả"}
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
