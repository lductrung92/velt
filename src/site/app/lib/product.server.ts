import type {
  DeviceKind,
  ProductMedia,
  ProductPageState,
  ProductSEO,
} from "../types";
import { cached, ttlSeconds } from "./cache.server";
import { publicArticleHtml } from "./blog.server";
import { translator } from "./i18n";
import { safeExternalUrl, safeUrl } from "./links";
import { BASE_LOCALE } from "./locales";
import { toProduct, type ApiProduct } from "./site.server";

interface PublicProduct extends ApiProduct {
  body_html: string | null;
  product_url: string | null;
  demo: { url: string | null; access: string | null; instructions: string[] };
  highlights: string[];
  tech_stack: string[];
  version: string | null;
  released_at: string | null;
  seo: ProductSEO;
  alternates: { locale: string; slug: string; x_default?: boolean }[];
  gallery: {
    kind: "image" | "video";
    url: string | null;
    width?: number;
    height?: number;
    video_url: string | null;
    caption: string | null;
    device: DeviceKind | null;
    is_hero?: boolean;
  }[];
  members: {
    slug: string;
    full_name: string;
    role: string | null;
    avatar_url: string | null;
    avatar_width?: number;
    avatar_height?: number;
  }[];
}

export const productDetailPath = (slug: string) =>
  `/products/${encodeURIComponent(slug)}`;

/** Detail is loaded independently of the first catalog page, including locale. */
export async function loadProductPage(
  path: string,
  request: typeof fetch = fetch,
  locale = BASE_LOCALE,
  base = process.env.SITE_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    "http://127.0.0.1:8081/api",
): Promise<ProductPageState | undefined> {
  const url = new URL(path, "http://site.local");
  if (url.pathname === "/products" || url.pathname === "/products/") return;
  if (
    !url.pathname.startsWith("/products/") &&
    url.pathname !== "/product.html"
  )
    return;
  let slug = "";
  try {
    slug =
      url.pathname === "/product.html"
        ? url.searchParams.get("id") || ""
        : decodeURIComponent(url.pathname.slice(10).replace(/\/$/, ""));
  } catch {
    return { status: "not-found" };
  }
  if (!slug || /[\/\\?#]/.test(slug)) return { status: "not-found" };
  const api = base.replace(/\/$/, "");
  const origin = new URL(process.env.SITE_PUBLIC_API_BASE_URL || api).origin;
  const media = (value: string | null | undefined) =>
    value ? safeUrl(new URL(value, origin).href) : "";
  try {
    const ttl = (await ttlSeconds(request)) * 1000;
    return await cached(
      `product-detail:${locale}:${slug}`,
      ttl,
      async (): Promise<ProductPageState> => {
        const response = await request(
          `${api}/public/products/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`,
          { redirect: "manual", signal: AbortSignal.timeout(4000) },
        );
        if (response.status === 404) return { status: "not-found" };
        if (response.status === 301 || response.status === 308) {
          const location = response.headers.get("location");
          if (!location) throw new Error("Product redirect missing location");
          const target = new URL(location, `${api}/`);
          const prefix = `${new URL(api).pathname}/public/products/`;
          if (
            target.origin !== new URL(api).origin ||
            !target.pathname.startsWith(prefix)
          )
            throw new Error("Invalid product redirect");
          const next = decodeURIComponent(target.pathname.slice(prefix.length));
          if (!next || /[\/\\?#]/.test(next))
            throw new Error("Invalid product slug");
          return { status: "redirect", redirect: productDetailPath(next) };
        }
        if (!response.ok) throw new Error(`Product detail ${response.status}`);
        const p = (await response.json()) as PublicProduct;
        if (!p.slug || !p.name) throw new Error("Invalid public product");
        const gallery: ProductMedia[] = (p.gallery ?? [])
          .map((item) => ({
            kind: item.kind,
            url: media(item.url),
            width: item.width,
            height: item.height,
            videoUrl: safeExternalUrl(item.video_url || ""),
            caption: item.caption || "",
            device: item.device,
            isHero: item.is_hero === true,
          }))
          .filter((item) =>
            item.kind === "image" ? !!item.url : !!item.videoUrl,
          );
        return {
          status: "ready",
          product: {
            ...toProduct(p, translator(locale)),
            image: media(p.cover_url),
            // The public API sanitizes HTML on write. Only its published body is rendered.
            bodyHtml: publicArticleHtml(p.body_html || "", origin).replace(
              /(<img\b[^>]*\bsrc=["'])(\/img\/[^"']*)(["'])/gi,
              (_match, start: string, src: string, end: string) =>
                `${start}${new URL(src, origin).href}${end}`,
            ),
            url: safeExternalUrl(p.product_url || ""),
            demoUrl: safeExternalUrl(p.demo?.url || ""),
            demoAccess: p.demo?.access || "",
            demoInstructions: p.demo?.instructions ?? [],
            highlights: p.highlights ?? [],
            techStack: p.tech_stack ?? [],
            version: p.version || "",
            releasedAt: p.released_at || "",
            gallery,
            developers: (p.members ?? []).map((member) => ({
              id: member.slug,
              name: member.full_name,
              role: member.role || "",
              image: media(member.avatar_url),
              imageWidth: member.avatar_width,
              imageHeight: member.avatar_height,
            })),
            seo: { ...p.seo, og_image_url: media(p.seo?.og_image_url) },
            alternates: p.alternates ?? [],
          },
        };
      },
    );
  } catch {
    return { status: "unavailable" };
  }
}
