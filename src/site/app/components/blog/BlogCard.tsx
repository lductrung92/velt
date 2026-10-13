import { useId, useState } from "react";
import { useSite } from "../../context";
import { blogDate, blogPath, type BlogCard as Post } from "../../lib/blog";
import { Icon } from "../Icon";

export function BlogCover({
  post,
  priority = false,
}: {
  post: Post;
  priority?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const gradient = `journal-${useId().replace(/:/g, "")}`;
  return (
    <div className="blog-cover">
      {post.cover_url && !broken ? (
        <img
          src={post.cover_url}
          alt=""
          loading={priority ? "eager" : "lazy"}
          onError={() => setBroken(true)}
        />
      ) : (
        <svg viewBox="0 0 720 480" aria-hidden="true">
          <defs>
            <linearGradient id={gradient} x2="1" y2="1">
              <stop stopColor="#eaf1ff" />
              <stop offset="1" stopColor="#dde8fc" />
            </linearGradient>
          </defs>
          <rect width="720" height="480" fill={`url(#${gradient})`} />
          <circle
            cx="560"
            cy="120"
            r="190"
            fill="none"
            stroke="#b9cefa"
            strokeWidth="1"
          />
          <circle
            cx="560"
            cy="120"
            r="140"
            fill="none"
            stroke="#b9cefa"
            strokeWidth="1"
          />
          <path
            d="M-40 410C130 410 80 180 300 210S480 490 770 290"
            fill="none"
            stroke="#0061fd"
            strokeWidth="70"
            opacity=".08"
          />
          <g transform="translate(214 75) rotate(-9 150 175)">
            <rect
              x="20"
              y="25"
              width="290"
              height="330"
              rx="16"
              fill="#0061fd"
              opacity=".12"
            />
            <rect
              width="290"
              height="330"
              rx="16"
              fill="white"
              stroke="#d4e0f7"
            />
            <path
              d="M40 47h24m-24 9h16"
              stroke="#0061fd"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <text x="40" y="110" fill="#00234b" fontSize="29" fontWeight="600">
              Zukatek
            </text>
            <text x="40" y="147" fill="#00234b" fontSize="29" fontWeight="600">
              Journal.
            </text>
            <path
              d="M40 178h185m-185 14h152"
              stroke="#dde6f5"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <rect
              x="40"
              y="222"
              width="210"
              height="68"
              rx="8"
              fill="#eff4ff"
            />
            <path
              d="m60 268 38-25 38 14 42-16 48 21"
              fill="none"
              stroke="#83a9f5"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
          <circle cx="163" cy="155" r="10" fill="#0061fd" opacity=".2" />
          <path
            d="M557 314v28m-14-14h28"
            stroke="#0061fd"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".4"
          />
        </svg>
      )}
    </div>
  );
}

export function PostCard({
  post,
  featured = false,
}: {
  post: Post;
  featured?: boolean;
}) {
  const { href, locale, t } = useSite();
  const date = blogDate(post.published_at, locale);
  return (
    <article className={`blog-card${featured ? " blog-card-featured" : ""}`}>
      <a className="blog-card-link" href={href(blogPath(post.slug))}>
        <BlogCover post={post} priority={featured} />
        <div className="blog-card-copy">
          <div className="blog-card-meta">
            <span>{featured ? t("blog.card.latest") : "ZUKATEK JOURNAL"}</span>
            {date && <time dateTime={post.published_at!}>{date}</time>}
          </div>
          {featured ? <h2>{post.title}</h2> : <h3>{post.title}</h3>}
          {post.excerpt && <p>{post.excerpt}</p>}
          <span className="blog-read-link">
            {t("blog.card.read")}
            <Icon name="arrow" />
          </span>
        </div>
      </a>
    </article>
  );
}
