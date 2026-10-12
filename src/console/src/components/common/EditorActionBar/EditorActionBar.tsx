import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  /** Left slot — e.g. a back button. Omit when there's nothing to show. */
  left?: ReactNode;
  /**
   * Middle slot, held in the centre of the bar — for a control that belongs to
   * the whole document rather than to one side, such as a language switcher.
   */
  center?: ReactNode;
  /** Right slot — primary actions (Save …). */
  children: ReactNode;
  className?: string;
}

// Sticky offset = the app topbar height (h-14 = 56px). When the bar reaches that
// line it sticks flush under the topbar.
const STICKY_TOP_PX = 56;

// Horizontal inset of the resting card (px-3). The stuck bar re-adds it on top of
// the bleed so the buttons do not shift when the bar docks.
const RESTING_INSET_PX = 12;

// Full-width sticky action bar for the long editor pages.
//
// Two looks, toggled by an IntersectionObserver that detects the dock:
//   - resting: a bordered, rounded card with a gap below it;
//   - stuck: the background spans the whole content area while the buttons stay
//     on the same vertical lines they occupy at rest.
//
// The bleed is measured rather than written in CSS: <main> centres its children
// inside a max-width column, so the distance from the content column to the
// window edge depends on the viewport and on whether the sidebar is collapsed.
// Negative margins widen the bar by that distance and equal padding puts the
// contents back where they were.
export function EditorActionBar({ left, center, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [bleed, setBleed] = useState({ left: 0, right: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setStuck(entry.intersectionRatio < 1),
      { rootMargin: `-${STICKY_TOP_PX + 1}px 0px 0px 0px`, threshold: [1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    const main = el?.closest("main");
    if (!host || !main || typeof ResizeObserver === "undefined") return;
    // Measured off the parent, not the bar: the bar carries the negative margins
    // this computes, so reading it back would feed on its own output.
    const measure = () => {
      const h = host.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      // Kept fractional: rounding here shifts the buttons by a pixel when the
      // bar docks, which is exactly what the padding is meant to prevent.
      setBleed({
        left: Math.max(0, h.left - m.left),
        right: Math.max(0, m.right - h.right),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-14 z-10 mb-4"
      style={
        stuck
          ? { marginLeft: -bleed.left, marginRight: -bleed.right }
          : undefined
      }
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 py-3 backdrop-blur",
          stuck
            ? // Same 1px box as at rest, only the bottom edge painted — drop the
              // side borders outright and the buttons shift a pixel each way.
              "border border-transparent border-b-border bg-background"
            : "rounded-md border bg-background/95 px-3",
          className,
        )}
        style={
          stuck
            ? {
                paddingLeft: bleed.left + RESTING_INSET_PX,
                paddingRight: bleed.right + RESTING_INSET_PX,
              }
            : undefined
        }
      >
        {/* From lg up the side groups share the leftover space equally
            (flex-1 basis-0), which is what holds the middle slot dead centre
            however wide the back button or the actions happen to be. Below that
            the centre drops to a row of its own: making the sides flexible on a
            narrow bar collapses them to nothing while the buttons inside keep
            their width, and the middle slot lands on top of them. */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            center && "lg:flex-1 lg:basis-0",
          )}
        >
          {left}
        </div>
        {center && (
          <div className="order-last flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:shrink-0">
            {center}
          </div>
        )}
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            center && "lg:flex-1 lg:basis-0 lg:justify-end",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
