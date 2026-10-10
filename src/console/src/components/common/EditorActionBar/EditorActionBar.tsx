import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  /** Left slot — e.g. a back button. Omit when there's nothing to show. */
  left?: ReactNode;
  /** Right slot — primary actions (Save …). */
  children: ReactNode;
  className?: string;
}

// Sticky offset = the app topbar height (h-14 = 56px). When the bar reaches that
// line it sticks flush under the topbar.
const STICKY_TOP_PX = 56;

// Full-width sticky action bar for the long editor pages (CMS article + category
// editors). Lives at the top of the form; on scroll it docks under the topbar.
//
// Two looks, toggled by an IntersectionObserver that detects the dock:
//   - resting: a bordered, rounded card with a gap below it;
//   - stuck: full-bleed across the whole content area (negative margins cancel
//     <main>'s px-4 / sm:px-6), flush left/right, only a bottom border.
export function EditorActionBar({ left, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

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

  return (
    <div
      ref={ref}
      className={cn(
        "sticky top-14 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 backdrop-blur",
        stuck
          ? "-mx-4 rounded-none border-b bg-background px-4 py-3 sm:-mx-6 sm:px-6"
          : "rounded-md border bg-background/95 px-3 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
