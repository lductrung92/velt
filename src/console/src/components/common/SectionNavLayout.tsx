import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface NavSection {
  id: string;
  label: string;
}

interface Props {
  sections: NavSection[];
  /** Section cards — each wrapped in an element carrying the matching `id`. */
  children: ReactNode;
  /** Sticky top offset for the rail (Tailwind class). Clears the app's sticky
   *  header (h-14 / 56px) by default so the rail pins just below it. */
  stickyClass?: string;
  className?: string;
}

// Two-pane form layout (visual ref: "Cài đặt hệ thống" / SystemSettings): a
// sticky left rail of section links over a single scrolling content column.
// Clicking a link smooth-scrolls to `#<id>`; a scroll-spy tracks the section in
// view and highlights its link. Unlike tabs, every section stays mounted — the
// content is ONE form with one Save.
export function SectionNavLayout({
  sections,
  children,
  stickyClass = "md:top-[4.5rem]",
  className,
}: Props) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  // Scroll-spy. Guarded for jsdom/SSR where IntersectionObserver is absent.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const topMost = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (topMost) setActive(topMost.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  function go(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    setActive(id);
  }

  return (
    <div className={cn("flex flex-col gap-6 md:flex-row", className)}>
      <nav
        aria-label="sections"
        className={cn(
          "flex w-full gap-0 overflow-x-auto md:h-fit md:w-44 md:shrink-0 md:flex-col md:gap-0.5 md:overflow-visible",
          "md:sticky md:self-start",
          stickyClass,
        )}
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            aria-current={active === s.id ? "true" : undefined}
            className={cn(
              "group relative h-auto justify-start whitespace-nowrap rounded-none px-3 py-2 text-left text-sm font-normal text-muted-foreground transition-colors hover:text-foreground md:w-full",
              active === s.id && "font-medium text-foreground",
            )}
          >
            <span className="truncate">{s.label}</span>
            {/* Active accent: underline on mobile, left bar on desktop. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bg-primary opacity-0 transition-opacity",
                "bottom-0 left-3 right-3 h-0.5",
                "md:bottom-auto md:left-0 md:right-auto md:top-0 md:h-full md:w-0.5",
                active === s.id && "opacity-100",
              )}
            />
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">{children}</div>
    </div>
  );
}
