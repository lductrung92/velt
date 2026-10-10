import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  width: number; // = radius * 2 (square)
  /** Children: <img> + overlay actions injected by ImageUpload. */
  children: ReactNode;
  className?: string;
}

// Circular preview frame. Positioned `relative` so overlay action buttons
// can pin themselves absolutely inside. The frame is NOT `overflow-hidden`
// — that would clip the action buttons (which pin to the square corners)
// to the circle and the user only sees a sliver of the icon. The caller
// (ImageUpload) wraps just the <img> in its own `overflow-hidden
// rounded-full` div so the photo is round-clipped while buttons stay free.
export function Circle({ width, children, className }: Props) {
  return (
    <div
      className={cn("relative inline-block rounded-full bg-muted", className)}
      style={{ width, height: width }}
    >
      {children}
    </div>
  );
}
