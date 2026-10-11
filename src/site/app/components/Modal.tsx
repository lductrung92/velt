import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({
  id,
  titleId,
  eyebrow,
  onClose,
  children,
}: {
  id: string;
  titleId: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.querySelector<HTMLElement>(`#${titleId}`)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      active?.focus({ preventScroll: true });
    };
  }, [titleId]);
  return (
    <dialog
      ref={dialog}
      id={id}
      className={id === "brief-dialog" ? "brief-dialog" : "detail-dialog"}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="dialog-top">
        <span className="dialog-eyebrow">{eyebrow}</span>
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="Đóng cửa sổ"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
