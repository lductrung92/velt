import { Fragment, useEffect, useState } from "react";
import { useSite } from "../context";
import { readFilters, selectProducts } from "../lib/catalog";
import type { Filters } from "../lib/catalog";
import { Categories, ProductCard } from "../components/Products";
import { Icon } from "../components/Icon";

export function Catalog() {
  const { products, isExample, url, href, referrer } = useSite();
  const [filters, setFilters] = useState(() => readFilters(url, products));
  const results = selectProducts(products, filters),
    totalPages = Math.max(1, Math.ceil(results.length / 9));
  const page = Math.min(filters.page, totalPages),
    start = (page - 1) * 9;
  const statuses = [
    ...new Set(products.map((product) => product.status).filter(Boolean)),
  ];
  useEffect(() => {
    const params = new URLSearchParams();
    if (referrer) params.set("ref", referrer.id);
    if (filters.query) params.set("q", filters.query);
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    if (filters.sort !== "featured") params.set("sort", filters.sort);
    if (page > 1) params.set("page", String(page));
    history.replaceState(
      null,
      "",
      `/products${params.size ? `?${params}` : ""}`,
    );
  }, [filters, page, referrer]);
  useEffect(() => {
    const back = () =>
      setFilters(readFilters(new URL(location.href), products));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, [products]);
  const change = (next: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...next, page: 1 }));
  const navigatePage = (value: number) => {
    setFilters((current) => ({ ...current, page: value }));
    document
      .querySelector("#catalog-results-top")
      ?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
          ? "instant"
          : "smooth",
      });
    document
      .querySelector<HTMLElement>("#catalog-count")
      ?.focus({ preventScroll: true });
  };
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  return (
    <>
      <section className="catalog-hero">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Đường dẫn">
            <a href={href("/")}>Trang chủ</a>
            <span aria-hidden="true">/</span>
            <span>Sản phẩm</span>
          </nav>
          <span className="tag">HỆ SINH THÁI ZUKATEK</span>
          <h1>Khám phá sản phẩm ZUKATEK</h1>
          <p>
            Xem tính năng, mở bản trải nghiệm và liên hệ tư vấn trước khi mua.
          </p>
          <label className="catalog-search">
            <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
            <span className="sr-only">Tìm sản phẩm</span>
            <input
              id="product-search"
              type="search"
              placeholder="Tìm tên sản phẩm, nhu cầu, kỹ năng…"
              autoComplete="off"
              maxLength={200}
              value={filters.query}
              onChange={(event) => change({ query: event.target.value })}
            />
            <button
              type="button"
              id="clear-search"
              aria-label="Xóa tìm kiếm"
              hidden={!filters.query}
              onClick={() => {
                change({ query: "" });
                document
                  .querySelector<HTMLInputElement>("#product-search")
                  ?.focus();
              }}
            >
              ×
            </button>
          </label>
        </div>
      </section>
      <section className="catalog-section">
        <div className="container">
          {isExample && (
            <div className="catalog-example-note" id="catalog-example-note">
              <span>Danh mục minh họa</span> Các mẫu dùng để giới thiệu bố cục,
              chưa phải sản phẩm được ZUKATEK công bố.
            </div>
          )}
          <div
            className="category-list"
            id="catalog-categories"
            aria-label="Lọc theo nhóm sản phẩm"
          >
            <Categories
              products={products}
              selected={filters.category}
              onChange={(category) => change({ category })}
            />
          </div>
          <div className="catalog-toolbar" id="catalog-results-top">
            <p
              id="catalog-count"
              role="status"
              aria-live="polite"
              tabIndex={-1}
            >
              {results.length
                ? `Hiển thị ${start + 1}–${Math.min(start + 9, results.length)} trong ${results.length} ${isExample ? "mẫu minh họa" : "sản phẩm"}`
                : "0 sản phẩm phù hợp"}
            </p>
            <div className="catalog-selects">
              <label>
                <span>Trạng thái</span>
                <select
                  id="product-status"
                  value={filters.status}
                  onChange={(event) => change({ status: event.target.value })}
                >
                  <option value="">Tất cả trạng thái</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sắp xếp</span>
                <select
                  id="product-sort"
                  value={filters.sort}
                  onChange={(event) => change({ sort: event.target.value })}
                >
                  <option value="featured">Ưu tiên nổi bật</option>
                  <option value="newest">Mới nhất</option>
                  <option value="name">Tên A → Z</option>
                </select>
              </label>
            </div>
          </div>
          <div className="catalog-grid" id="catalog-list">
            {results.slice(start, start + 9).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {!results.length && (
            <div className="catalog-no-results" id="catalog-no-results">
              <Icon name="grid" />
              <h2>Chưa tìm thấy sản phẩm phù hợp</h2>
              <p>Thử một từ khóa khác hoặc bỏ bớt bộ lọc.</p>
              <button
                className="button button-soft"
                id="reset-filters"
                onClick={() => {
                  setFilters(
                    readFilters(
                      new URL("http://site.local/products"),
                      products,
                    ),
                  );
                  document
                    .querySelector<HTMLInputElement>("#product-search")
                    ?.focus();
                }}
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
          <nav
            className="catalog-pagination"
            id="catalog-pagination"
            aria-label="Trang danh mục sản phẩm"
            hidden={totalPages <= 1}
          >
            <button
              type="button"
              disabled={page === 1}
              aria-label="Trang trước"
              onClick={() => navigatePage(page - 1)}
            >
              ‹
            </button>
            {pages.map((value, index) => (
              <Fragment key={value}>
                {index > 0 && value > pages[index - 1] + 1 && (
                  <span aria-hidden="true">…</span>
                )}
                <button
                  type="button"
                  aria-current={value === page ? "page" : undefined}
                  aria-label={`Trang ${value}`}
                  onClick={() => navigatePage(value)}
                >
                  {value}
                </button>
              </Fragment>
            ))}
            <button
              type="button"
              disabled={page === totalPages}
              aria-label="Trang sau"
              onClick={() => navigatePage(page + 1)}
            >
              ›
            </button>
          </nav>
          <div className="catalog-help">
            <div>
              <h2>Chưa tìm được điều bạn cần?</h2>
              <p>Hỏi ZUKATEK về tính năng, giá và cách sử dụng sản phẩm.</p>
            </div>
            <a className="button contact-nav" href={href("/#contact")}>
              <Icon name="support" />
              Liên hệ
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
