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
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[26rem] gap-5 p-6">
        <AlertDialogHeader className="items-center space-y-3 text-center sm:text-center">
          {/* The icon states the consequence before the words do, and it is the
              same glyph as the confirm button so the two read as one action.
              The soft outer ring gives the badge depth without a hard edge; a
              solid disc would compete with the button that does the deleting. */}
          <span
            className={cn(
              // mb-3 on top of the header's own space-y-3: the ring is a
              // box-shadow, so it paints 8px OUTSIDE the layout box and the
              // measured 12px gap is only 4px of actual air under the badge.
              "mb-3 grid size-12 place-items-center rounded-full ring-8",
              destructive
                ? "bg-destructive/10 text-destructive ring-destructive/5"
                : "bg-primary/10 text-primary ring-primary/5",
            )}
            aria-hidden
          >
            <Icon className="size-6" />
          </span>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            /* Centred with the rest: the icon sets a centre axis, and a
               left-aligned paragraph under it leaves the block looking like two
               unrelated halves. The width cap makes two lines break evenly
               instead of one long and one short. */
            <AlertDialogDescription className="max-w-[20rem] leading-relaxed">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        {error && <Alert variant="danger" message={error} />}
        {/* The shared footer's own layout: the way out on the far left, the
            action on the far right, as far apart as the box allows. Nobody
            reaches for Xoa while aiming for Huy. */}
        <AlertDialogFooter>
          <Button
            variant="outline"
            className="sm:min-w-28"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            {t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="sm:min-w-28"
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
