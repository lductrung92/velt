import { useSite } from "../context";

export function ListingFilterToggle({
  controls,
  expanded,
  activeCount = 0,
  onToggle,
}: {
  controls: string;
  expanded: boolean;
  activeCount?: number;
  onToggle: () => void;
}) {
  const { t } = useSite();
  const label =
    activeCount > 0
      ? t("listing.filters_active", { count: activeCount })
      : t("listing.filters");
  return (
    <button
      type="button"
      id={`${controls}-toggle`}
      className="listing-filter-toggle"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16M4 18h16" />
        <circle cx="9" cy="6" r="2.5" />
        <circle cx="15" cy="18" r="2.5" />
      </svg>
      {activeCount > 0 && (
        <span className="listing-filter-count" aria-hidden="true">
          {activeCount}
        </span>
      )}
    </button>
  );
}
