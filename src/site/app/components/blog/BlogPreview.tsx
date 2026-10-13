import { useSite } from "../../context";
import { PostCard } from "./BlogCard";
import { Icon } from "../Icon";

export function BlogPreview({ limit }: { limit?: number } = {}) {
  const { blog, href } = useSite();
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
            <h2 id="blog-home-title">Góc nhìn từ Zukatek</h2>
            <p>
              Kiến thức, kinh nghiệm và những câu chuyện trong hành trình làm
              sản phẩm.
            </p>
          </div>
          <a className="text-link primary-text" href={href("/blog")}>
            Khám phá Blog <Icon name="arrow" />
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
                ? "Chưa thể tải bài viết lúc này. Bạn có thể thử lại tại Blog."
                : "Những câu chuyện từ Zukatek sẽ được chia sẻ tại đây."}
            </span>
            <a href={href("/blog")}>
              Ghé thăm Blog <Icon name="arrow" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
