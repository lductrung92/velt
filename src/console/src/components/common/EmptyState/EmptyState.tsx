import { Inbox, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Generic empty state — icon + headline + optional description + optional CTA.
// Standard shape (docs/styles/console/layout §4): defaults to an Inbox icon and
// the "no data" headline so simple lists need no props.
interface EmptyStateProps {
  icon?: LucideIcon;
  /** Defaults to common.empty_state.default_title. */
  title?: string;
  description?: ReactNode;
  /** Custom CTA; takes precedence over `onAdd`. */
  action?: ReactNode;
  /** Renders the standard "Add new" primary button when provided (no `action`). */
  onAdd?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  onAdd,
  className,
}: EmptyStateProps) {
  const { t } = useTranslation();
  const cta =
    action ??
    (onAdd ? (
      <Button type="button" onClick={onAdd}>
        <Plus className="size-4" />
        {t("common.add_new")}
      </Button>
    ) : null);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {title ?? t("common.empty_state.default_title")}
        </p>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {cta && <div className="pt-1">{cta}</div>}
    </div>
  );
}
