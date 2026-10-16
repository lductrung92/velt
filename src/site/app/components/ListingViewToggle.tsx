import { useSite } from "../context";
import type { ListingView } from "../lib/listingView";

export function ListingViewToggle({
  value,
  onChange,
}: {
  value: ListingView;
  onChange: (view: ListingView) => void;
}) {
  const { t } = useSite();
  return (
    <div
      className="listing-view-toggle"
      role="group"
      aria-label={t("listing.view_label")}
    >
      <button
        type="button"
        aria-pressed={value === "grid"}
        aria-label={t("listing.view_grid")}
        title={t("listing.view_grid")}
        onClick={() => onChange("grid")}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="6" height="6" rx="1.25" />
          <rect x="14" y="4" width="6" height="6" rx="1.25" />
          <rect x="4" y="14" width="6" height="6" rx="1.25" />
          <rect x="14" y="14" width="6" height="6" rx="1.25" />
        </svg>
      </button>
      <button
        type="button"
        aria-pressed={value === "list"}
        aria-label={t("listing.view_list")}
        title={t("listing.view_list")}
        onClick={() => onChange("list")}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="4.5" width="4" height="3" rx=".75" />
          <rect x="3.5" y="10.5" width="4" height="3" rx=".75" />
          <rect x="3.5" y="16.5" width="4" height="3" rx=".75" />
          <path d="M11 6h9.5M11 12h9.5M11 18h9.5" />
        </svg>
      </button>
    </div>
  );
}
