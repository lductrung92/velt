import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { useIllustrative } from "../hooks/useIllustrative";
import type { IllustrativeItem } from "../types";

interface Props {
  path: string;
  /** Fired when user clicks a thumbnail. URL is fetched + converted to a
   *  blob/dataUrl by PickerModal so it flows through the same selection
   *  plumbing as Upload. */
  onSelect: (item: IllustrativeItem) => void;
  /** Currently selected URL — render with a primary ring. */
  selectedUrl?: string;
}

// Static gallery tab. The JSON shape (IllustrativeData) groups items by
// category; titles + names carry {vi, en} pairs and pick the active i18n
// language at render time.
export function IllustrativeTab({ path, onSelect, selectedUrl }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language?.startsWith("en") ? "en" : "vi") as "vi" | "en";
  const { data, isLoading, isError } = useIllustrative(path);

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t("image.upload.illustrative.loading")}
      </div>
    );
  }

  if (isError || !data || Object.keys(data).length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t("image.upload.illustrative.empty")}
      </div>
    );
  }

  return (
    <div className="max-h-[480px] space-y-5 overflow-y-auto pr-1">
      {Object.entries(data).map(([key, category]) => (
        <section key={key} className="space-y-2">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {category.title[lang]}
          </h6>
          {category.items.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {t("image.upload.illustrative.empty")}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {category.items.map((item) => {
                const isSelected = selectedUrl === item.url;
                return (
                  <button
                    key={item.url}
                    type="button"
                    onClick={() => onSelect(item)}
                    aria-pressed={isSelected}
                    title={item.name[lang]}
                    className={cn(
                      "group flex flex-col items-stretch overflow-hidden rounded-md border bg-background text-left transition-colors",
                      "hover:border-primary hover:bg-accent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isSelected
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-input",
                    )}
                  >
                    <div className="aspect-square w-full overflow-hidden bg-muted/40">
                      <img
                        src={item.url}
                        alt={item.name[lang]}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </div>
                    <span className="truncate px-2 py-1 text-xs text-foreground">
                      {item.name[lang]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
