import { useId, useState, type MouseEvent } from "react";
import { useSite } from "../../context";
import { Icon } from "../Icon";

type Network = "facebook" | "zalo" | "linkedin" | "x";

function NetworkIcon({ network }: { network: Network }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      {network === "facebook" && (
        <path d="M13.8 21v-8h2.8l.4-3.2h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.8V3.4c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2H7.3V13h2.9v8Z" />
      )}
      {network === "zalo" && (
        <>
          <path
            d="M19.7 16.3c.9-1.3 1.3-2.7 1.3-4.3 0-4.7-4-8.5-9-8.5S3 7.3 3 12s4 8.5 9 8.5c1.2 0 2.4-.2 3.5-.7l4.6.7-.4-4.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M8.3 8.5h7.4l-7.4 7h7.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {network === "linkedin" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path
            d="M7 10v7m4-7v7m0-4c0-4 6-4 6 0v4"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
          />
          <circle cx="7" cy="7" r="1.2" fill="#fff" />
        </>
      )}
      {network === "x" && (
        <path
          d="M4 3h4.5L20 21h-4.5ZM20 3 4 21"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function ArticleShare({ path, title }: { path: string; title: string }) {
  const { url, t } = useSite();
  const headingId = useId();
  const [status, setStatus] = useState<"idle" | "copied" | "failed" | "zalo">(
    "idle",
  );
  const shareUrl = new URL(path, url.origin).href;
  const links = [
    {
      network: "facebook" as const,
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: shareUrl })}`,
    },
    { network: "zalo" as const, label: "Zalo", href: "https://chat.zalo.me/" },
    {
      network: "linkedin" as const,
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url: shareUrl })}`,
    },
    {
      network: "x" as const,
      label: "X",
      href: `https://twitter.com/intent/tweet?${new URLSearchParams({ url: shareUrl, text: title })}`,
    },
  ];

  async function copyLink(next: "copied" | "zalo" = "copied") {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus(next);
    } catch {
      setStatus("failed");
    }
  }

  async function shareToZalo(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator.share !== "function") {
      // Let the link open Zalo Web while the visitor's activation permits copying.
      void copyLink("zalo");
      return;
    }
    event.preventDefault();
    try {
      await navigator.share({ title, url: shareUrl });
      setStatus("idle");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus("failed");
    }
  }

  return (
    <section className="blog-share" aria-labelledby={headingId}>
      <h2 id={headingId} className="article-share-heading">
        {t("blog.article.share")}
      </h2>
      <div className="article-share-toolbar">
        <div className="article-share-networks">
          {links.map(({ network, label, href }) => (
            <a
              key={network}
              className="article-share-action"
              data-network={network}
              title={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("blog.article.share_on", { network: label })}
              onClick={network === "zalo" ? shareToZalo : undefined}
            >
              <span className="article-share-icon">
                <NetworkIcon network={network} />
              </span>
            </a>
          ))}
        </div>
        <div className="article-share-copy">
          <button
            type="button"
            className="article-share-action"
            data-copied={status === "copied" || status === "zalo"}
            aria-label={
              status === "copied" || status === "zalo"
                ? t("blog.article.copied")
                : t("blog.article.copy_link")
            }
            title={
              status === "copied" || status === "zalo"
                ? t("blog.article.copied")
                : t("blog.article.copy_link")
            }
            onClick={() => void copyLink()}
          >
            <span className="article-share-icon" aria-hidden="true">
              {status === "copied" || status === "zalo" ? (
                <Icon name="check" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="8" y="8" width="12" height="13" rx="2" />
                  <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </span>
          </button>
        </div>
      </div>
      <p
        className={
          status === "failed" || status === "zalo"
            ? "article-share-feedback"
            : "sr-only"
        }
        role="status"
        aria-live="polite"
      >
        {status === "copied"
          ? t("blog.article.copy_ok")
          : status === "failed"
            ? t("blog.article.copy_fail")
            : status === "zalo"
              ? t("blog.article.zalo_paste")
              : ""}
      </p>
    </section>
  );
}
