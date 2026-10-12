import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

interface Props {
  /** Unique id, so the label points at the control it describes. */
  id: string;
  label: string;
  /** The input itself, already bound by the caller. */
  children: ReactNode;
  /** Lets a screen give one field the same treatment its own form gives it. */
  className?: string;
}

/**
 * One translatable field.
 *
 * It shows no copy of the source text: with the whole panel rendered in the
 * language being written, a Vietnamese line under every box turned the form
 * into two languages at once, which is what made it easy to misread. The source
 * is still on screen for the one field where it matters — the body, side by
 * side with its translation.
 */
export function TranslatedField({ id, label, children, className }: Props) {
  return (
    <div className={className}>
      {/* A plain Label, not FormLabel: these inputs live outside the article's
          react-hook-form, and FormLabel reads a FormField context that is not
          there. */}
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
