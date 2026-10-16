import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { useWidgetPreview } from "../hooks/useWidgetPreview";
import { fileUrl } from "@/utils/fileUrl";
import type {
  PreviewArticleItem,
  PreviewCategoryItem,
  PreviewItem,
  PreviewProductItem,
} from "../services/widgets.service";

import type { WidgetConfig } from "./widgetCatalog";

// Placeholder card grid shown while the live data is loading.
function SkeletonGrid({ columns, count }: { columns: number; count: number }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border bg-background p-2">
          <div className="mb-2 aspect-video rounded bg-muted" />
          <div className="mb-1 h-2.5 w-3/4 rounded bg-muted" />
          <div className="h-2.5 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// One resolved item, rendered per widget type.
function ItemCard({ type, item }: { type: string; item: PreviewItem }) {
  if (type === "categories_showcase") {
    const c = item as PreviewCategoryItem;
    return (
      <div className="rounded-md border bg-background p-3">
        <p className="font-medium">{c.name}</p>
        <p className="text-xs text-muted-foreground">{c.count}</p>
      </div>
    );
  }
  if (type === "articles_list") {
    const a = item as PreviewArticleItem;
    return (
      <div className="rounded-md border bg-background p-3">
        <p className="font-medium">{a.title}</p>
        {a.excerpt && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {a.excerpt}
          </p>
        )}
      </div>
    );
  }
  const p = item as PreviewProductItem;
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      {p.cover_url ? (
        <img
          src={fileUrl(p.cover_url)}
          alt=""
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="aspect-video w-full bg-muted" />
      )}
      <p className="truncate p-2 text-sm font-medium">{p.name}</p>
    </div>
  );
}

// List-type preview (products/articles/categories): resolves live data via the hook
// and renders the real items in a columns grid, with loading/error/empty states.
function ListPreview({ type, config }: { type: string; config: WidgetConfig }) {
  const { t } = useTranslation();
  const c = config as Record<string, unknown>;
  const title = typeof c.title === "string" ? c.title : "";
  const columns =
    typeof c.columns === "number" && c.columns >= 1
      ? Math.min(c.columns, 4)
      : 3;
  const { data, isLoading, isError } = useWidgetPreview(type, config);
  const items = data?.data?.items ?? [];

  return (
    <div className="space-y-2">
      {title && <p className="text-base font-medium">{title}</p>}
      {isLoading ? (
        <SkeletonGrid columns={columns} count={columns} />
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          {t("cms.pages.inline.preview_error")}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("cms.pages.inline.preview_empty")}
        </p>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {items.map((it, i) => (
            <ItemCard key={i} type={type} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

// WidgetPreview renders a faithful preview of a widget from its config: rich_text
// and cta_banner render for real (config IS the content); the data-backed list
// widgets resolve live data through ListPreview.
export function WidgetPreview({
  type,
  config,
}: {
  type: string;
  config: WidgetConfig;
}) {
  const { t } = useTranslation();
  const c = config as Record<string, unknown>;

  if (type === "rich_text") {
    const html = typeof c.html === "string" ? c.html : "";
    if (!html) {
      return (
        <p className="text-sm text-muted-foreground">
          {t("cms.pages.inline.preview_empty")}
        </p>
      );
    }
    return (
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        // Client-side sanitize the DRAFT html: this preview renders the editor's
        // current (un-saved) content, so the backend sanitizer has not run yet —
        // without this, an onerror/onload payload would execute in the admin origin.
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    );
  }

  if (type === "cta_banner") {
    const heading = typeof c.heading === "string" ? c.heading : "";
    const sub = typeof c.sub === "string" ? c.sub : "";
    const btn = Array.isArray(c.buttons)
      ? (c.buttons[0] as { label?: string } | undefined)
      : undefined;
    const empty = !heading && !sub && !btn?.label;
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border bg-background p-4",
          c.align === "left"
            ? "items-start text-left"
            : "items-center text-center",
        )}
      >
        {heading && <p className="text-lg font-bold">{heading}</p>}
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        {btn?.label && (
          <span className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">
            {btn.label}
          </span>
        )}
        {empty && (
          <p className="text-sm text-muted-foreground">
            {t("cms.pages.inline.preview_empty")}
          </p>
        )}
      </div>
    );
  }

  return <ListPreview type={type} config={config} />;
}
