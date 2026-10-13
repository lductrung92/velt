// Renders a landing page's sections with the components the home page already
// uses. The product grid's markup is the one Home.tsx renders today, copied
// because Home.tsx is wired to the landing in a later step.
import { useState } from "react";
import type { Member, Product, PublicSection } from "../types";
import { useSite } from "../context";
import { selectProducts } from "../lib/catalog";
import { productGridConfig, sectionList } from "../lib/sections";
import { Audience, BuyingSteps, EmptyProducts, FAQ, Hero } from "./HomeStatic";
import { Categories, ProductCard } from "./Products";
import { Team } from "./Team";
import { BlogPreview } from "./blog/BlogPreview";
import { Contact } from "./Contact";
import { Icon } from "./Icon";

function ProductGrid({ config, data }: { config?: unknown; data?: unknown }) {
  const { products: catalog, isExample, href } = useSite();
  const section = productGridConfig(config);
  const products = sectionList<Product>(data) ?? catalog;
  const [category, setCategory] = useState(section.category);
  const selected = selectProducts(products, { category });
  const showAllHref =
    category && !section.show_all_href.includes("?")
      ? `${section.show_all_href}?category=${encodeURIComponent(category)}`
      : section.show_all_href;
  return (
    <section
      className="section products-section"
      id="products"
      aria-labelledby="products-title"
    >
      <div className="container">
        <header className="section-heading">
          <h2 id="products-title">{section.title}</h2>
          <p>{section.subtitle}</p>
        </header>
        {isExample && (
          <div className="catalog-example-note" id="home-example-note">
            <span>Danh mục minh họa</span> Tên và nội dung đang là mẫu thiết kế.
            Nút “Mở link tạm” dẫn đến example.com, chưa phải demo của ZUKATEK.
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
                {Math.min(section.limit, selected.length)} / {selected.length}{" "}
                {isExample ? "mẫu minh họa" : "sản phẩm"} ·{" "}
                {category || "Tuyển chọn để khám phá"}
              </p>
              <a
                className="text-link primary-text"
                id="home-catalog-link"
                href={href(showAllHref)}
              >
                {section.show_all_label}
                <Icon name="arrow" />
              </a>
            </div>
            <div id="product-list" className="catalog-grid home-catalog-grid">
              {selected.slice(0, section.limit).map((product) => (
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
  );
}

export function SectionRenderer({ sections }: { sections: PublicSection[] }) {
  const { href } = useSite();
  const [audience, setAudience] = useState("Cá nhân");
  const ordered = (Array.isArray(sections) ? [...sections] : []).sort(
    (a, b) => (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0),
  );
  return (
    <>
      {ordered.map((section, index) => {
        const key = `${section?.type}-${index}`;
        switch (section?.type) {
          case "audience_picker":
            return (
              <Audience
                key={key}
                href={href}
                onAudience={setAudience}
                config={section.config}
              />
            );
          case "product_grid":
            return (
              <ProductGrid
                key={key}
                config={section.config}
                data={section.data}
              />
            );
          case "team":
            return (
              <Team
                key={key}
                config={section.config}
                members={sectionList<Member>(section.data)}
              />
            );
          case "buying_steps":
            return <BuyingSteps key={key} config={section.config} />;
          // Three sections the page already had that map onto section types the
          // builder already knew. They carry no config yet — their copy is
          // still the component's own — so they take none here either; adding
          // one later changes this file and nothing else.
          case "hero":
            return <Hero key={key} href={href} />;
          case "featured_articles":
            return <BlogPreview key={key} />;
          case "faq":
            return <FAQ key={key} />;
          case "contact_form":
            return (
              <Contact
                key={key}
                audience={audience}
                onAudience={setAudience}
                config={section.config}
              />
            );
          // A later console release will add types this build never heard of.
          default:
            return null;
        }
      })}
    </>
  );
}
