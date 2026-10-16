import { useEffect, useState } from "react";

export type ListingView = "grid" | "list";

export function applyListingView(params: URLSearchParams, view: ListingView) {
  if (view === "list") params.set("view", "list");
  else params.delete("view");
  return params;
}

function readView(url: URL): ListingView {
  return url.searchParams.get("view") === "list" ? "list" : "grid";
}

export function useListingView(url: URL) {
  const [view, setView] = useState<ListingView>(() => readView(url));
  useEffect(() => {
    const onBack = () => setView(readView(new URL(window.location.href)));
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  const changeView = (next: ListingView) => {
    setView(next);
    const current = new URL(window.location.href);
    applyListingView(current.searchParams, next);
    window.history.replaceState(
      null,
      "",
      current.pathname + current.search + current.hash,
    );
  };
  return [view, changeView] as const;
}
