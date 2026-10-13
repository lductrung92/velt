import * as React from "react";

/**
 * Confirms before a dialog with unsaved input is dismissed.
 *
 * Closing a dialog is not a navigation, so `useBlocker` never sees it — a
 * modal form could lose everything to a stray Escape with nothing in its way.
 * Radix funnels all three exits (the ✕, Escape, a click on the overlay)
 * through `onOpenChange(false)`, so intercepting that one call covers them.
 *
 * Opening is never blocked; only dismissal while `when` is true.
 *
 *   const { dialogProps, confirmProps } = useDialogDismissGuard({
 *     when: form.formState.isDirty,
 *     onClose: () => setOpen(false),
 *   });
 *   <Dialog open={open} {...dialogProps}>…</Dialog>
 *   <ConfirmDialog {...confirmProps} title={…} confirmLabel={…} />
 */
export function useDialogDismissGuard({
  when,
  onClose,
}: {
  when: boolean;
  /** Actually close the dialog — called once the user confirms, or at once
   *  when there is nothing to lose. */
  onClose: () => void;
}) {
  const [asking, setAsking] = React.useState(false);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) return; // opening needs no permission
      if (when) {
        setAsking(true);
        return;
      }
      onClose();
    },
    [when, onClose],
  );

  const discard = React.useCallback(() => {
    setAsking(false);
    onClose();
  }, [onClose]);

  return {
    /** Spread onto the Dialog/AlertDialog root. */
    dialogProps: { onOpenChange: handleOpenChange },
    /** Spread onto the ConfirmDialog that asks the question. */
    confirmProps: {
      open: asking,
      onOpenChange: (open: boolean) => {
        // Dismissing the question means "I did not mean to close" — keep the
        // form open, which is the recoverable answer.
        if (!open) setAsking(false);
      },
      onConfirm: discard,
    },
  };
}
