import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { RowAction, RowActions } from "@/components/common/RowActions";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/utils/fileUrl";

import type { Member } from "../services/members.service";

// One member in the roster. Mirrors ProductCategoryRow so the two reorderable
// list screens behave and read the same way.
//
// Hidden members stay in the list — dimmed and labelled — rather than
// disappearing: the console is where you go to un-hide them.
export function MemberRow({
  member,
  canManage,
  reorderable = true,
  onEdit,
  onDelete,
}: {
  member: Member;
  canManage: boolean;
  /** Show the drag handle. Off while the list is filtered/sorted (reordering
   *  by sort_order is meaningless there). */
  reorderable?: boolean;
  onEdit: (id: string) => void;
  onDelete: (member: Member) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.id, disabled: !canManage || !reorderable });

  const initials = member.full_name
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-50", !member.is_active && "opacity-60")}
      data-testid="member-row"
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {canManage && reorderable && (
            <button
              type="button"
              aria-label={t("members.reorder")}
              title={t("members.reorder")}
              className="cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {member.avatar_url ? (
              <img
                src={fileUrl(member.avatar_url)}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          <span className="truncate">{member.full_name}</span>
          {!member.is_active && (
            <Badge variant="secondary">{t("members.hidden")}</Badge>
          )}
        </div>
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">
        {member.role || t("members.no_role")}
      </TableCell>

      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
        {member.skills.length > 0 ? member.skills.join(" · ") : "—"}
      </TableCell>

      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
        {member.sort_order}
      </TableCell>

      <TableCell className="text-right">
        <RowActions>
          <RowAction
            icon={Pencil}
            label={t("common.edit")}
            onClick={() => onEdit(member.id)}
          />
          {canManage && (
            <RowAction
              destructive
              icon={Trash2}
              label={t("common.delete")}
              onClick={() => onDelete(member)}
            />
          )}
        </RowActions>
      </TableCell>
    </TableRow>
  );
}
