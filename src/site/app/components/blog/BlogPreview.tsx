import { useSite } from "../../context";
import { PostCard } from "./BlogCard";
import { Icon } from "../Icon";

export function BlogPreview({ limit }: { limit?: number } = {}) {
  const { blog, href, t } = useSite();
  // The articles already come from the published feed; the section only says
  // how many of them to show.
  const count =
    Number.isFinite(limit) && (limit as number) > 0 ? (limit as number) : 3;
  return (
    <section
      className="section blog-home"
      id="blog"
      aria-labelledby="blog-home-title"
    >
      <div className="container">
        <div className="blog-section-heading">
          <div>
            <span className="blog-eyebrow">ZUKATEK JOURNAL</span>
            <h2 id="blog-home-title">{t("blog.masthead_title")}</h2>
            <p>{t("blog.home_lead")}</p>
          </div>
          <a className="text-link primary-text" href={href("/blog")}>
            {t("blog.home_cta")}
            <Icon name="arrow" />
          </a>
        </div>
        {blog.items.length ? (
          <div
            className={`blog-grid${blog.items.length === 1 ? " blog-grid-single" : ""}`}
          >
            {blog.items.slice(0, count).map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <div className="blog-home-empty">
            <span>
              {blog.status === "unavailable"
                ? t("blog.home_unavailable")
                : t("blog.home_empty")}
            </span>
            <a href={href("/blog")}>
              {t("blog.home_visit")}
              <Icon name="arrow" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
