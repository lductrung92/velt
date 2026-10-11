import { useSite } from "../context";
import { categoryOf, productPath } from "../lib/catalog";
import { demoLink } from "../lib/links";
import { ProductCard, ProductVisual } from "../components/Products";
import { Skills } from "../components/Team";
import { Icon } from "../components/Icon";
import type { Product } from "../types";

export function NotFound() {
  const { href } = useSite();
  return (
    <div className="container product-not-found">
      <span className="tag">ZUKATEK</span>
      <h1>Chưa tìm thấy sản phẩm</h1>
      <p>Sản phẩm có thể chưa được công bố hoặc đường dẫn đã thay đổi.</p>
      <a className="button" href={href("/products")}>
        Về danh mục sản phẩm
      </a>
    </div>
  );
}
export function ProductDetail({ product }: { product: Product }) {
  const { products, data, referrer, href } = useSite();
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
      <nav className="breadcrumbs" aria-label="Đường dẫn">
        <a href={href("/")}>Trang chủ</a>
        <span aria-hidden="true">/</span>
        <a href={href("/products")}>Sản phẩm</a>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>
      {product.example && (
        <div className="catalog-example-note">
          <span>Mẫu minh họa</span> Đây là ví dụ bố cục, chưa phải sản phẩm được
          ZUKATEK công bố.
        </div>
      )}
      <div className="product-detail-hero">
        <div>
          <span className="tag">{categoryOf(product)}</span>
          <h1>{product.name}</h1>
          <p>{product.summary}</p>
          <div className="catalog-tags">
            {product.status && (
              <span className="catalog-status">{product.status}</span>
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
                {product.demoPlaceholder
                  ? "Mở link tạm"
                  : "Trải nghiệm sản phẩm"}{" "}
                ↗
              </a>
            )}
            <a
              className="button button-soft"
              href={href(`/?product=${encodeURIComponent(product.id)}#contact`)}
            >
              Tư vấn mua sản phẩm <Icon name="arrow" />
            </a>
          </div>
          <p className="product-purchase-info">
            {product.priceLabel ||
              (product.example
                ? "Thông tin mẫu · chưa mở bán"
                : "Liên hệ để nhận báo giá")}
          </p>
        </div>
        <ProductVisual product={product} large />
      </div>
      <div className="product-detail-body">
        <section>
          <div className="product-demo-panel">
            <h2>
              {product.demoPlaceholder
                ? "Liên kết tạm để xem bố cục"
                : "Trải nghiệm trước khi mua"}
            </h2>
            <p>
              {product.demoPlaceholder
                ? "Đường dẫn example.com chỉ dùng để kiểm tra nút mở trang riêng, chưa phải bản demo của ZUKATEK."
                : demo
                  ? product.demoAccess ||
                    "Mở trang trải nghiệm riêng để kiểm tra các tính năng của sản phẩm."
                  : "Sản phẩm này chưa có bản trải nghiệm công khai. Liên hệ ZUKATEK để được tư vấn."}
            </p>
            {!!product.demoInstructions?.length && (
              <ol>
                {product.demoInstructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </div>
          <h2>Về sản phẩm</h2>
          <p className="product-description">
            {product.description || product.summary}
          </p>
          {!!product.skills?.length && (
            <>
              <h2>Kỹ năng trong sản phẩm</h2>
              <div className="detail-skills">
                <Skills skills={product.skills} />
              </div>
            </>
          )}
        </section>
        <aside>
          <h2>Thành viên tham gia</h2>
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
                  <small>{member.role || "Thành viên ZUKATEK"}</small>
                </div>
                <Icon name="arrow" />
              </a>
            ))
          ) : (
            <p>
              {product.example
                ? "Thông tin thành viên sẽ xuất hiện cùng sản phẩm thực tế."
                : "Thông tin thành viên đang được cập nhật."}
            </p>
          )}
        </aside>
      </div>
      {!!related.length && (
        <section className="related-products">
          <div className="related-heading">
            <h2>Khám phá thêm</h2>
            <a
              className="text-link primary-text"
              href={href(
                `/products?category=${encodeURIComponent(categoryOf(product))}`,
              )}
            >
              Xem cùng nhóm <Icon name="arrow" />
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
