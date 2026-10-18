import { useState } from "react";
import type { MouseEvent } from "react";
import { useSite } from "../context";
import {
  categoryLabel,
  categoryOf,
  lifecycleLabel,
  productPath,
} from "../lib/catalog";
import { demoLink, safeExternalUrl, safeUrl } from "../lib/links";
import { blogDate } from "../lib/blog";
import { ProductCard } from "../components/Products";
import { ContactForm } from "../components/ContactForm";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { RegionSlot } from "../components/RegionSlot";
import { DEVICES, heroFor } from "../components/product/DeviceFrame";
import { ProductGallery } from "../components/product/ProductGallery";
import { ProductHeroShowcase } from "../components/product/ProductHeroShowcase";
import type { DeviceKind, Product, ProductMedia } from "../types";
import type { MessageKey } from "../lib/i18n";

export function NotFound({ unavailable = false }: { unavailable?: boolean }) {
  const { href, t } = useSite();
  return (
    <div className="container product-not-found">
      <span className="tag">ZUKATEK</span>
      <h1>
        {t(
          unavailable ? "product.unavailable_title" : "product.notfound_title",
        )}
      </h1>
      <p>
        {t(unavailable ? "product.unavailable_body" : "product.notfound_body")}
      </p>
      <a className="button" href={href("/products")}>
        {t("product.notfound_cta")}
      </a>
    </div>
  );
}

export function ProductDetail({ product }: { product: Product }) {
  const { products, referrer, href, regions, t, locale } = useSite();
  const related = products
    .filter(
      (item) =>
        item.id !== product.id && categoryOf(item) === categoryOf(product),
    )
    .slice(0, 3);
  const demo = demoLink(product, referrer);
  const productUrl = safeExternalUrl(product.url);
  const images = (product.gallery ?? []).filter(
    (item) => item.kind === "image" && safeUrl(item.url),
  );
  const videos = (product.gallery ?? []).filter(
    (item) => item.kind === "video" && safeExternalUrl(item.videoUrl),
  );
  const cover: ProductMedia | undefined = safeUrl(product.image)
    ? {
        kind: "image",
        url: safeUrl(product.image),
        width: product.imageWidth,
        height: product.imageHeight,
        caption: t("product.image_alt", { name: product.name }),
      }
    : undefined;
  // Show only devices with real gallery captures, using the editor-selected
  // hero image for each. A marketing cover is never treated as device evidence.
  const heroFrames = DEVICES.map((device) => ({
    device,
    image: heroFor(images, device),
  })).filter((entry): entry is { device: DeviceKind; image: ProductMedia } =>
    Boolean(entry.image),
  );
  // Covers may have been cropped for listing cards. Device previews must use
  // the actual gallery captures whenever available, without that prior crop.
  const galleryImages = images.length ? images : cover ? [cover] : [];
  const platforms = (product.platforms ?? []).map(
    (code) => t(`catalog.platform.${code}` as MessageKey) || code,
  );
  const audiences = (product.audiences ?? []).map(
    (code) => t(`catalog.audience.${code}` as MessageKey) || code,
  );
  const released = blogDate(product.releasedAt || null, locale);
  const [advice, setAdvice] = useState(false);
  // Both advice links keep their href: that is where they go without
  // JavaScript, and where a new tab or a saved bookmark should land.
  const openAdvice = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    setAdvice(true);
  };
  return (
    <div className="pd-page" id="product-detail">
      <section className="pd-hero">
        <div className="pd-hero-inner">
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
              {" " + t("product.example_note_body")}
            </div>
          )}
          <div className="pd-hero-layout">
            <div className="pd-hero-copy">
              <div className="pd-hero-tags">
                {product.status && (
                  <span className="pd-lifecycle" data-status={product.status}>
                    <i aria-hidden="true" />
                    {lifecycleLabel(t, product.status)}
                  </span>
                )}
                {product.category && (
                  <span>{categoryLabel(t, categoryOf(product))}</span>
                )}
              </div>
              <h1>{product.name}</h1>
              <p className="pd-summary">{product.summary}</p>
              <div className="pd-hero-actions">
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
                        : "product.try_now",
                    )}
                    <Icon name="arrow" />
                  </a>
                )}
                <a
                  className={`button ${demo ? "button-soft" : ""}`}
                  href={href(
                    `/?product=${encodeURIComponent(product.id)}#contact`,
                  )}
                  onClick={openAdvice}
                >
                  <Icon name="support" />
                  {t("product.contact_short")}
                </a>
              </div>
              {!!platforms.length && (
                <p className="pd-platform-note">
                  <Icon name="check" />
                  {t("product.available_on")} {platforms.join(" · ")}
                </p>
              )}
            </div>
            <ProductHeroShowcase
              frames={heroFrames}
              name={product.name}
              cover={cover}
            />
          </div>
        </div>
      </section>
      <div className="container">
        <ProductGallery images={galleryImages} name={product.name} />
        {!!videos.length && (
          <section
            className="pd-videos pd-section"
            aria-label={t("product.videos_title")}
          >
            <h2>{t("product.videos_title")}</h2>
            <div>
              {videos.map((video, index) => (
                <a
                  key={`${video.videoUrl}-${index}`}
                  href={safeExternalUrl(video.videoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    className="icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="m10 8 6 4-6 4V8Z" />
                  </svg>
                  <span>
                    {video.caption ||
                      t("product.video_number", { number: String(index + 1) })}
                  </span>
                  <Icon name="arrow" />
                </a>
              ))}
            </div>
          </section>
        )}
        <div className="pd-information pd-section" id="product-overview">
          <article
            className="pd-overview"
            aria-label={t("product.about_title")}
          >
            {product.bodyHtml ? (
              <div
                className="blog-prose pd-prose"
                dangerouslySetInnerHTML={{ __html: product.bodyHtml }}
              />
            ) : (
              <>
                <h2>{t("product.about_title")}</h2>
                <p className="pd-description">
                  {product.description || product.summary}
                </p>
              </>
            )}
          </article>
          <aside className="pd-sidebar">
            <section className="pd-info-card">
              <h2>{t("product.info_title")}</h2>
              <dl>
                {product.status && (
                  <div>
                    <dt>{t("product.status_label")}</dt>
                    <dd>{lifecycleLabel(t, product.status)}</dd>
                  </div>
                )}
                {(audiences.length > 0 || product.audience) && (
                  <div>
                    <dt>{t("product.audience_label")}</dt>
                    <dd>{audiences.join(", ") || product.audience}</dd>
                  </div>
                )}
                {!!platforms.length && (
                  <div>
                    <dt>{t("product.platform_label")}</dt>
                    <dd>{platforms.join(", ")}</dd>
                  </div>
                )}
                {product.version && (
                  <div>
                    <dt>{t("product.version_label")}</dt>
                    <dd>{product.version}</dd>
                  </div>
                )}
                {released && (
                  <div>
                    <dt>{t("product.released_label")}</dt>
                    <dd>{released}</dd>
                  </div>
                )}
              </dl>
              {productUrl && (
                <a
                  className="pd-site-link"
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("product.website")}
                  <Icon name="arrow" />
                </a>
              )}
            </section>
            {!!product.techStack?.length && (
              <section className="pd-info-card">
                <h2>{t("product.technology_title")}</h2>
                <ul className="pd-tech-list">
                  {product.techStack.map((tech) => (
                    <li key={tech}>{tech}</li>
                  ))}
                </ul>
              </section>
            )}
            <RegionSlot name="aside" blocks={regions.aside} />
          </aside>
        </div>
        <section
          className="pd-experience pd-section"
          id="product-experience"
          aria-labelledby="pd-experience-title"
        >
          <div className="pd-experience-intro">
            <span className="pd-kicker">{t("product.experience_eyebrow")}</span>
            <h2 id="pd-experience-title">
              {t("product.experience_title", { name: product.name })}
            </h2>
            <p>
              {product.demoAccess ||
                t(demo ? "product.demo_panel_body" : "product.demo_panel_none")}
            </p>
            <div className="pd-hero-actions">
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
                      : "product.try_now",
                  )}
                  <Icon name="arrow" />
                </a>
              )}
              <a
                className="pd-inline-link"
                href={href(
                  `/?product=${encodeURIComponent(product.id)}#contact`,
                )}
                onClick={openAdvice}
              >
                {t("product.ask_advice")}
                <Icon name="arrow" />
              </a>
            </div>
          </div>
          {!!product.demoInstructions?.length && (
            <ol className="pd-experience-steps">
              {product.demoInstructions.map((step, index) => (
                <li key={`${index}-${step}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        {!!related.length && (
          <section className="pd-related pd-section">
            <div className="pd-section-heading">
              <h2>{t("product.related_title")}</h2>
              <a className="pd-inline-link" href={href("/products")}>
                {t("catalog.breadcrumb_products")}
                <Icon name="arrow" />
              </a>
            </div>
            <div className="catalog-grid">
              {related.map((item) => (
                <ProductCard key={productPath(item)} product={item} listing />
              ))}
            </div>
          </section>
        )}
      </div>
      {advice && (
        <Modal
          id="advice-dialog"
          titleId="contact-form-title"
          eyebrow={t("contact.eyebrow")}
          onClose={() => setAdvice(false)}
        >
          <ContactForm productId={product.id} />
        </Modal>
      )}
    </div>
  );
}
