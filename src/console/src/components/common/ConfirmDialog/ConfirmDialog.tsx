import { Check, Trash2, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Alert } from "@/components/common/Alert";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Confirm-before-action modal built on AlertDialog (role="alertdialog", focus
// trap) — the correct primitive for destructive/sensitive prompts. Controlled:
// the confirm uses a plain Button (no Radix auto-close) so it stays OPEN on
// error; the caller closes only on success.
//
// Cancel always carries the universal ✕ affordance. The confirm button shows a
// sensible default icon (Trash2 when destructive, Check otherwise); callers pass
// `confirmIcon` to express a more specific action (LogOut for revoke, Send for
// "send mail", …).
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmIcon: ConfirmIcon,
  destructive = false,
  loading = false,
  error = null,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmIcon?: LucideIcon;
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  // Optional extra content (e.g. a note field) rendered between the prompt and
  // the action buttons.
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const Icon = ConfirmIcon ?? (destructive ? Trash2 : Check);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          {/* The icon states the consequence before the words do, and it is the
              same glyph as the confirm button so the two read as one action.
              Tinted rather than solid: a filled red disc competes with the
              button that actually does the deleting. */}
          <span
            className={cn(
              "mx-auto grid size-12 place-items-center rounded-full",
              destructive
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
            )}
            aria-hidden
          >
            <Icon className="size-6" />
          </span>
          <AlertDialogTitle className="sm:text-center">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        {error && <Alert variant="danger" message={error} />}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            {t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            loading={loading}
            onClick={onConfirm}
          >
            <Icon className="size-4" />
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
