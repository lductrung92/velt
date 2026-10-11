import { renderToString } from "react-dom/server";
import { App, resolveRoute } from "./App";
import type { AppProps } from "./types";

export function render(path: string) {
  const url = new URL(path, "http://site.local"),
    route = resolveRoute(url);
  const props: AppProps = {
    url: url.pathname + url.search,
    year: new Date().getUTCFullYear(),
  };
  const title = route.home
    ? "ZUKATEK — Đội ngũ phát triển & sản phẩm số"
    : route.catalog
      ? "Sản phẩm — ZUKATEK"
      : route.product
        ? `${route.product.name} — ZUKATEK${route.product.example ? " · Minh họa" : ""}`
        : "Không tìm thấy — ZUKATEK";
  const description =
    route.product?.summary ||
    "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Xem đội ngũ, khám phá sản phẩm và liên hệ tư vấn trước khi mua.";
  return {
    html: renderToString(<App {...props} />),
    props,
    status: route.status,
    title,
    description,
  };
}
