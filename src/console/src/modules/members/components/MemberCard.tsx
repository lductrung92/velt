import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Member } from "../services/members.service";

interface MemberCardProps {
  member: Member;
  canManage: boolean;
  onEdit: (id: string) => void;
  onDelete: (member: Member) => void;
}

// One member in the roster: portrait, name, role, skills. Hidden members stay in
// the list (dimmed + labelled) rather than disappearing — the console is where
// you go to un-hide them.
export function MemberCard({
  member,
  canManage,
  onEdit,
  onDelete,
}: MemberCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.id, disabled: !canManage });

  const initials = member.full_name
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-background p-3",
        isDragging && "opacity-50",
        !member.is_active && "opacity-60",
      )}
      data-testid="member-card"
    >
      {canManage && (
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

      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium text-muted-foreground">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="size-full object-cover" />
        ) : (
          initials
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{member.full_name}</span>
          {!member.is_active && (
            <Badge variant="secondary">{t("members.hidden")}</Badge>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {member.role || t("members.no_role")}
        </p>
        {member.skills.length > 0 && (
          <p className="mt-1 truncate text-xs text-muted-foreground/80">
            {member.skills.join(" · ")}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("common.edit")}
          onClick={() => onEdit(member.id)}
        >
          <Pencil className="size-4" />
        </Button>
        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("common.delete")}
            onClick={() => onDelete(member)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
