import { useState } from "react";
import { useSite } from "../context";
import { selectProducts } from "../lib/catalog";
import {
  Hero,
  Audience,
  BuyingSteps,
  FAQ,
  EmptyProducts,
} from "../components/HomeStatic";
import { Categories, ProductCard } from "../components/Products";
import { Team } from "../components/Team";
import { Contact } from "../components/Contact";
import { Icon } from "../components/Icon";

export function Home() {
  const { products, isExample, href } = useSite();
  const [category, setCategory] = useState(""),
    [audience, setAudience] = useState("Cá nhân");
  const selected = selectProducts(products, { category });
  return (
    <>
      <Hero href={href} />
      <Audience href={href} onAudience={setAudience} />
      <section
        className="section products-section"
        id="products"
        aria-labelledby="products-title"
      >
        <div className="container">
          <header className="section-heading">
            <h2 id="products-title">Sản phẩm của ZUKATEK</h2>
            <p>
              Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn
              quan tâm.
            </p>
          </header>
          {isExample && (
            <div className="catalog-example-note" id="home-example-note">
              <span>Danh mục minh họa</span> Tên và nội dung đang là mẫu thiết
              kế. Nút “Mở link tạm” dẫn đến example.com, chưa phải demo của
              ZUKATEK.
            </div>
          )}
          {products.length ? (
            <>
              <div
                className="category-list home-categories"
                id="home-product-categories"
                aria-label="Nhóm sản phẩm"
              >
                <Categories
                  products={products}
                  selected={category}
                  onChange={setCategory}
                />
              </div>
              <div className="home-product-summary">
                <p id="home-product-count" role="status" aria-live="polite">
                  {Math.min(6, selected.length)} / {selected.length}{" "}
                  {isExample ? "mẫu minh họa" : "sản phẩm"} ·{" "}
                  {category || "Tuyển chọn để khám phá"}
                </p>
                <a
                  className="text-link primary-text"
                  id="home-catalog-link"
                  href={href(
                    `/products${category ? `?category=${encodeURIComponent(category)}` : ""}`,
                  )}
                >
                  Xem tất cả sản phẩm <Icon name="arrow" />
                </a>
              </div>
              <div id="product-list" className="catalog-grid home-catalog-grid">
                {selected.slice(0, 6).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <div className="home-catalog-cta" id="home-catalog-cta">
                <a className="button button-soft" href={href("/products")}>
                  Khám phá toàn bộ danh mục <Icon name="arrow" />
                </a>
              </div>
            </>
          ) : (
            <EmptyProducts href={href} />
          )}
        </div>
      </section>
      <Team />
      <BuyingSteps />
      <FAQ />
      <Contact audience={audience} onAudience={setAudience} />
    </>
  );
}
