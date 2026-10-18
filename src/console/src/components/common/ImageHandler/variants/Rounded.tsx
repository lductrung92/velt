import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
}

// Rounded-rectangle preview frame. Border-radius mapped to the shadcn
// `--radius` token (default 0.5rem) so rebranding the radius shifts every
// preview tile in lockstep with cards/buttons. Like `Circle`, the frame
// itself is NOT `overflow-hidden`: that would clip the corner-pinned
// action buttons. ImageUpload wraps the <img> separately.
export function Rounded({ width, height, children, className }: Props) {
  return (
    <div
      className={cn(
        "relative isolate inline-block rounded-lg bg-muted",
        className,
      )}
      style={{ width, height }}
    >
      {children}
    </div>
  );
}
