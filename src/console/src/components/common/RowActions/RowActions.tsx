import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The action cell of a list row.
 *
 * Every table ends in the same cell — a pencil, sometimes a third verb, and a
 * red bin — so it is built once here. Before this, eight screens each wrote the
 * eight-line ghost button by hand and five stylesheets held a byte-identical
 * copy of the same flex rule, which is how two of them drifted onto the wrong
 * red and three others answered with a kebab menu instead.
 *
 * The red is `--destructive-ink`, never `--destructive`: the latter is a FILL
 * tuned against white text and measures 3.76:1 in light and 2.03:1 in dark, so
 * a bin icon painted with it disappears into a dark background.
 */
export function RowActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("row-actions", className)}>{children}</div>;
}

export function RowAction({
  icon: Icon,
  label,
  to,
  onClick,
  destructive,
  disabled,
  pressed,
}: {
  icon: LucideIcon;
  /** Already translated: it is both the accessible name and the tooltip. */
  label: string;
  /** Navigates instead of calling back — the edit pencil, usually. */
  to?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** For an action that is on or off — an eye, a pin. Omit for a plain verb. */
  pressed?: boolean;
}) {
  const glyph = (
    <Icon
      className={cn("size-4", destructive && "text-destructive-ink")}
      aria-hidden
    />
  );
  if (to) {
    return (
      <Button asChild variant="ghost" size="icon">
        <Link to={to} aria-label={label} title={label}>
          {glyph}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {glyph}
    </Button>
  );
}
