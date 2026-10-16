import type { LucideIcon } from "lucide-react";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The head of every modal in the console, in one shape:
 *
 *     {icon} {what this does}
 *     {what it does it to}
 *
 * The first line is the ACTION ("Thiết lập", "Sửa người dùng"), the second the
 * SUBJECT it acts on ("Danh sách bài viết", a user's name). Before this, each
 * dialog wrote its own title and the two were run together into one sentence,
 * so a glance could not separate "what is about to happen" from "to what".
 *
 * Confirm dialogs keep their own centred layout: they ask a question rather
 * than open a form, and the question IS the content.
 */
export function ModalHeader({
  icon: Icon,
  title,
  subject,
  className,
}: {
  icon?: LucideIcon;
  /** The action, e.g. "Thiết lập". */
  title: string;
  /** What is being acted on, e.g. the section or record name. */
  subject?: string;
  className?: string;
}) {
  return (
    <DialogHeader className={className}>
      <DialogTitle className="flex items-center gap-2">
        {Icon && (
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        {title}
      </DialogTitle>
      {subject && <DialogDescription>{subject}</DialogDescription>}
    </DialogHeader>
  );
}
