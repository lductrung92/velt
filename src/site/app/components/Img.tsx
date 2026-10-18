import { useState } from "react";

// The sizes the media package actually serves. A width outside this set is a
// 404, not a clamp, so a srcset may never name one.
const WIDTHS = [320, 640, 960, 1280, 1920];

// Only `/img/{slug}.{ext}` has sized siblings at `/img/{slug}/{w}.{ext}`. An
// image with no `files` row keeps its old `/api/files/...` URL and sends no
// dimensions; that one has to keep rendering exactly as it did.
const MEDIA = /^((?:https?:\/\/[^/]+)?)\/img\/([^/]+)\.(webp|jpg|png)$/;

/** /files serves unchanged bytes; /img can resize and encode them again. */
export function originalImageUrl(src: string) {
  const media = MEDIA.exec(src);
  return media ? `${media[1]}/files/${media[2]}.${media[3]}` : src;
}

export function Img({
  src,
  width,
  height,
  alt,
  sizes,
  priority = false,
  original = false,
  className,
  onError,
}: {
  src: string;
  /** The INTRINSIC size the API reports — the aspect ratio, not a layout width. */
  width?: number;
  height?: number;
  alt: string;
  /** Only the caller knows how wide its column is. */
  sizes: string;
  /** The page's LCP image, and nothing else. */
  priority?: boolean;
  /** Preserve source resolution for interface screenshots and full-image views. */
  original?: boolean;
  className?: string;
  onError?: () => void;
}) {
  const [failedOriginal, setFailedOriginal] = useState("");
  // width/height are what reserve the box before the bytes land, so they go on
  // the tag whether or not a srcset can be built below.
  const common = {
    alt,
    width,
    height,
    className,
    onError,
    ...(priority
      ? { fetchPriority: "high" as const }
      : { loading: "lazy" as const, decoding: "async" as const }),
  };
  const media = MEDIA.exec(src);
  // Never advertise a width above the source's own: the server does not
  // upscale, so a wider variant would only cost bytes for the same pixels.
  const widths = width ? WIDTHS.filter((w) => w <= width) : [];
  if (original) {
    const raw = originalImageUrl(src);
    const source = failedOriginal === raw ? src : raw;
    return (
      <img
        src={source}
        {...common}
        onError={() => {
          // An image-only CDN or a legacy extension may not expose /files. Keep
          // full pixel dimensions via the unsized image URL in that case.
          if (source !== src) setFailedOriginal(raw);
          else onError?.();
        }}
      />
    );
  }
  if (!media || !height || widths.length === 0)
    return <img src={src} {...common} />;
  const [, origin, slug, ext] = media;
  const srcSet = (format: string) =>
    widths.map((w) => `${origin}/img/${slug}/${w}.${format} ${w}w`).join(", ");
  const img = (
    <img
      src={`${origin}/img/${slug}/${widths[widths.length - 1]}.${ext}`}
      srcSet={srcSet(ext)}
      sizes={sizes}
      {...common}
    />
  );
  // An explicit <source> rather than the negotiated URL: the sized variants are
  // immutable and carry no `Vary: Accept`, so every cache keeps one copy of
  // each instead of one per browser.
  return ext === "webp" ? (
    img
  ) : (
    <picture>
      <source type="image/webp" srcSet={srcSet("webp")} sizes={sizes} />
      {img}
    </picture>
  );
}
