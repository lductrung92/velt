import { Fragment, useEffect, useState } from "react";
import { useSite } from "../context";
import {
  categoryLabel,
  categoryOf,
  lifecycleLabel,
  readFilters,
  selectProducts,
} from "../lib/catalog";
import type { Filters } from "../lib/catalog";
import { ProductCard } from "../components/Products";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { PageHeroVisual } from "../components/hero/PageHeroVisual";
import { ListingViewToggle } from "../components/ListingViewToggle";
import { ListingFilterToggle } from "../components/ListingFilterToggle";
import { applyListingView, useListingView } from "../lib/listingView";

export function Catalog() {
  const { products, isExample, url, href, referrer, t, layout } = useSite();
  const [view, changeView] = useListingView(url);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = () => {
    setFiltersOpen(false);
    document.getElementById("catalog-extra-filters-toggle")?.focus();
  };
  const [filters, setFilters] = useState(() => readFilters(url, products));
  const results = selectProducts(products, filters),
    totalPages = Math.max(
      1,
      Math.ceil(results.length / layout.head.productsPageSize),
    );
  const perPage = layout.head.productsPageSize;
  const page = Math.min(filters.page, totalPages),
    start = (page - 1) * perPage;
  const statuses = [
    ...new Set(
      products
        .map((product) => product.status)
        .filter((status): status is string => !!status),
    ),
  ];
  useEffect(() => {
    const params = new URLSearchParams();
    if (referrer) params.set("ref", referrer.id);
    if (filters.query) params.set("q", filters.query);
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    if (filters.sort !== "featured") params.set("sort", filters.sort);
    if (page > 1) params.set("page", String(page));
    applyListingView(params, view);
    history.replaceState(
      null,
      "",
      `/products${params.size ? `?${params}` : ""}`,
    );
  }, [filters, page, referrer, view]);
  useEffect(() => {
    const back = () =>
      setFilters(readFilters(new URL(location.href), products));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, [products]);
  const change = (next: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...next, page: 1 }));
  const categories = [...new Set(products.map(categoryOf))];
  const filtered =
    !!filters.query ||
    !!filters.category ||
    !!filters.status ||
    filters.sort !== "featured";
  const resetFilters = () => {
    setFilters(readFilters(new URL("http://site.local/products"), products));
    document.querySelector<HTMLInputElement>("#product-search")?.focus();
  };
  const navigatePage = (value: number) => {
    setFilters((current) => ({ ...current, page: value }));
    document.querySelector("#catalog-results-top")?.scrollIntoView({
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
      <section className="catalog-hero page-hero page-hero--products">
        <div className="container">
          <nav className="breadcrumbs" aria-label={t("catalog.breadcrumb")}>
            <a href={href("/")}>{t("catalog.breadcrumb_home")}</a>
            <span aria-hidden="true">/</span>
            <span>{t("catalog.breadcrumb_products")}</span>
          </nav>
          <div className="page-hero-copy catalog-hero-copy">
            <span className="tag">{t("catalog.hero_eyebrow")}</span>
            <h1>{t("catalog.hero_title")}</h1>
            <p>{t("catalog.hero_body")}</p>
          </div>
          <PageHeroVisual kind="products" />
        </div>
      </section>
      <section className="catalog-section catalog-listing">
        <div className="container">
          {isExample && (
            <div className="catalog-example-note" id="catalog-example-note">
              <span>{t("catalog.example_note_title")}</span>
              {` ${t("catalog.example_note_body")}`}
            </div>
          )}
          <div
            className="listing-filters catalog-filters"
            id="catalog-categories"
            data-expanded={filtersOpen}
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                filtersOpen &&
                !event.defaultPrevented
              ) {
                event.stopPropagation();
                closeFilters();
              }
            }}
            role="group"
            aria-label={t("catalog.categories_label")}
          >
            <div className="listing-field listing-query-field">
              <label htmlFor="product-search">
                {t("catalog.search_label")}
              </label>
              <div className="listing-search-control">
                <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 5 5" />
                </svg>
                <input
                  id="product-search"
                  type="search"
                  placeholder={t("catalog.search_placeholder")}
                  autoComplete="off"
                  maxLength={200}
                  value={filters.query}
                  onChange={(event) => change({ query: event.target.value })}
                />
                <button
                  type="button"
                  id="clear-search"
                  aria-label={t("catalog.search_clear")}
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
              </div>
            </div>
            <ListingFilterToggle
              controls="catalog-extra-filters"
              expanded={filtersOpen}
              activeCount={
                Number(!!filters.category) +
                Number(!!filters.status) +
                Number(filters.sort !== "featured")
              }
              onToggle={() => setFiltersOpen(!filtersOpen)}
            />
            <div className="listing-extra-filters" id="catalog-extra-filters">
              <div className="listing-field">
                <label htmlFor="product-category">
                  {t("catalog.category_label")}
                </label>
                <Select
                  id="product-category"
                  value={filters.category}
                  onChange={(category) => change({ category })}
                  options={[
                    { value: "", label: t("catalog.categories_all") },
                    ...categories.map((value) => ({
                      value,
                      label: categoryLabel(t, value),
                    })),
                  ]}
                />
              </div>
              <div className="listing-field">
                <label htmlFor="product-status">
                  {t("catalog.status_label")}
                </label>
                <Select
                  id="product-status"
                  value={filters.status}
                  onChange={(status) => change({ status })}
                  options={[
                    { value: "", label: t("catalog.status_all") },
                    ...statuses.map((value) => ({
                      value,
                      label: lifecycleLabel(t, value),
                    })),
                  ]}
                />
              </div>
              <div className="listing-field">
                <label htmlFor="product-sort">{t("catalog.sort_label")}</label>
                <Select
                  id="product-sort"
                  value={filters.sort}
                  onChange={(sort) => change({ sort })}
                  options={[
                    { value: "featured", label: t("catalog.sort_featured") },
                    { value: "newest", label: t("catalog.sort_newest") },
                    { value: "name", label: t("catalog.sort_name") },
                  ]}
                />
              </div>
              <div className="listing-filter-footer">
                {filtered && (
                  <button
                    className="listing-reset"
                    type="button"
                    onClick={resetFilters}
                  >
                    {t("catalog.empty_reset")}
                  </button>
                )}
                <button
                  className="listing-filter-done"
                  type="button"
                  onClick={closeFilters}
                >
                  {t("listing.filters_done")}
                  <Icon name="check" />
                </button>
              </div>
            </div>
          </div>
          <div
            className="listing-results catalog-listing-results"
            id="catalog-results-top"
          >
            <p
              id="catalog-count"
              role="status"
              aria-live="polite"
              tabIndex={-1}
            >
              {results.length
                ? t(
                    isExample
                      ? "catalog.showing_examples"
                      : "catalog.showing_products",
                    {
                      from: start + 1,
                      to: Math.min(start + perPage, results.length),
                      total: results.length,
                    },
                  )
                : t("catalog.no_matches")}
            </p>
            <div className="listing-results-actions">
              {filtered && (
                <button
                  className="listing-reset"
                  type="button"
                  onClick={resetFilters}
                >
                  {t("catalog.empty_reset")}
                  <Icon name="close" />
                </button>
              )}
              <ListingViewToggle value={view} onChange={changeView} />
            </div>
          </div>
          <div className="catalog-grid" id="catalog-list" data-view={view}>
            {results.slice(start, start + perPage).map((product) => (
              <ProductCard key={product.id} product={product} listing />
            ))}
          </div>
          {!results.length && (
            <div className="catalog-no-results" id="catalog-no-results">
              <Icon name="grid" />
              <h2>{t("catalog.empty_title")}</h2>
              <p>{t("catalog.empty_body")}</p>
              <button
                className="button button-soft"
                id="reset-filters"
                onClick={resetFilters}
              >
                {t("catalog.empty_reset")}
              </button>
            </div>
          )}
          <nav
            className="catalog-pagination"
            id="catalog-pagination"
            aria-label={t("catalog.pagination_label")}
            hidden={totalPages <= 1}
          >
            <button
              type="button"
              disabled={page === 1}
              aria-label={t("catalog.page_previous")}
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
                  aria-label={t("catalog.page_number", { n: value })}
                  onClick={() => navigatePage(value)}
                >
                  {value}
                </button>
              </Fragment>
            ))}
            <button
              type="button"
              disabled={page === totalPages}
              aria-label={t("catalog.page_next")}
              onClick={() => navigatePage(page + 1)}
            >
              ›
            </button>
          </nav>
          <div className="catalog-help">
            <div>
              <h2>{t("catalog.help_title")}</h2>
              <p>{t("catalog.help_body")}</p>
            </div>
            <a className="button contact-nav" href={href("/#contact")}>
              <Icon name="support" />
              {t("catalog.help_cta")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
