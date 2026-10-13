import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * The shape every settings tab is built from.
 *
 * One layout, used by all of them, because a settings screen whose tabs look
 * different teaches the reader that each tab is its own program. A section is a
 * card with a heading; a row inside it is a label and its help on the left and
 * the control on the right, on one grid so every control in every tab starts at
 * the same x — which is the thing the eye actually reads as "tidy".
 *
 * Below the `sm` breakpoint the two columns stack, because a 17rem label column
 * on a phone leaves no room for the control it describes.
 */

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  footer,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  /** An action that belongs to this section (a test button, say). */
  footer?: ReactNode;
}) {
  return (
    <Card>
      {/* The card's own py-3 is sized for a title alone; with a description
          under it the text ends up against the border, so this header breathes
          a little more. */}
      <CardHeader className="gap-1.5 py-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          {Icon && (
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          {title}
        </CardTitle>
        {description && (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-1">
        <div className="divide-y divide-border/60">{children}</div>
        {footer && <div className="mt-4 border-t pt-4">{footer}</div>}
      </CardContent>
    </Card>
  );
}

export function SettingRow({
  id,
  label,
  help,
  badge,
  children,
}: {
  /** The control's id, so the label is clickable. */
  id: string;
  label: string;
  help?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-8 gap-y-2 py-4 first:pt-1 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:items-start">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="text-sm font-medium leading-6">
            {label}
          </Label>
          {badge}
        </div>
        {help && (
          <p className="text-xs leading-5 text-muted-foreground">{help}</p>
        )}
      </div>
      <div className="min-w-0 sm:pt-0.5">{children}</div>
    </div>
  );
}
